// Run: npx tsx src/lib/notify-signed.test.ts
//
// Offline only. The database is an in-memory fake that evaluates the same
// filters the code sends, the email provider is a stubbed fetch, and the
// audit helper has no service key (it logs "audit insert failed" and moves
// on). Nothing here reaches a network, a database or a mailbox.
import assert from "node:assert/strict";
import {
  cleanEmails, signedRecipients, signedNoticeDue, signedNotifyKey, notifySigned, NOTIFY_LEASE_MINUTES,
  type NotifyRoute,
} from "./notify-signed";
import { sendEmail } from "./email";
import { FakeDb, type Row } from "./test-fake-db";

delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.RESEND_API_KEY = "test-key-offline";
// The audit helper's expected "no service key" complaint is noise here.
const realError = console.error;
console.error = (...a: any[]) => { if (String(a[0]).startsWith("audit insert failed")) return; realError(...a); };

let passed = 0;
const tests: { name: string; fn: () => void | Promise<void> }[] = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });
const R = (o: Partial<NotifyRoute>): NotifyRoute => ({ event: "signed", case_type: null, campaign_id: null, to_emails: [], cc_emails: [], active: true, ...o });

// ---------------------------------------------------------------- recipients
t("emails are cleaned, lowercased, deduped", () => {
  assert.deepEqual(cleanEmails("MVA@x.com, tmpmva@x.com; mva@x.com  nope"), ["mva@x.com", "tmpmva@x.com"]);
  assert.deepEqual(cleanEmails(""), []);
});

const routes = [
  R({ case_type: "mva", to_emails: ["mva@ii.com"] }),
  R({ case_type: "mva", campaign_id: "c-tmp", cc_emails: ["tmpmva@ii.com"] }),
  R({ case_type: "mva", campaign_id: "c-other", cc_emails: ["other@ii.com"] }),
  R({ case_type: "motel_trafficking", to_emails: ["m6@ii.com"] }),
];

t("the distro plus that campaign's CC, nobody else's", () => {
  assert.deepEqual(signedRecipients(routes, { case_type: "mva", campaign_id: "c-tmp" }), { to: ["mva@ii.com"], cc: ["tmpmva@ii.com"] });
});

t("a campaign with no CC gets just the distro", () => {
  assert.deepEqual(signedRecipients(routes, { case_type: "mva", campaign_id: "c-new" }), { to: ["mva@ii.com"], cc: [] });
});

t("no distro for the type: the CCs become the To", () => {
  const r = [R({ case_type: "pfas", campaign_id: "c-p", cc_emails: ["pfas@ii.com"] })];
  assert.deepEqual(signedRecipients(r, { case_type: "pfas", campaign_id: "c-p" }), { to: ["pfas@ii.com"], cc: [] });
});

t("nothing set, nobody is emailed; switched off rules are ignored", () => {
  assert.deepEqual(signedRecipients([], { case_type: "mva", campaign_id: "c-tmp" }), { to: [], cc: [] });
  assert.deepEqual(signedRecipients([R({ case_type: "mva", to_emails: ["a@b.co"], active: false })], { case_type: "mva", campaign_id: "x" }), { to: [], cc: [] });
});

t("an address in both lists is only a To", () => {
  const r = [R({ case_type: "mva", to_emails: ["a@b.co"] }), R({ campaign_id: "c", cc_emails: ["a@b.co", "c@d.co"] })];
  assert.deepEqual(signedRecipients(r, { case_type: "mva", campaign_id: "c" }), { to: ["a@b.co"], cc: ["c@d.co"] });
});

// ---------------------------------------------------------------- lease rule
const NOW = Date.parse("2026-09-28T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

t("due: never tried, pending, failed", () => {
  assert.equal(signedNoticeDue({ notify_state: null }, NOW), true);
  assert.equal(signedNoticeDue({}, NOW), true);
  assert.equal(signedNoticeDue({ notify_state: "pending" }, NOW), true);
  assert.equal(signedNoticeDue({ notify_state: "failed" }, NOW), true);
});

t("a live lease holds; a lease older than the window is recoverable", () => {
  assert.equal(signedNoticeDue({ notify_state: "sending", notify_claimed_at: minsAgo(2) }, NOW), false);
  assert.equal(signedNoticeDue({ notify_state: "sending", notify_claimed_at: minsAgo(NOTIFY_LEASE_MINUTES) }, NOW), false);
  assert.equal(signedNoticeDue({ notify_state: "sending", notify_claimed_at: minsAgo(NOTIFY_LEASE_MINUTES + 1) }, NOW), true);
  assert.equal(signedNoticeDue({ notify_state: "sending", notify_claimed_at: null }, NOW), true);
});

t("never automatic: sent, no_recipient, legacy_unknown, unknown states, stamped or voided rows", () => {
  for (const s of ["sent", "no_recipient", "legacy_unknown", "something_new"]) assert.equal(signedNoticeDue({ notify_state: s }, NOW), false, s);
  assert.equal(signedNoticeDue({ notify_state: null, signed_notified_at: minsAgo(60) }, NOW), false);
  assert.equal(signedNoticeDue({ notify_state: "failed", voided_at: minsAgo(1) }, NOW), false);
  assert.equal(signedNoticeDue({ notify_state: null, status: "voided" }, NOW), false);
  assert.equal(signedNoticeDue(null, NOW), false);
});

// ---------------------------------------------------------------- fake provider
type Sent = { url: string; headers: Record<string, string>; body: any };
let sent: Sent[] = [];
let provider: (s: Sent) => { status: number; json: any } | "THROW" = () => ({ status: 200, json: { id: "em_1" } });
(globalThis as any).fetch = async (url: any, init: any) => {
  const u = String(url);
  if (u !== "https://api.resend.com/emails") throw new Error(`offline test: unexpected fetch ${u}`);
  const s: Sent = { url: u, headers: { ...(init?.headers ?? {}) }, body: JSON.parse(init?.body ?? "{}") };
  sent.push(s);
  const r = provider(s);
  if (r === "THROW") throw new Error("socket hang up");
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json } as any;
};

const SUB_ID = "5b0c3a4e-1111-4222-8333-944455556666";
const LEAD_ID = "8f0e0e0e-aaaa-4bbb-8ccc-dddddddddddd";
function world(sub: Partial<Row> = {}, opts: { routes?: NotifyRoute[] } = {}) {
  sent = [];
  provider = () => ({ status: 200, json: { id: "em_1" } });
  const row: Row = {
    id: SUB_ID, lead_id: LEAD_ID, firm_id: "firm-tmp", submission_id: "ds-77", status: "signed", call_id: null,
    signer_name: "Maria Lopez", injured_name: "Maria Lopez", template_key: "TX", pax_index: null,
    completed_pdf_path: null, voided_at: null, signed_notified_at: null,
    notify_state: null, notify_claimed_at: null, notify_attempts: 0, notify_error: null, ...sub,
  };
  const db = new FakeDb({
    esign_submissions: [row],
    leads: [{ id: LEAD_ID, lead_no: "TMP-101", claimant_name: "Maria Lopez", phone: "8325550148", email: null, dob: null, case_type: "mva", campaign: "TMP MVA", campaign_id: "c-tmp", firm_id: "firm-tmp" }],
    notify_routes: (opts.routes ?? [R({ case_type: "mva", to_emails: ["mva@ii.com"] })]) as any[],
    intake_calls: [],
  });
  return { db, row, stored: () => db.tables.esign_submissions[0] };
}

// ---------------------------------------------------------------- lifecycle
t("sends once, records sent, stamps signed_notified_at, uses the idempotency key", async () => {
  const w = world();
  assert.equal(await notifySigned(w.db, w.row), "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["Idempotency-Key"], `signed-notify-${SUB_ID}`);
  assert.equal(signedNotifyKey(SUB_ID), `signed-notify-${SUB_ID}`);
  assert.deepEqual(sent[0].body.to, ["mva@ii.com"]);
  const s = w.stored();
  assert.equal(s.notify_state, "sent");
  assert.ok(s.signed_notified_at);
  assert.equal(s.notify_attempts, 1);
  assert.equal(s.notify_error, null);
  // A later sync finds nothing to do.
  assert.equal(await notifySigned(w.db, w.stored()), "not_due");
  assert.equal(sent.length, 1);
});

t("no recipients: terminal no_recipient, visible reason, not stamped as sent, never retried", async () => {
  const w = world({}, { routes: [] });
  assert.equal(await notifySigned(w.db, w.row), "no_recipient");
  assert.equal(sent.length, 0);
  const s = w.stored();
  assert.equal(s.notify_state, "no_recipient");
  assert.equal(s.signed_notified_at, null);
  assert.match(String(s.notify_error), /Nobody is set/);
  assert.equal(await notifySigned(w.db, w.stored()), "not_due");
  assert.equal(sent.length, 0);
});

t("provider failure: failed with the reason; the next sync retries with the SAME key", async () => {
  const w = world();
  provider = () => ({ status: 500, json: { message: "Resend is down" } });
  assert.equal(await notifySigned(w.db, w.row), "failed");
  let s = w.stored();
  assert.equal(s.notify_state, "failed");
  assert.equal(s.notify_error, "Resend is down");
  assert.equal(s.signed_notified_at, null);
  provider = () => ({ status: 200, json: { id: "em_2" } });
  assert.equal(await notifySigned(w.db, w.stored()), "sent");
  s = w.stored();
  assert.equal(s.notify_state, "sent");
  assert.equal(s.notify_attempts, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].headers["Idempotency-Key"], sent[1].headers["Idempotency-Key"]);
});

t("a thrown network error is a failure, not a stranded claim", async () => {
  const w = world();
  provider = () => "THROW";
  assert.equal(await notifySigned(w.db, w.row), "failed");
  assert.equal(w.stored().notify_state, "failed");
  assert.match(String(w.stored().notify_error), /socket hang up/);
});

t("crash after claim: a live lease blocks, an expired lease recovers and sends", async () => {
  const w = world({ notify_state: "sending", notify_claimed_at: new Date(Date.now() - 2 * 60_000).toISOString(), notify_attempts: 1 });
  assert.equal(await notifySigned(w.db, w.row), "not_due");
  assert.equal(sent.length, 0);
  w.stored().notify_claimed_at = new Date(Date.now() - (NOTIFY_LEASE_MINUTES + 1) * 60_000).toISOString();
  assert.equal(await notifySigned(w.db, w.stored()), "sent");
  assert.equal(sent.length, 1);
  assert.equal(w.stored().notify_attempts, 2);
  assert.equal(w.stored().notify_state, "sent");
});

t("legacy_unknown and already-stamped rows are never re-sent", async () => {
  const a = world({ notify_state: "legacy_unknown", signed_notified_at: "2026-09-20T10:00:00Z" });
  assert.equal(await notifySigned(a.db, a.row), "not_due");
  const b = world({ notify_state: null, signed_notified_at: "2026-09-20T10:00:00Z" });
  assert.equal(await notifySigned(b.db, b.row), "not_due");
  assert.equal(sent.length, 0);
});

t("a voided agreement never emails", async () => {
  const w = world({ status: "voided", voided_at: "2026-09-28T09:00:00Z" });
  assert.equal(await notifySigned(w.db, w.row), "not_due");
  assert.equal(sent.length, 0);
});

t("two racing syncs: one claim wins, one provider call", async () => {
  const w = world();
  const [a, b] = await Promise.all([notifySigned(w.db, w.row), notifySigned(w.db, w.row)]);
  assert.deepEqual([a, b].sort(), ["claimed_elsewhere", "sent"]);
  assert.equal(sent.length, 1);
  assert.equal(w.stored().notify_attempts, 1);
});

t("a read failure before the claim changes nothing", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "esign_submissions" && op.kind === "select" ? "connection reset" : null);
  assert.equal(await notifySigned(w.db, w.row), "read_failed");
  assert.equal(sent.length, 0);
  assert.equal(w.stored().notify_state, null);
  assert.equal(w.stored().notify_attempts, 0);
});

t("the file cannot be read after the claim: failed with the reason, retried later", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "leads" ? "permission denied" : null);
  assert.equal(await notifySigned(w.db, w.row), "failed");
  assert.equal(w.stored().notify_state, "failed");
  assert.match(String(w.stored().notify_error), /permission denied/);
  w.db.failOn = () => null;
  assert.equal(await notifySigned(w.db, w.stored()), "sent");
});

t("a crash after the claim leaves failed, not a stuck lease", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "notify_routes" ? "THROW" : null);
  assert.equal(await notifySigned(w.db, w.row), "failed");
  assert.equal(w.stored().notify_state, "failed");
  assert.match(String(w.stored().notify_error), /simulated crash/);
});

t("sent but not recorded: the lease stays, no second email inside the lease", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "esign_submissions" && op.kind === "update" && op.patch?.notify_state === "sent" ? "timeout" : null);
  assert.equal(await notifySigned(w.db, w.row), "sent");
  assert.equal(w.stored().notify_state, "sending");
  assert.equal(w.stored().signed_notified_at, null);
  w.db.failOn = () => null;
  assert.equal(await notifySigned(w.db, w.stored()), "not_due");
  assert.equal(sent.length, 1);
});

t("a slow sender's failure never overwrites a later sender's sent", async () => {
  const w = world();
  provider = () => {
    // While this sender waits on the provider, its lease is taken over and
    // another sender records the email as sent.
    Object.assign(w.stored(), { notify_state: "sent", notify_claimed_at: "2026-09-28T12:30:00Z", signed_notified_at: "2026-09-28T12:30:05Z" });
    return { status: 500, json: { message: "late failure" } };
  };
  assert.equal(await notifySigned(w.db, w.row), "failed");
  assert.equal(w.stored().notify_state, "sent");
  assert.equal(w.stored().notify_error, null);
});

// ---------------------------------------------------------------- email header
t("sendEmail sends Idempotency-Key only when given", async () => {
  sent = [];
  provider = () => ({ status: 200, json: { id: "x" } });
  assert.equal((await sendEmail({ to: "a@b.co", subject: "s", html: "h" })).ok, true);
  assert.equal("Idempotency-Key" in sent[0].headers, false);
  await sendEmail({ to: "a@b.co", subject: "s", html: "h", idempotencyKey: "k-1" });
  assert.equal(sent[1].headers["Idempotency-Key"], "k-1");
});

(async () => {
  for (const { name, fn } of tests) { await fn(); passed++; console.log("ok", name); }
  console.log(passed, "passed");
})().catch((e) => { console.error(e); process.exit(1); });
