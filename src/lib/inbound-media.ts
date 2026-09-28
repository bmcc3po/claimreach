// ============================================================================
// Texted-in media (MMS). ONE definition of how a picture or document that
// arrives by text gets filed onto a case (Brett, Sep 28: global, every
// campaign). The JustCall webhook and the staff review route both run the
// same path below; nothing else downloads or files inbound media.
//
// Each attachment is its own inbound_media row (migration 0108), keyed by
// provider + event + attachment, so filing is retried independently of the
// message de-duplication and never double-files:
//   pending      new, or being worked on right now (attempts > 0, fresh lease)
//   saved        stored in case-docs AND a case_documents row exists
//   failed       a transient problem; a repeat delivery or staff can retry it
//   quarantined  zero or several files have the sender's number; staff pick
//   rejected     unsafe link, file too big, or a type we do not accept
//
// Matching is deliberately stricter than the message log's attribution in
// comms.ts (which files a text on the newest matching lead): a sensitive
// attachment is only filed automatically when exactly ONE non-archived lead
// has the sender's number. Anything else waits for a person (Astra round 6).
// ============================================================================

import { normPhone } from "@/lib/comms";

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const MEDIA_TIMEOUT_MS = 15_000;
export const MEDIA_MAX_REDIRECTS = 2;
export const MEDIA_MAX_PER_EVENT = 10;
// A pending row that has been claimed (attempts > 0) belongs to the delivery
// working on it for this long. A worst-case attempt (three hops at the
// timeout plus the upload) finishes well inside it; after it, the row counts
// as abandoned and the next delivery or staff member may take it over.
export const MEDIA_LEASE_MS = 120_000;

// The only file types we keep, and the extension each is stored under.
export const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const TYPE_ALIASES: Record<string, string> = { "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg" };
// A server that does not say what the file is. Only then do we look at the
// first bytes to decide.
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/binary"]);

export type MediaStatus = "pending" | "saved" | "failed" | "quarantined" | "rejected";

export type MediaCandidate = {
  id: string;
  lead_no: string | null;
  name: string | null;
  firm_id: string | null;
  firm: string | null;
};

export type MediaLead = MediaCandidate & { archived_at?: string | null };

export type MediaRow = {
  id: string;
  provider: string;
  event_id: string;
  media_key: string;
  media_url: string;
  content_type: string | null;
  phone_norm: string | null;
  lead_id: string | null;
  firm_id: string | null;
  status: MediaStatus;
  attempts: number;
  last_error: string | null;
  candidates: MediaCandidate[] | null;
  document_id: string | null;
  storage_path: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewMediaRow = Pick<MediaRow, "provider" | "event_id" | "media_key" | "media_url" | "content_type" | "phone_norm" | "status">;

export type NewMediaDocument = {
  firm_id: string;
  lead_id: string;
  doc_type: string;
  file_name: string;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_by_name: string;
};

export type MediaAudit = {
  firm_id: string | null;
  lead_id: string;
  actor?: string;
  actor_name: string;
  category: string;
  description: string;
  meta: any;
};

// Everything the filing path reads or writes. The live adapter is
// supabaseMediaStore below; tests use an in-memory one.
export interface MediaStore {
  insertRows(rows: NewMediaRow[]): Promise<{ error?: string }>;
  loadRows(provider: string, eventId: string): Promise<{ rows: MediaRow[]; error?: string }>;
  getRow(id: string): Promise<{ row: MediaRow | null; error?: string }>;
  // Compare-and-set on (status, attempts): only one delivery wins a row.
  claimRow(row: MediaRow, patch: Partial<MediaRow>, nowIso: string): Promise<{ claimed: boolean; error?: string }>;
  // Final write for a claimed row; refused if another delivery took it over.
  finishRow(id: string, attempts: number, patch: Partial<MediaRow>, nowIso: string): Promise<{ error?: string }>;
  leadsForPhone(norm: string): Promise<{ leads: MediaLead[]; error?: string }>;
  getLead(id: string): Promise<{ lead: MediaLead | null; error?: string }>;
  findDocument(storagePath: string): Promise<{ id: string | null; error?: string }>;
  upload(storagePath: string, bytes: Uint8Array, contentType: string): Promise<{ error?: string }>;
  remove(storagePath: string): Promise<{ error?: string }>;
  insertDocument(doc: NewMediaDocument): Promise<{ id?: string; error?: string }>;
  audit(entry: MediaAudit): Promise<void>;
}

export type FetchLike = (input: string, init?: any) => Promise<Response>;

export type MediaDeps = {
  store: MediaStore;
  fetch: FetchLike;
  now?: () => Date;
  // Optional provider host allowlist (JUSTCALL_MEDIA_HOSTS). Empty: any
  // public https host that passes mediaUrlProblem.
  allowHosts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

export type MediaSummary = {
  attachments: number;
  saved: number;
  quarantined: number;
  failed: number;
  rejected: number;
  in_progress: number;
  ignored: number;
  errors: string[];
};

export type HarvestedMedia = { key: string; url: string; declaredType: string | null };

// ---------------------------------------------------------------------------
// Payload reading
// ---------------------------------------------------------------------------

// JustCall spells the media list a few ways across payload versions. Every
// entry with a link becomes an attachment; whether the link is safe is decided
// later and recorded, so nothing is dropped silently. The key is the
// provider's attachment id when it sends one, otherwise the 1-based position,
// which is stable across repeat deliveries of the same event.
export function harvestMedia(d: any): { items: HarvestedMedia[]; ignored: number } {
  const raw: any[] = []
    .concat(Array.isArray(d?.sms_info?.mms) ? d.sms_info.mms : [])
    .concat(Array.isArray(d?.mms) ? d.mms : [])
    .concat(Array.isArray(d?.media) ? d.media : []);
  const all: HarvestedMedia[] = [];
  for (const m of raw) {
    const url = (typeof m === "string" ? m : String(m?.media_url || m?.url || m?.link || "")).trim();
    if (!url || url.length > 2048) continue;
    if (all.some((x) => x.url === url)) continue;
    const declared = typeof m === "object" && m ? String(m?.content_type || m?.type || "").trim().toLowerCase() : "";
    const pid = typeof m === "object" && m ? String(m?.id ?? m?.media_id ?? m?.sid ?? "").trim() : "";
    all.push({ key: pid ? `id-${safeSegment(pid, 40)}` : String(all.length + 1), url, declaredType: declared || null });
  }
  return { items: all.slice(0, MEDIA_MAX_PER_EVENT), ignored: Math.max(0, all.length - MEDIA_MAX_PER_EVENT) };
}

// The event id the attachments are keyed on: the provider's message id, or a
// stable fingerprint of the message when the payload carries none.
export async function mediaEventId(d: any, items: HarvestedMedia[]): Promise<string> {
  const id = String(d?.id ?? d?.sms_id ?? "").trim();
  if (id) return id;
  const basis = [d?.contact_number, d?.sms_date, d?.sms_time, d?.sms_info?.body ?? d?.body, ...items.map((i) => i.url)].map((x) => String(x ?? "")).join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return "h-" + Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Which way a JustCall text went. JustCall says "Incoming" / "Outgoing", and
// "outgoing" contains "in", so the direction word is read for "out" first.
export function smsDirection(type: string, direction: unknown): "inbound" | "outbound" {
  const t = String(type || "").toLowerCase();
  if (t === "sms.received") return "inbound";
  if (t === "sms.sent") return "outbound";
  const d = String(direction ?? "").toLowerCase();
  if (d.includes("out")) return "outbound";
  if (d.includes("in")) return "inbound";
  return "outbound";
}

function safeSegment(s: string, max: number): string {
  return String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, max) || "x";
}

// Where the file lives. Always under the lead's own firm/lead folder, which is
// what the case_documents guard and the documents route require.
export function mediaPath(firmId: string, leadId: string, eventId: string, key: string, ext: string): string {
  return `${firmId}/${leadId}/mms-${safeSegment(eventId, 64)}-${safeSegment(key, 48)}.${ext}`;
}

export function mediaDocType(contentType: string): string {
  if (contentType.startsWith("image/")) return "client_photo";
  if (contentType === "application/pdf") return "client_doc";
  return "client_file";
}

// Leads the store returned for a number are re-checked here on the exact
// normalized value, so a loose database pre-filter can never widen a match.
export function leadsMatchingPhone<T extends { phone_norm?: string | null; phone?: string | null; phone_alt?: string | null; home_phone?: string | null; work_phone?: string | null; archived_at?: string | null }>(rows: T[], norm: string): T[] {
  if (norm.length < 10) return [];
  return rows.filter((r) => !r.archived_at && [r.phone_norm, r.phone, r.phone_alt, r.home_phone, r.work_phone].some((v) => !!v && normPhone(v) === norm));
}

// ---------------------------------------------------------------------------
// Safe download
// ---------------------------------------------------------------------------

// Why a link may not be fetched, or null when it may. https only, no login in
// the link, the standard port, a real public host name (never a raw IP or a
// private/loopback/link-local name). The edge runtime cannot resolve DNS
// itself, so a public name that resolves to a private address is outside
// what this check can see; the platform's egress rules cover that.
export function mediaUrlProblem(raw: string, allowHosts?: string[]): string | null {
  let u: URL;
  try { u = new URL(String(raw)); } catch { return "the link is not a valid web address"; }
  if (u.protocol !== "https:") return "the link is not https";
  if (u.username || u.password) return "the link carries a login";
  if (u.port && u.port !== "443") return "the link uses a non-standard port";
  let host = u.hostname.toLowerCase();
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return "the link has no host";
  if (host.startsWith("[") || host.includes(":")) return "the link points at a raw IP address";
  if (/^[0-9.]+$/.test(host) || /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+)){0,3}$/i.test(host)) return "the link points at a raw IP address";
  if (!host.includes(".")) return "the link points at a private host";
  if (host === "localhost" || /\.(localhost|local|localdomain|internal|intranet|lan|home|corp|home\.arpa)$/.test(host)) return "the link points at a private host";
  const allow = (allowHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.some((h) => host === h || host.endsWith("." + h))) return "the link is not from the texting provider";
  return null;
}

function normType(v: string | null | undefined): string {
  const t = String(v ?? "").split(";")[0].trim().toLowerCase();
  return TYPE_ALIASES[t] ?? t;
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

// Identify a file from its first bytes. Used only when the server does not
// say what it is.
export function sniffType(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return "image/png";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12).toLowerCase();
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    if (["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "m4v ", "mmp4", "dash"].includes(brand)) return "video/mp4";
  }
  return null;
}

export type MediaFetch =
  | { ok: true; bytes: Uint8Array; contentType: string; ext: string }
  | { ok: false; status: "rejected" | "failed"; reason: string };

function drop(res: Response) {
  try { res.body?.cancel().catch(() => {}); } catch { /* nothing to release */ }
}

// Download one attachment: every hop re-validated, redirects followed by
// hand (at most maxRedirects), one deadline for the whole transfer, and a
// streaming byte cap that stops reading the moment the file passes it.
export async function safeFetchMedia(url: string, deps: Pick<MediaDeps, "fetch" | "allowHosts" | "maxBytes" | "timeoutMs" | "maxRedirects">): Promise<MediaFetch> {
  const maxBytes = deps.maxBytes ?? MEDIA_MAX_BYTES;
  const maxRedirects = deps.maxRedirects ?? MEDIA_MAX_REDIRECTS;
  const mb = Math.round(maxBytes / (1024 * 1024));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? MEDIA_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      const problem = mediaUrlProblem(current, deps.allowHosts);
      if (problem) return { ok: false, status: "rejected", reason: hop ? `a redirect was refused: ${problem}` : problem };
      let res: Response;
      try {
        res = await deps.fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { accept: Object.keys(MEDIA_TYPES).join(", ") },
        });
      } catch (e: any) {
        return { ok: false, status: "failed", reason: ctrl.signal.aborted ? "the download timed out" : `the download failed: ${String(e?.message ?? e).slice(0, 200)}` };
      }
      if ((res as any).type === "opaqueredirect") return { ok: false, status: "failed", reason: "the download redirected in a way that cannot be checked" };
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        drop(res);
        if (!loc) return { ok: false, status: "failed", reason: `the download redirected without an address (HTTP ${res.status})` };
        if (hop >= maxRedirects) return { ok: false, status: "rejected", reason: "the link redirected too many times" };
        try { current = new URL(loc, current).toString(); } catch { return { ok: false, status: "rejected", reason: "a redirect was refused: the link is not a valid web address" }; }
        continue;
      }
      if (!res.ok) {
        drop(res);
        return { ok: false, status: "failed", reason: `the download failed (HTTP ${res.status})` };
      }
      const declaredLen = Number(res.headers.get("content-length") || "");
      if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
        drop(res);
        return { ok: false, status: "rejected", reason: `the file is larger than ${mb} MB` };
      }
      const headerType = normType(res.headers.get("content-type"));
      if (!GENERIC_TYPES.has(headerType) && !MEDIA_TYPES[headerType]) {
        drop(res);
        return { ok: false, status: "rejected", reason: `files of type ${headerType} are not accepted` };
      }
      const body = await readCapped(res, maxBytes, ctrl);
      if ("tooBig" in body) return { ok: false, status: "rejected", reason: `the file is larger than ${mb} MB` };
      if ("error" in body) return { ok: false, status: "failed", reason: ctrl.signal.aborted ? "the download timed out" : `the download failed: ${body.error}` };
      if (!body.bytes.length) return { ok: false, status: "failed", reason: "the download was empty" };
      const type = MEDIA_TYPES[headerType] ? headerType : sniffType(body.bytes);
      if (!type) return { ok: false, status: "rejected", reason: "the file type could not be identified" };
      return { ok: true, bytes: body.bytes, contentType: type, ext: MEDIA_TYPES[type] };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, max: number, ctrl: AbortController): Promise<{ bytes: Uint8Array } | { tooBig: true } | { error: string }> {
  try {
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.length > max ? { tooBig: true } : { bytes: buf };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max) {
        reader.cancel().catch(() => {});
        ctrl.abort();
        return { tooBig: true };
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.byteLength; }
    return { bytes: out };
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

export function mediaClaimable(row: Pick<MediaRow, "status" | "attempts" | "updated_at">, now: Date): boolean {
  if (row.status === "failed") return true;
  if (row.status !== "pending") return false;
  if (!row.attempts) return true;
  const at = Date.parse(row.updated_at);
  return !Number.isFinite(at) || now.getTime() - at > MEDIA_LEASE_MS;
}

type Actor = { id: string; name: string | null };

type RowOutcome = {
  status: MediaStatus;
  reason?: string;
  document_id?: string;
  storage_path?: string;
  file_name?: string;
  warning?: string;
};

function candidateOf(l: MediaLead): MediaCandidate {
  return { id: l.id, lead_no: l.lead_no ?? null, name: l.name ?? null, firm_id: l.firm_id ?? null, firm: l.firm ?? null };
}

function fileNameFor(row: MediaRow, ext: string, occurredAt?: string | null): string {
  const day = [occurredAt, row.created_at].find((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10);
  return `texted_in_${day}_${safeSegment(row.media_key, 48)}.${ext}`;
}

async function finish(deps: MediaDeps, row: MediaRow, attempts: number, outcome: RowOutcome, patch: Partial<MediaRow>): Promise<RowOutcome> {
  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const r = await deps.store.finishRow(row.id, attempts, { status: outcome.status, ...patch }, nowIso);
  if (r.error) return { ...outcome, warning: `the attachment's status could not be recorded: ${r.error}` };
  return outcome;
}

// Download one claimed attachment and file it on one lead. The row is only
// marked saved after the object is stored AND its case_documents row exists;
// a refused document row removes the stored object again.
async function fileRow(deps: MediaDeps, row: MediaRow, attempts: number, lead: MediaLead, actor: Actor | null, occurredAt?: string | null): Promise<RowOutcome> {
  const target = { lead_id: lead.id, firm_id: lead.firm_id, candidates: [candidateOf(lead)] };
  if (!lead.firm_id) {
    return finish(deps, row, attempts, { status: "quarantined", reason: "the matching file has no firm yet" }, { ...target, last_error: "the matching file has no firm yet" });
  }
  const dl = await safeFetchMedia(row.media_url, deps);
  if (!dl.ok) return finish(deps, row, attempts, { status: dl.status, reason: dl.reason }, { ...target, last_error: dl.reason });

  const path = mediaPath(lead.firm_id, lead.id, row.event_id, row.media_key, dl.ext);
  const fileName = fileNameFor(row, dl.ext, occurredAt);

  // A document row at this exact path means an earlier attempt filed it but
  // could not mark the attachment saved. Reuse it rather than file twice.
  const existing = await deps.store.findDocument(path);
  if (existing.error) {
    const reason = `could not check Documents: ${existing.error}`;
    return finish(deps, row, attempts, { status: "failed", reason }, { ...target, last_error: reason });
  }
  let documentId = existing.id;
  if (!documentId) {
    const up = await deps.store.upload(path, dl.bytes, dl.contentType);
    if (up.error) {
      const reason = `could not store the file: ${up.error}`;
      return finish(deps, row, attempts, { status: "failed", reason }, { ...target, last_error: reason });
    }
    const ins = await deps.store.insertDocument({
      firm_id: lead.firm_id,
      lead_id: lead.id,
      doc_type: mediaDocType(dl.contentType),
      file_name: fileName,
      storage_path: path,
      uploaded_by: actor?.id ?? null,
      uploaded_by_name: "Texted in by the PNC",
    });
    if (ins.error || !ins.id) {
      const rm = await deps.store.remove(path);
      const reason = `could not add it to Documents: ${ins.error ?? "no document id came back"}`
        + (rm.error ? `. The stored copy could not be removed (${path}): ${rm.error}` : "");
      return finish(deps, row, attempts, { status: "failed", reason }, { ...target, last_error: reason });
    }
    documentId = ins.id;
  }
  return finish(deps, row, attempts,
    { status: "saved", document_id: documentId, storage_path: path, file_name: fileName },
    { ...target, content_type: dl.contentType, document_id: documentId, storage_path: path, last_error: null });
}

function emptySummary(attachments: number, ignored: number): MediaSummary {
  return { attachments, saved: 0, quarantined: 0, failed: 0, rejected: 0, in_progress: 0, ignored, errors: [] };
}

function count(s: MediaSummary, o: RowOutcome) {
  if (o.status === "saved") s.saved++;
  else if (o.status === "quarantined") s.quarantined++;
  else if (o.status === "rejected") s.rejected++;
  else if (o.status === "failed") s.failed++;
  else s.in_progress++;
  if ((o.status === "failed" || o.status === "rejected") && o.reason) s.errors.push(o.reason);
  if (o.warning) s.errors.push(o.warning);
}

// File every attachment of one inbound text. Safe to call again for a
// repeated delivery: saved, rejected and quarantined rows are left alone,
// pending and failed rows are (re)tried, and a row another delivery is
// working on right now is reported as in progress.
export async function processInboundMedia(deps: MediaDeps, ev: {
  provider: string;
  eventId: string;
  phone: string | null | undefined;
  items: HarvestedMedia[];
  ignored?: number;
  occurredAt?: string | null;
}): Promise<MediaSummary> {
  const items = ev.items.slice(0, MEDIA_MAX_PER_EVENT);
  const summary = emptySummary(items.length, (ev.ignored ?? 0) + Math.max(0, ev.items.length - items.length));
  if (!items.length) return summary;
  const store = deps.store;
  const norm = normPhone(ev.phone);

  const ins = await store.insertRows(items.map((i) => ({
    provider: ev.provider, event_id: ev.eventId, media_key: i.key, media_url: i.url,
    content_type: i.declaredType, phone_norm: norm || null, status: "pending" as const,
  })));
  if (ins.error) {
    summary.failed = items.length;
    summary.errors.push(`could not record the attachments: ${ins.error}`);
    return summary;
  }
  const loaded = await store.loadRows(ev.provider, ev.eventId);
  if (loaded.error) {
    summary.failed = items.length;
    summary.errors.push(`could not read the attachments back: ${loaded.error}`);
    return summary;
  }
  const keys = new Set(items.map((i) => i.key));
  const rows = loaded.rows.filter((r) => keys.has(r.media_key));
  if (rows.length < items.length) {
    summary.failed += items.length - rows.length;
    summary.errors.push(`${items.length - rows.length} attachment(s) were not recorded`);
  }

  let match: { leads: MediaLead[]; error?: string } | null = null;
  const filed = new Map<string, { lead: MediaLead; files: string[] }>();

  for (const row of rows) {
    if (row.status === "saved") { summary.saved++; continue; }
    if (row.status === "rejected") { summary.rejected++; continue; }
    if (row.status === "quarantined") { summary.quarantined++; continue; }
    const now = deps.now?.() ?? new Date();
    if (!mediaClaimable(row, now)) { summary.in_progress++; continue; }

    const claim = await store.claimRow(row, {}, now.toISOString());
    if (claim.error) { summary.failed++; summary.errors.push(`could not start on an attachment: ${claim.error}`); continue; }
    if (!claim.claimed) { summary.in_progress++; continue; }
    const attempts = row.attempts + 1;

    const problem = mediaUrlProblem(row.media_url, deps.allowHosts);
    if (problem) {
      count(summary, await finish(deps, row, attempts, { status: "rejected", reason: problem }, { last_error: problem }));
      continue;
    }

    // A person already chose the file for this attachment: keep to it.
    let lead: MediaLead | null = null;
    if (row.resolved_by && row.lead_id) {
      const g = await store.getLead(row.lead_id);
      if (g.error) {
        const reason = `could not load the chosen file: ${g.error}`;
        count(summary, await finish(deps, row, attempts, { status: "failed", reason }, { last_error: reason }));
        continue;
      }
      if (!g.lead || g.lead.archived_at) {
        const reason = "the file chosen for this attachment is no longer available";
        count(summary, await finish(deps, row, attempts, { status: "quarantined", reason }, { last_error: reason }));
        continue;
      }
      lead = g.lead;
    } else {
      if (!match) match = norm.length === 10 ? await store.leadsForPhone(norm) : { leads: [] };
      if (match.error) {
        const reason = `could not look up the sender's number: ${match.error}`;
        count(summary, await finish(deps, row, attempts, { status: "failed", reason }, { last_error: reason }));
        continue;
      }
      if (match.leads.length !== 1) {
        const reason = match.leads.length
          ? `${match.leads.length} files have this number; pick the right one`
          : "no file has this number yet";
        count(summary, await finish(deps, row, attempts, { status: "quarantined", reason },
          { lead_id: null, firm_id: null, candidates: match.leads.slice(0, 20).map(candidateOf), last_error: reason }));
        continue;
      }
      lead = match.leads[0];
    }

    const out = await fileRow(deps, row, attempts, lead, null, ev.occurredAt);
    count(summary, out);
    if (out.status === "saved" && out.file_name) {
      const g = filed.get(lead.id) ?? { lead, files: [] };
      g.files.push(out.file_name);
      filed.set(lead.id, g);
    }
  }

  for (const { lead, files } of filed.values()) {
    await store.audit({
      firm_id: lead.firm_id, lead_id: lead.id, actor_name: "PNC (text)", category: "docs",
      description: `Texted in ${files.length} file${files.length === 1 ? "" : "s"}, saved to Documents.`,
      meta: { files, provider: ev.provider, event_id: ev.eventId },
    });
  }
  return summary;
}

export type ResolveResult =
  | { ok: true; status: "saved"; document_id: string; storage_path: string; warning?: string }
  | { ok: false; code: "not_found" | "already_saved" | "rejected" | "busy" | "error" | "failed" | "quarantined"; error: string };

// Staff filing one held attachment onto the lead they chose. Same download,
// store and document path as the webhook; the choice is stamped on the row
// (resolved_by) so a later retry keeps to it.
export async function resolveInboundMedia(deps: MediaDeps, args: { id: string; lead: MediaLead; actor: Actor }): Promise<ResolveResult> {
  const { store } = deps;
  const got = await store.getRow(args.id);
  if (got.error) return { ok: false, code: "error", error: got.error };
  const row = got.row;
  if (!row) return { ok: false, code: "not_found", error: "That attachment was not found." };
  if (row.status === "saved") return { ok: false, code: "already_saved", error: "That attachment is already filed." };
  if (row.status === "rejected") return { ok: false, code: "rejected", error: `That attachment was refused: ${row.last_error ?? "unknown reason"}.` };
  if (args.lead.archived_at) return { ok: false, code: "error", error: "That file is archived." };
  if (!args.lead.firm_id) return { ok: false, code: "error", error: "That file has no firm yet." };
  const now = deps.now?.() ?? new Date();
  if (row.status === "pending" && !mediaClaimable(row, now)) return { ok: false, code: "busy", error: "That attachment is being filed right now. Try again in a minute." };

  const claim = await store.claimRow(row, { lead_id: args.lead.id, firm_id: args.lead.firm_id, resolved_by: args.actor.id }, now.toISOString());
  if (claim.error) return { ok: false, code: "error", error: claim.error };
  if (!claim.claimed) return { ok: false, code: "busy", error: "Someone else just changed that attachment. Refresh and try again." };
  const attempts = row.attempts + 1;

  const problem = mediaUrlProblem(row.media_url, deps.allowHosts);
  if (problem) {
    await finish(deps, row, attempts, { status: "rejected", reason: problem }, { last_error: problem });
    return { ok: false, code: "rejected", error: `That attachment was refused: ${problem}.` };
  }

  const out = await fileRow(deps, row, attempts, args.lead, args.actor, null);
  if (out.status !== "saved" || !out.document_id || !out.storage_path) {
    const code = out.status === "rejected" ? "rejected" : out.status === "quarantined" ? "quarantined" : "failed";
    return { ok: false, code, error: out.reason ?? "The attachment could not be filed." };
  }
  await store.audit({
    firm_id: args.lead.firm_id, lead_id: args.lead.id, actor: args.actor.id, actor_name: args.actor.name ?? "Staff",
    category: "docs",
    description: `Filed a texted-in file to Documents: ${out.file_name}.`,
    meta: { inbound_media_id: row.id, provider: row.provider, event_id: row.event_id, previous_status: row.status },
  });
  return { ok: true, status: "saved", document_id: out.document_id, storage_path: out.storage_path, warning: out.warning };
}

// ---------------------------------------------------------------------------
// Live adapter (service-role client; server only)
// ---------------------------------------------------------------------------

const ROW_COLS = "id, provider, event_id, media_key, media_url, content_type, phone_norm, lead_id, firm_id, status, attempts, last_error, candidates, document_id, storage_path, resolved_by, created_at, updated_at";
const LEAD_COLS = "id, firm_id, lead_no, full_name, claimant_name, archived_at, phone_norm, phone, phone_alt, home_phone, work_phone, firms(name)";

function toLead(r: any): MediaLead {
  const firm = Array.isArray(r?.firms) ? r.firms[0] : r?.firms;
  return {
    id: r.id,
    lead_no: r.lead_no ?? null,
    name: (r.claimant_name || r.full_name || "").trim() || null,
    firm_id: r.firm_id ?? null,
    firm: firm?.name ?? null,
    archived_at: r.archived_at ?? null,
  };
}

export function supabaseMediaStore(admin: any, audit: (e: MediaAudit) => Promise<void>): MediaStore {
  const T = "inbound_media";
  return {
    async insertRows(rows) {
      const { error } = await admin.from(T).upsert(rows, { onConflict: "provider,event_id,media_key", ignoreDuplicates: true });
      return { error: error?.message };
    },
    async loadRows(provider, eventId) {
      const { data, error } = await admin.from(T).select(ROW_COLS).eq("provider", provider).eq("event_id", eventId);
      return { rows: (data ?? []) as MediaRow[], error: error?.message };
    },
    async getRow(id) {
      const { data, error } = await admin.from(T).select(ROW_COLS).eq("id", id).maybeSingle();
      return { row: (data ?? null) as MediaRow | null, error: error?.message };
    },
    async claimRow(row, patch, nowIso) {
      const { data, error } = await admin.from(T)
        .update({ ...patch, status: "pending", attempts: row.attempts + 1, updated_at: nowIso })
        .eq("id", row.id).eq("status", row.status).eq("attempts", row.attempts)
        .select("id");
      if (error) return { claimed: false, error: error.message };
      return { claimed: (data ?? []).length === 1 };
    },
    async finishRow(id, attempts, patch, nowIso) {
      const { data, error } = await admin.from(T)
        .update({ ...patch, updated_at: nowIso })
        .eq("id", id).eq("status", "pending").eq("attempts", attempts)
        .select("id");
      if (error) return { error: error.message };
      if (!(data ?? []).length) return { error: "another delivery took this attachment over" };
      return {};
    },
    async leadsForPhone(norm) {
      // phone_norm is indexed; the other numbers are stored as typed, so they
      // are pre-filtered loosely here and matched exactly in leadsMatchingPhone.
      const pat = `*${norm.slice(0, 3)}*${norm.slice(3, 6)}*${norm.slice(6)}*`;
      const { data, error } = await admin.from("leads").select(LEAD_COLS)
        .is("archived_at", null)
        .or(`phone_norm.eq.${norm},phone_alt.like.${pat},home_phone.like.${pat},work_phone.like.${pat}`)
        .limit(100);
      if (error) return { leads: [], error: error.message };
      return { leads: leadsMatchingPhone((data ?? []) as any[], norm).map(toLead) };
    },
    async getLead(id) {
      const { data, error } = await admin.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle();
      return { lead: data ? toLead(data) : null, error: error?.message };
    },
    async findDocument(storagePath) {
      const { data, error } = await admin.from("case_documents").select("id").eq("storage_path", storagePath).limit(1);
      return { id: (data ?? [])[0]?.id ?? null, error: error?.message };
    },
    async upload(storagePath, bytes, contentType) {
      // The path is unique to this attachment and lead, so overwriting only
      // ever replaces bytes an earlier failed attempt of the SAME attachment
      // left behind (a saved row is never re-downloaded).
      const { error } = await admin.storage.from("case-docs").upload(storagePath, bytes, { contentType, upsert: true });
      return { error: error?.message };
    },
    async remove(storagePath) {
      const { error } = await admin.storage.from("case-docs").remove([storagePath]);
      return { error: error?.message };
    },
    async insertDocument(doc) {
      const { data, error } = await admin.from("case_documents").insert(doc).select("id").single();
      return { id: data?.id, error: error?.message };
    },
    audit,
  };
}

export function mediaHostsFromEnv(v: string | undefined): string[] {
  return String(v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
