// Run: npx tsx src/lib/inbound-media.test.ts
// Texted-in media (MMS) filing, with a fake fetch, a fake store and fake
// storage. No network, database or storage is touched.
import assert from "node:assert/strict";
import {
  harvestMedia, leadsMatchingPhone, mediaClaimable, mediaEventId, mediaPath, mediaUrlProblem,
  processInboundMedia, resolveInboundMedia, safeFetchMedia, smsDirection, sniffType, supabaseMediaStore,
  MEDIA_LEASE_MS,
  type MediaAudit, type MediaDeps, type MediaLead, type MediaRow, type MediaStore, type NewMediaDocument,
} from "./inbound-media";

let passed = 0;
const tests: [string, () => Promise<void> | void][] = [];
const t = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

// ---- fakes -----------------------------------------------------------------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");

type Handler = (url: string, init: any) => Promise<Response> | Response;
function fakeFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: string[] = [];
  const f = async (url: string, init?: any) => {
    calls.push(url);
    assert.equal(init?.redirect, "manual", "redirects are followed by hand");
    const h = routes[url];
    if (!h) throw new Error(`unexpected fetch ${url}`);
    const one = Array.isArray(h) ? h.shift() : h;
    if (!one) throw new Error(`no more responses for ${url}`);
    return one(url, init);
  };
  return { f, calls };
}
const ok = (bytes: Uint8Array, type = "image/jpeg") => () => new Response(bytes as unknown as BodyInit, { status: 200, headers: { "content-type": type } });
const status = (code: number) => () => new Response("nope", { status: code });
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

class FakeStore implements MediaStore {
  rows = new Map<string, MediaRow>();
  leads: (MediaLead & { phone_norm?: string })[] = [];
  objects = new Map<string, Uint8Array>();
  docs: (NewMediaDocument & { id: string })[] = [];
  audits: MediaAudit[] = [];
  removed: string[] = [];
  failInsert = false;
  failRemove = false;
  seq = 0;
  clock: () => Date;
  constructor(clock: () => Date) { this.clock = clock; }

  async insertRows(rows: any[]) {
    for (const r of rows) {
      const exists = [...this.rows.values()].some((x) => x.provider === r.provider && x.event_id === r.event_id && x.media_key === r.media_key);
      if (exists) continue; // on conflict do nothing
      const id = `row-${++this.seq}`;
      const at = this.clock().toISOString();
      this.rows.set(id, {
        id, lead_id: null, firm_id: null, attempts: 0, last_error: null, candidates: null, document_id: null,
        storage_path: null, resolved_by: null, created_at: at, updated_at: at, ...r,
      });
    }
    return {};
  }
  async loadRows(provider: string, eventId: string) {
    return { rows: [...this.rows.values()].filter((r) => r.provider === provider && r.event_id === eventId).map((r) => ({ ...r })) };
  }
  async getRow(id: string) { const r = this.rows.get(id); return { row: r ? { ...r } : null }; }
  async claimRow(row: MediaRow, patch: Partial<MediaRow>, nowIso: string) {
    const cur = this.rows.get(row.id);
    if (!cur || cur.status !== row.status || cur.attempts !== row.attempts) return { claimed: false };
    Object.assign(cur, patch, { status: "pending", attempts: row.attempts + 1, updated_at: nowIso });
    return { claimed: true };
  }
  async finishRow(id: string, attempts: number, patch: Partial<MediaRow>, nowIso: string) {
    const cur = this.rows.get(id);
    if (!cur || cur.status !== "pending" || cur.attempts !== attempts) return { error: "another delivery took this attachment over" };
    Object.assign(cur, patch, { updated_at: nowIso });
    return {};
  }
  async leadsForPhone(norm: string) { return { leads: this.leads.filter((l) => l.phone_norm === norm && !l.archived_at) }; }
  async getLead(id: string) { return { lead: this.leads.find((l) => l.id === id) ?? null }; }
  async findDocument(path: string) { return { id: this.docs.find((d) => d.storage_path === path)?.id ?? null }; }
  async upload(path: string, bytes: Uint8Array) { this.objects.set(path, bytes); return {}; }
  async remove(path: string) {
    this.removed.push(path);
    if (this.failRemove) return { error: "storage unavailable" };
    this.objects.delete(path);
    return {};
  }
  async insertDocument(doc: NewMediaDocument) {
    if (this.failInsert) return { error: "case_documents: storage path does not belong to this lead" };
    const id = `doc-${this.docs.length + 1}`;
    this.docs.push({ ...doc, id });
    return { id };
  }
  async audit(e: MediaAudit) { this.audits.push(e); }
  byKey(key: string) { return [...this.rows.values()].find((r) => r.media_key === key)!; }
}

let now = new Date("2026-09-28T15:00:00Z");
const clock = () => now;
const LEAD_A: MediaLead & { phone_norm: string } = { id: "lead-1", lead_no: "TMP-101", name: "Pat Doe", firm_id: "firm-a", firm: "TMP", phone_norm: "7025551234" };
const LEAD_B: MediaLead & { phone_norm: string } = { id: "lead-2", lead_no: "TMT-202", name: "Sam Doe", firm_id: "firm-b", firm: "TMT", phone_norm: "7025551234" };

function deps(store: FakeStore, f: MediaDeps["fetch"], extra: Partial<MediaDeps> = {}): MediaDeps {
  return { store, fetch: f, now: clock, timeoutMs: 2000, ...extra };
}
const item = (key: string, url: string) => ({ key, url, declaredType: "image/jpeg" });

// ---- link safety ------------------------------------------------------------

t("private, loopback, link-local, raw IP and non-https links are refused before any fetch", async () => {
  const bad = [
    "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "https://[::1]/a.jpg", "https://169.254.169.254/latest",
    "https://10.0.0.5/x.jpg", "https://2130706433/x", "https://0x7f.1/x", "http://cdn.example.com/a.jpg",
    "https://printer/a.jpg", "https://db.internal/x", "https://nas.local/x", "https://cdn.example.com:8443/x",
    "https://user:pw@cdn.example.com/x", "ftp://cdn.example.com/x", "not a url",
  ];
  const { f, calls } = fakeFetch({});
  for (const u of bad) {
    assert.ok(mediaUrlProblem(u), `refused: ${u}`);
    const r = await safeFetchMedia(u, { fetch: f });
    assert.equal(r.ok, false);
    assert.equal((r as any).status, "rejected", u);
  }
  assert.equal(calls.length, 0, "nothing was fetched");
  assert.equal(mediaUrlProblem("https://media.justcall.io/a.jpg"), null);
  assert.equal(mediaUrlProblem("https://media.justcall.io/a.jpg", ["justcall.io"]), null);
  assert.match(String(mediaUrlProblem("https://cdn.example.com/a.jpg", ["justcall.io"])), /texting provider/);
});

t("a redirect to a private host is refused and never fetched", async () => {
  const { f, calls } = fakeFetch({ "https://cdn.example.com/a.jpg": redirect("https://169.254.169.254/latest/meta-data") });
  const r = await safeFetchMedia("https://cdn.example.com/a.jpg", { fetch: f });
  assert.equal(r.ok, false);
  assert.equal((r as any).status, "rejected");
  assert.match((r as any).reason, /redirect was refused/);
  assert.deepEqual(calls, ["https://cdn.example.com/a.jpg"]);
});

t("safe redirects are followed by hand, at most two", async () => {
  const two = fakeFetch({
    "https://a.example.com/x": redirect("/y"),
    "https://a.example.com/y": redirect("https://b.example.com/z"),
    "https://b.example.com/z": ok(JPEG),
  });
  const r = await safeFetchMedia("https://a.example.com/x", { fetch: two.f });
  assert.equal(r.ok, true);
  assert.equal(two.calls.length, 3);
  const three = fakeFetch({
    "https://a.example.com/1": redirect("https://a.example.com/2"),
    "https://a.example.com/2": redirect("https://a.example.com/3"),
    "https://a.example.com/3": redirect("https://a.example.com/4"),
  });
  const r3 = await safeFetchMedia("https://a.example.com/1", { fetch: three.f });
  assert.equal((r3 as any).status, "rejected");
  assert.match((r3 as any).reason, /too many times/);
  assert.equal(three.calls.length, 3, "the fourth hop is never requested");
});

t("an oversize download is aborted mid-stream", async () => {
  let pulled = 0;
  let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024);
  const stream = new ReadableStream<Uint8Array>({
    pull(c) { pulled++; c.enqueue(chunk); },
    cancel() { cancelled = true; },
  });
  const { f } = fakeFetch({ "https://cdn.example.com/big.mp4": () => new Response(stream, { status: 200, headers: { "content-type": "video/mp4" } }) });
  const r = await safeFetchMedia("https://cdn.example.com/big.mp4", { fetch: f });
  assert.equal((r as any).status, "rejected");
  assert.match((r as any).reason, /larger than 15 MB/);
  assert.ok(pulled <= 18, `stopped reading near the cap (pulled ${pulled} MB)`);
  await new Promise((res) => setTimeout(res, 0));
  assert.ok(cancelled, "the body stream was cancelled");

  // A declared size over the cap is refused before reading anything.
  let read = false;
  const s2 = new ReadableStream<Uint8Array>({ pull(c) { read = true; c.enqueue(chunk); } }, { highWaterMark: 0 });
  const g = fakeFetch({ "https://cdn.example.com/b.jpg": () => new Response(s2, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(40 * 1024 * 1024) } }) });
  const r2 = await safeFetchMedia("https://cdn.example.com/b.jpg", { fetch: g.f });
  assert.equal((r2 as any).status, "rejected");
  assert.equal(read, false);
});

t("a type outside the allowlist is rejected; an unlabeled file is identified by its bytes", async () => {
  const { f } = fakeFetch({
    "https://cdn.example.com/page": ok(new TextEncoder().encode("<html>"), "text/html; charset=utf-8"),
    "https://cdn.example.com/raw.jpg": ok(JPEG, "application/octet-stream"),
    "https://cdn.example.com/raw.bin": ok(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "application/octet-stream"),
    "https://cdn.example.com/doc": ok(PDF, "application/pdf"),
  });
  const html = await safeFetchMedia("https://cdn.example.com/page", { fetch: f });
  assert.equal((html as any).status, "rejected");
  assert.match((html as any).reason, /text\/html are not accepted/);
  const raw = await safeFetchMedia("https://cdn.example.com/raw.jpg", { fetch: f });
  assert.equal(raw.ok && raw.contentType, "image/jpeg");
  const bin = await safeFetchMedia("https://cdn.example.com/raw.bin", { fetch: f });
  assert.equal((bin as any).status, "rejected");
  const pdf = await safeFetchMedia("https://cdn.example.com/doc", { fetch: f });
  assert.equal(pdf.ok && pdf.ext, "pdf");
  assert.equal(sniffType(new TextEncoder().encode("\0\0\0\x18ftypqt  ")), "video/quicktime");
  assert.equal(sniffType(new TextEncoder().encode("\0\0\0\x18ftypheic")), "image/heic");
});

t("a hung download times out as a retryable failure; HTTP errors are retryable", async () => {
  const hang = async (_u: string, init: any) => new Promise<Response>((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const r = await safeFetchMedia("https://cdn.example.com/slow.jpg", { fetch: hang, timeoutMs: 30 });
  assert.equal((r as any).status, "failed");
  assert.match((r as any).reason, /timed out/);
  const { f } = fakeFetch({ "https://cdn.example.com/gone.jpg": status(503) });
  const r2 = await safeFetchMedia("https://cdn.example.com/gone.jpg", { fetch: f });
  assert.equal((r2 as any).status, "failed");
  assert.match((r2 as any).reason, /HTTP 503/);
});

// ---- filing -------------------------------------------------------------------

t("one matching lead: stored under that firm and lead, document row created, then marked saved", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A];
  const { f } = fakeFetch({ "https://cdn.example.com/1.jpg": ok(JPEG) });
  const s = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt1", phone: "+1 (702) 555-1234", items: [item("1", "https://cdn.example.com/1.jpg")], occurredAt: "2026-09-27T21:00:00Z" });
  assert.deepEqual({ saved: s.saved, failed: s.failed, quarantined: s.quarantined, rejected: s.rejected }, { saved: 1, failed: 0, quarantined: 0, rejected: 0 });
  const path = "firm-a/lead-1/mms-evt1-1.jpg";
  assert.equal(mediaPath("firm-a", "lead-1", "evt1", "1", "jpg"), path);
  assert.ok(store.objects.has(path));
  assert.equal(store.docs.length, 1);
  assert.deepEqual({ ...store.docs[0], id: undefined }, {
    id: undefined, firm_id: "firm-a", lead_id: "lead-1", doc_type: "client_photo", file_name: "texted_in_2026-09-27_1.jpg",
    storage_path: path, uploaded_by: null, uploaded_by_name: "Texted in by the PNC",
  });
  const row = store.byKey("1");
  assert.equal(row.status, "saved");
  assert.equal(row.document_id, "doc-1");
  assert.equal(row.storage_path, path);
  assert.equal(row.lead_id, "lead-1");
  assert.equal(row.firm_id, "firm-a");
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].lead_id, "lead-1");
  assert.match(store.audits[0].description, /^Texted in 1 file, saved to Documents\.$/);
});

t("a refused document row removes the upload and marks the attachment failed", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A];
  store.failInsert = true;
  const { f } = fakeFetch({ "https://cdn.example.com/1.jpg": ok(JPEG) });
  const s = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt2", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] });
  assert.equal(s.saved, 0);
  assert.equal(s.failed, 1);
  assert.deepEqual(store.removed, ["firm-a/lead-1/mms-evt2-1.jpg"]);
  assert.equal(store.objects.size, 0, "no orphan bytes");
  const row = store.byKey("1");
  assert.equal(row.status, "failed");
  assert.equal(row.document_id, null);
  assert.equal(row.storage_path, null);
  assert.match(String(row.last_error), /could not add it to Documents/);
  assert.equal(store.audits.length, 0, "no saved-to-Documents audit");

  // If the clean-up itself fails, that is recorded, not hidden.
  const store2 = new FakeStore(clock);
  store2.leads = [LEAD_A];
  store2.failInsert = true;
  store2.failRemove = true;
  const g = fakeFetch({ "https://cdn.example.com/1.jpg": ok(JPEG) });
  await processInboundMedia(deps(store2, g.f), { provider: "justcall", eventId: "evt2", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] });
  assert.match(String(store2.byKey("1").last_error), /stored copy could not be removed/);
});

t("a repeat delivery retries the failed attachment and never re-downloads the saved one", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A];
  const { f, calls } = fakeFetch({
    "https://cdn.example.com/1.jpg": [ok(JPEG)],
    "https://cdn.example.com/2.pdf": [status(503), ok(PDF, "application/pdf")],
  });
  const ev = { provider: "justcall", eventId: "evt3", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg"), item("2", "https://cdn.example.com/2.pdf")] };
  const first = await processInboundMedia(deps(store, f), ev);
  assert.deepEqual({ saved: first.saved, failed: first.failed }, { saved: 1, failed: 1 });
  assert.equal(store.byKey("2").status, "failed");

  const second = await processInboundMedia(deps(store, f), ev);
  assert.deepEqual({ saved: second.saved, failed: second.failed }, { saved: 2, failed: 0 });
  assert.equal(calls.filter((u) => u.endsWith("1.jpg")).length, 1, "the saved attachment was downloaded once");
  assert.equal(calls.filter((u) => u.endsWith("2.pdf")).length, 2);
  assert.equal(store.docs.length, 2);
  assert.equal(store.byKey("2").attempts, 2);

  const third = await processInboundMedia(deps(store, f), ev);
  assert.equal(third.saved, 2);
  assert.equal(calls.length, 3, "nothing downloaded on the third delivery");
  assert.equal(store.docs.length, 2, "never filed twice");
});

t("an attachment another delivery is working on is left alone until its lease runs out", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A];
  await store.insertRows([{ provider: "justcall", event_id: "evt4", media_key: "1", media_url: "https://cdn.example.com/1.jpg", content_type: null, phone_norm: "7025551234", status: "pending" }]);
  const r = store.byKey("1");
  r.attempts = 1; r.updated_at = now.toISOString();
  const { f, calls } = fakeFetch({ "https://cdn.example.com/1.jpg": ok(JPEG) });
  const ev = { provider: "justcall", eventId: "evt4", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] };
  const s = await processInboundMedia(deps(store, f), ev);
  assert.equal(s.in_progress, 1);
  assert.equal(calls.length, 0);
  assert.equal(mediaClaimable(r, new Date(now.getTime() + MEDIA_LEASE_MS + 1000)), true);
  const later = new Date(now.getTime() + MEDIA_LEASE_MS + 1000);
  const s2 = await processInboundMedia({ ...deps(store, f), now: () => later }, ev);
  assert.equal(s2.saved, 1);
});

t("a number on several files is quarantined with its candidates and nothing is downloaded", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A, LEAD_B, { ...LEAD_A, id: "lead-9", archived_at: "2026-09-01T00:00:00Z" }];
  const { f, calls } = fakeFetch({});
  const s = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt5", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] });
  assert.equal(s.quarantined, 1);
  assert.equal(s.saved, 0);
  assert.equal(calls.length, 0);
  assert.equal(store.objects.size, 0);
  const row = store.byKey("1");
  assert.equal(row.status, "quarantined");
  assert.equal(row.lead_id, null);
  assert.deepEqual(row.candidates, [
    { id: "lead-1", lead_no: "TMP-101", name: "Pat Doe", firm_id: "firm-a", firm: "TMP" },
    { id: "lead-2", lead_no: "TMT-202", name: "Sam Doe", firm_id: "firm-b", firm: "TMT" },
  ]);
  // A later repeat does not guess either.
  const again = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt5", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] });
  assert.equal(again.quarantined, 1);
  assert.equal(calls.length, 0);
});

t("an unknown number is quarantined with no candidates and the media link kept", async () => {
  const store = new FakeStore(clock);
  const { f, calls } = fakeFetch({});
  const s = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt6", phone: "7029990000", items: [item("1", "https://cdn.example.com/x.jpg")] });
  assert.equal(s.quarantined, 1);
  assert.equal(calls.length, 0);
  const row = store.byKey("1");
  assert.deepEqual(row.candidates, []);
  assert.equal(row.media_url, "https://cdn.example.com/x.jpg");
  assert.equal(row.phone_norm, "7029990000");
});

t("an unsafe link in the payload is recorded as rejected, not dropped", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A];
  const { f, calls } = fakeFetch({});
  const s = await processInboundMedia(deps(store, f), { provider: "justcall", eventId: "evt7", phone: "7025551234", items: [item("1", "http://169.254.169.254/x")] });
  assert.equal(s.rejected, 1);
  assert.equal(calls.length, 0);
  assert.equal(store.byKey("1").status, "rejected");
  assert.match(String(store.byKey("1").last_error), /not https/);
});

// ---- staff resolve ------------------------------------------------------------

t("staff resolve files a quarantined attachment on the chosen lead and stamps who did it", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A, LEAD_B];
  const g = fakeFetch({ "https://cdn.example.com/1.jpg": ok(JPEG) });
  await processInboundMedia(deps(store, g.f), { provider: "justcall", eventId: "evt8", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] });
  const row = store.byKey("1");
  assert.equal(row.status, "quarantined");
  assert.equal(g.calls.length, 0);

  const out = await resolveInboundMedia(deps(store, g.f), { id: row.id, lead: LEAD_B, actor: { id: "user-7", name: "Brett" } });
  assert.equal(out.ok, true);
  const path = "firm-b/lead-2/mms-evt8-1.jpg";
  assert.equal(out.ok && out.storage_path, path);
  assert.ok(store.objects.has(path));
  const after = store.byKey("1");
  assert.equal(after.status, "saved");
  assert.equal(after.resolved_by, "user-7");
  assert.equal(after.lead_id, "lead-2");
  assert.equal(after.firm_id, "firm-b");
  assert.equal(store.docs[0].uploaded_by, "user-7");
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].actor, "user-7");
  assert.equal(store.audits[0].lead_id, "lead-2");
  assert.equal(store.audits[0].meta.previous_status, "quarantined");

  const again = await resolveInboundMedia(deps(store, g.f), { id: row.id, lead: LEAD_A, actor: { id: "user-7", name: "Brett" } });
  assert.equal(again.ok, false);
  assert.equal((again as any).code, "already_saved");
  assert.equal(g.calls.length, 1);
});

t("a resolve whose download fails keeps the staff choice for the next retry", async () => {
  const store = new FakeStore(clock);
  store.leads = [LEAD_A, LEAD_B];
  const g = fakeFetch({ "https://cdn.example.com/1.jpg": [status(500), ok(JPEG)] });
  const ev = { provider: "justcall", eventId: "evt9", phone: "7025551234", items: [item("1", "https://cdn.example.com/1.jpg")] };
  await processInboundMedia(deps(store, g.f), ev);
  const row = store.byKey("1");
  const out = await resolveInboundMedia(deps(store, g.f), { id: row.id, lead: LEAD_B, actor: { id: "user-7", name: "Brett" } });
  assert.equal(out.ok, false);
  assert.equal((out as any).code, "failed");
  assert.equal(store.byKey("1").status, "failed");
  // The number is still on two files, but the retry keeps to the choice.
  const s = await processInboundMedia(deps(store, g.f), ev);
  assert.equal(s.saved, 1);
  assert.ok(store.objects.has("firm-b/lead-2/mms-evt9-1.jpg"));
});

// ---- payload + matching helpers -------------------------------------------------

t("numbers match exactly on every phone column, archived files never", () => {
  const rows = [
    { id: "a", phone_norm: "7025551234" },
    { id: "b", phone_norm: "", phone_alt: "(702) 555-1234" },
    { id: "c", phone_norm: "", home_phone: "+1 702.555.1234" },
    { id: "d", phone_norm: "", work_phone: "702-555-12345" },
    { id: "e", phone_norm: "7025551234", archived_at: "2026-09-01" },
    { id: "f", phone_norm: "7025559999" },
  ];
  assert.deepEqual(leadsMatchingPhone(rows, "7025551234").map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(leadsMatchingPhone(rows, "555"), []);
});

t("text direction: Outgoing is outbound even though it contains 'in'", () => {
  assert.equal(smsDirection("sms", "Outgoing"), "outbound");
  assert.equal(smsDirection("sms", "Incoming"), "inbound");
  assert.equal(smsDirection("sms.received", ""), "inbound");
  assert.equal(smsDirection("sms.sent", "Incoming"), "outbound");
  assert.equal(smsDirection("message.created", ""), "outbound");
});

t("attachments are harvested with stable keys; the event id falls back to a fingerprint", async () => {
  const d = { id: 555, sms_info: { mms: [{ media_url: "https://a.example.com/1.jpg", content_type: "image/jpeg" }, "https://a.example.com/2.png", { url: "https://a.example.com/1.jpg" }] }, media: [{ id: "m-9", link: "https://a.example.com/3.pdf" }] };
  const h = harvestMedia(d);
  assert.deepEqual(h.items.map((i) => i.key), ["1", "2", "id-m-9"]);
  assert.equal(h.items[0].declaredType, "image/jpeg");
  assert.equal(await mediaEventId(d, h.items), "555");
  const noId = { contact_number: "7025551234", sms_date: "2026-09-28", sms_time: "10:00:00" };
  const a = await mediaEventId(noId, h.items);
  assert.match(a, /^h-[0-9a-f]{32}$/);
  assert.equal(await mediaEventId(noId, h.items), a);
  const many = harvestMedia({ mms: Array.from({ length: 12 }, (_, i) => `https://a.example.com/${i}.jpg`) });
  assert.equal(many.items.length, 10);
  assert.equal(many.ignored, 2);
});

// ---- live adapter query shape (recording fake client) ----------------------------

t("the live adapter excludes archived leads and claims rows with compare-and-set", async () => {
  const log: any[] = [];
  const chain = (table: string, result: any) => {
    const q: any = {};
    for (const m of ["select", "eq", "is", "or", "limit", "in", "update", "order"]) q[m] = (...a: any[]) => { log.push([table, m, ...a]); return q; };
    q.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return q;
  };
  const admin = {
    from: (table: string) => chain(table, table === "leads"
      ? { data: [
          { id: "l1", firm_id: "f1", lead_no: "TMP-1", full_name: "A B", claimant_name: null, archived_at: null, phone_norm: "", phone_alt: "702 555 1234", firms: { name: "TMP" } },
          { id: "l2", firm_id: "f1", lead_no: "TMP-2", full_name: "C D", claimant_name: null, archived_at: null, phone_norm: "", phone_alt: "702 555 12345" },
        ], error: null }
      : { data: [{ id: "r1" }], error: null }),
  };
  const store = supabaseMediaStore(admin, async () => {});
  const got = await store.leadsForPhone("7025551234");
  assert.deepEqual(got.leads.map((l) => [l.id, l.firm, l.name]), [["l1", "TMP", "A B"]]);
  assert.ok(log.some((c) => c[0] === "leads" && c[1] === "is" && c[2] === "archived_at" && c[3] === null));
  const or = log.find((c) => c[0] === "leads" && c[1] === "or");
  assert.equal(or[2], "phone_norm.eq.7025551234,phone_alt.like.*702*555*1234*,home_phone.like.*702*555*1234*,work_phone.like.*702*555*1234*");

  log.length = 0;
  const claimed = await store.claimRow({ id: "r1", status: "failed", attempts: 2 } as MediaRow, {}, "2026-09-28T00:00:00Z");
  assert.equal(claimed.claimed, true);
  assert.deepEqual(log.filter((c) => c[1] === "eq").map((c) => [c[2], c[3]]), [["id", "r1"], ["status", "failed"], ["attempts", 2]]);
  const upd = log.find((c) => c[1] === "update");
  assert.deepEqual(upd[2], { status: "pending", attempts: 3, updated_at: "2026-09-28T00:00:00Z" });
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log("ok", name); }
    catch (e) { console.error("FAIL", name); throw e; }
  }
  console.log(passed, "passed");
})().catch((e) => { console.error(e); process.exit(1); });
