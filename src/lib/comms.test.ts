// Run: npx tsx src/lib/comms.test.ts
// First-dial stamping on new and duplicate call events. Offline: an
// in-memory database; the audit helper has no service key and writes nothing.
import assert from "node:assert/strict";
import { ingestComm, providerCallResult, stampFirstDial } from "./comms";
import { FakeDb } from "./test-fake-db";

delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const realError = console.error;
const logged: string[] = [];
console.error = (...a: any[]) => {
  const line = a.map(String).join(" ");
  if (line.startsWith("audit insert failed")) return;
  logged.push(line);
};

let passed = 0;
const tests: { name: string; fn: () => void | Promise<void> }[] = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });

const LEAD = "8f0e0e0e-aaaa-4bbb-8ccc-dddddddddddd";
function world(lead: Record<string, any> = {}, comms: Record<string, any>[] = []) {
  logged.length = 0;
  const db = new FakeDb({
    leads: [{ id: LEAD, firm_id: "firm-tmp", phone_norm: "8325550148", status: "new", created_at: "2026-09-28T10:00:00Z", first_dialed_at: null, ...lead }],
    communications: comms.map((c) => ({ ...c })),
  });
  return { db, lead: () => db.tables.leads[0], comm: (i = 0) => db.tables.communications[i] };
}
const call = (o: Record<string, any> = {}) => ({ channel: "call" as const, direction: "outbound" as const, phone: "(832) 555-0148", call_sid: "CA1", ...o });
const original = { id: "c-1", lead_id: LEAD, firm_id: "firm-tmp", channel: "call", direction: "outbound", call_sid: "CA1", duration_sec: null, occurred_at: "2026-09-28T10:20:00Z", created_at: "2026-09-28T10:20:03Z" };

assert.equal(providerCallResult("unanswered"), "unanswered");
assert.equal(providerCallResult("No Answer"), "unanswered");
assert.equal(providerCallResult("answered"), "answered");
assert.equal(providerCallResult("Outgoing human answered"), "answered");
assert.equal(providerCallResult("Outgoing answered call"), "answered");
assert.equal(providerCallResult("Outgoing unanswered call"), "unanswered");
assert.equal(providerCallResult("Outgoing machine answered"), "voicemail");
assert.equal(providerCallResult("Outgoing blocked call"), "failed");
assert.equal(providerCallResult("Unarchived"), null);
assert.equal(providerCallResult("Completed"), null);

t("a new outbound call stamps first dial with its own time", async () => {
  const w = world();
  const r: any = await ingestComm(call({ occurred_at: "2026-09-28T10:07:00Z" }), { db: w.db });
  assert.equal(r.matched, true);
  assert.equal(r.stamp_error, undefined);
  assert.equal(w.lead().first_dialed_at, "2026-09-28T10:07:00Z");
});

t("a shared phone cannot credit a guessed newest file", async () => {
  const w = world();
  w.db.tables.leads.push({ ...w.lead(), id: "other-active", created_at: "2026-09-29T10:00:00Z" });
  const r: any = await ingestComm(call({ occurred_at: "2026-09-29T11:00:00Z" }), { db: w.db });
  assert.equal(r.matched, false);
  assert.equal(w.comm().lead_id, null);
  assert.equal(w.lead().first_dialed_at, null);
});

t("explicit provider result survives first delivery and a later duplicate", async () => {
  const w = world();
  await ingestComm(call({ occurred_at: "2026-09-28T10:07:00Z", provider_call_result: "unanswered" }), { db: w.db });
  assert.equal(w.comm().provider_call_result, "unanswered");
  await ingestComm(call({ occurred_at: "2026-09-28T10:07:00Z", provider_call_result: "answered" }), { db: w.db });
  assert.equal(w.comm().provider_call_result, "answered");
});

t("early AI details cannot create a dial before the completed call", async () => {
  const w = world();
  const early: any = await ingestComm(call({ jc_summary: "Synthetic summary" }), { db: w.db, onlyExisting: true });
  assert.equal(early.deferred, true);
  assert.equal(w.db.tables.communications.length, 0);
  assert.equal(w.lead().first_dialed_at, null);
  await ingestComm(call({ occurred_at: "2026-09-28T10:07:00Z", provider_call_result: "unanswered" }), { db: w.db });
  const later: any = await ingestComm(call({ jc_summary: "Synthetic summary" }), { db: w.db, onlyExisting: true });
  assert.equal(later.updated, true);
  assert.equal(w.comm().jc_summary, "Synthetic summary");
  assert.equal(w.db.tables.communications.length, 1);
});

t("a duplicate repairs a missing stamp with the ORIGINAL call's time, not the duplicate's", async () => {
  const w = world({}, [original]);
  const r: any = await ingestComm(call({ occurred_at: "2026-09-28T10:31:00Z", duration_sec: 95 }), { db: w.db });
  assert.equal(r.updated, true);
  assert.equal(w.lead().first_dialed_at, "2026-09-28T10:20:00Z");
  assert.equal(w.comm().occurred_at, "2026-09-28T10:20:00Z");
  assert.equal(w.comm().duration_sec, 95);
});

t("a duplicate with no time of its own never stamps \"now\"", async () => {
  const w = world({}, [original]);
  await ingestComm(call({ recording_url: "https://example.invalid/r.mp3" }), { db: w.db });
  assert.equal(w.lead().first_dialed_at, "2026-09-28T10:20:00Z");
});

t("a duplicate carrying an earlier time does not re-stamp first contact", async () => {
  const w = world({ first_dialed_at: "2026-09-28T10:20:00Z" }, [original]);
  await ingestComm(call({ occurred_at: "2026-09-28T10:05:00Z" }), { db: w.db });
  assert.equal(w.lead().first_dialed_at, "2026-09-28T10:20:00Z");
});

t("an original with no occurred_at falls back to when it was stored", async () => {
  const w = world({}, [{ ...original, occurred_at: null }]);
  await ingestComm(call({ occurred_at: "2026-09-28T11:00:00Z" }), { db: w.db });
  assert.equal(w.lead().first_dialed_at, "2026-09-28T10:20:03Z");
});

t("an inbound duplicate never stamps first dial", async () => {
  const w = world({}, [{ ...original, direction: "inbound" }]);
  await ingestComm(call({ direction: "inbound", occurred_at: "2026-09-28T10:31:00Z" }), { db: w.db });
  assert.equal(w.lead().first_dialed_at, null);
});

t("a failed stamp on a new call is logged and returned, not swallowed", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "leads" && op.kind === "update" ? "deadlock detected" : null);
  const r: any = await ingestComm(call({ occurred_at: "2026-09-28T10:07:00Z" }), { db: w.db });
  assert.ok(r.id);
  assert.match(String(r.stamp_error), /first-dial time did not save: deadlock detected/);
  assert.ok(logged.some((l) => l.includes("first-dial stamp failed")));
});

t("a failed stamp on a duplicate is logged and returned", async () => {
  const w = world({}, [original]);
  w.db.failOn = (op) => (op.table === "leads" && op.kind === "update" ? "timeout" : null);
  const r: any = await ingestComm(call({ occurred_at: "2026-09-28T10:31:00Z" }), { db: w.db });
  assert.equal(r.updated, true);
  assert.match(String(r.stamp_error), /timeout/);
});

t("a thrown stamp error is returned too", async () => {
  const w = world();
  w.db.failOn = (op) => (op.table === "leads" && op.kind === "update" ? "THROW" : null);
  const st = await stampFirstDial(w.db, LEAD, "2026-09-28T10:07:00Z");
  assert.equal(st.ok, false);
});

t("a failed detail write on a duplicate is returned as error", async () => {
  const w = world({ first_dialed_at: "2026-09-28T10:20:00Z" }, [original]);
  w.db.failOn = (op) => (op.table === "communications" && op.kind === "update" ? "value too long" : null);
  const r: any = await ingestComm(call({ duration_sec: 95 }), { db: w.db });
  assert.equal(r.updated, true);
  assert.match(String(r.error), /call details did not save: value too long/);
  assert.equal(w.comm().duration_sec, null);
});

t("a call before the lead existed never stamps a negative speed", async () => {
  const w = world();
  await ingestComm(call({ occurred_at: "2026-09-28T09:00:00Z" }), { db: w.db });
  assert.equal(w.lead().first_dialed_at, null);
});

(async () => {
  for (const { name, fn } of tests) { await fn(); passed++; console.log("ok", name); }
  console.error = realError;
  console.log(passed, "passed");
})().catch((e) => { console.error = realError; console.error(e); process.exit(1); });
