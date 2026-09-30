import assert from "node:assert/strict";
import { buildDeskQueues, readDeskRows } from "./desk-queue";
import { DESK_TABS } from "./desk-types";
import { DEFAULT_STATUSES } from "../statuses";
import { FakeDb } from "../test-fake-db";

const old = "2026-01-01T10:00:00Z", recent = "2026-09-29T10:00:00Z";
const lead = (id: string, status = "new") => ({ id, firm_id: "firm", campaign_id: "inno", claimant_name: id, created_at: old, archived_at: null,
  claims: [{ id: `${id}-claim`, lead_id: id, firm_id: "firm", campaign_id: "inno", claim_type: "mva", campaign: "INNO MVA", status, created_at: old }] });
const call = (file: any, extra = {}) => ({ id: `${file.id}-call`, lead_id: file.id, claim_id: file.claims[0].id, campaign_id: "inno", created_at: old, ...extra });
const agreement = (file: any, extra = {}) => ({ id: `${file.id}-agreement`, lead_id: file.id, claim_id: file.claims[0].id, firm_id: "firm", campaign_id: "inno", status: "sent", created_at: old, sent_at: old, template_key: "NV_FLAT", ...extra });
const classify = (leads: any[], calls: any[] = [], agreements: any[] = [], extra = {}) => buildDeskQueues({ leads, calls, agreements, campaignIds: ["inno"], statuses: DEFAULT_STATUSES, holds: new Map(), acquisitionReady: true, ...extra });
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log("ok", name); }

test("six queues have the exact approved order and labels", () => {
  assert.deepEqual(DESK_TABS.map(row => row[1]), ["NEW", "CONTINUE CALLING", "CALLBACK SCHEDULED", "SENT ESIGN", "SIGNED ESIGN", "WIP"]);
});
test("one matter appears in exactly one of the six queues", () => {
  const fresh = lead("fresh"), calling = lead("calling", "contacting"), callback = lead("callback", "contacting"), sent = lead("sent", "esign_sent"), signed = lead("signed", "signed_grievous"), wip = lead("wip", "signed_wip");
  const queues = classify([fresh, calling, callback, sent, signed, wip], [call(callback, { disposition: "callback", callback_at: recent })], [agreement(sent), agreement(signed, { status: "signed", signed_at: old })]);
  assert.deepEqual(Object.values(queues).map(rows => rows.length), [1, 1, 1, 1, 1, 1]);
  assert.equal(new Set(Object.values(queues).flat().map(row => row.claimId)).size, 6);
});
test("all DQ and terminal states stay out even with old signed envelopes or callback records", () => {
  const keys = ["dq", "external_dq_review", "dq_billable", "signed_dropped", "dead", "dnc", "not_interested", "duplicate", "delivered", "retained"];
  const files = keys.map(key => lead(key, key));
  const result = classify(files, files.map(file => call(file, { disposition: "callback", callback_at: recent })), files.map(file => agreement(file, { status: "signed", signed_at: old })));
  assert.equal(Object.values(result).flat().length, 0);
});
test("only explicit signed_wip enters WIP; partial calls and unsigned QA returns do not", () => {
  const partial = lead("partial", "contacting"), unsigned = lead("unsigned", "wip"), returned = lead("returned", "signed_wip");
  const queues = classify([partial, unsigned, returned], [call(partial)]);
  assert.deepEqual(queues.wip.map(row => row.id), ["returned"]);
  assert.deepEqual(queues.calling.map(row => row.id), ["partial"]);
});
test("an exact source DQ hold blocks stale signing work without closing an eligible sibling", () => {
  const file = lead("held", "esign_sent");
  file.claims.push({ ...file.claims[0], id: "open-sibling", status: "contacting" });
  const holds = new Map([[file.claims[0].id, { lead_id: file.id, firm_id: "firm", campaign_id: "inno", acquisition_hold: true, mapped_status: "dq" }]]);
  const queues = classify([file], [], [agreement(file, { status: "signed", signed_at: old })], { holds });
  assert.equal(queues.signed.length + queues.sent.length, 0); assert.equal(queues.calling[0].claimId, "open-sibling");
});
test("reviewed, completed and approved signed work does not age out", () => {
  for (const [status, providerStatus, reviewed] of [["signed_grievous", "signed", null], ["signed_grievous", "signed", recent], ["signed_qa", "completed", recent], ["signed_approved", "completed", recent]]) {
    const file = lead("old-signed", status!);
    const queues = classify([file], [], [agreement(file, { status: providerStatus, signed_at: old, agent_reviewed_at: reviewed })]);
    assert.equal(queues.signed.length, 1); assert.equal(queues.signed[0].at, old);
  }
});
test("a client signature moves a stale pre-signing status into Signed E-Sign", () => {
  const file = lead("webhook", "esign_sent");
  const queues = classify([file], [], [agreement(file, { status: "signed", signed_at: old })]);
  assert.equal(queues.sent.length, 0); assert.equal(queues.signed.length, 1);
  assert.match(queues.signed[0].href!, /review=webhook-agreement/);
});
test("an approved signature remains signed until delivery, even without a current envelope", () => {
  assert.equal(classify([{ ...lead("approved", "signed_approved"), signed_at: old }]).signed.length, 1);
});
test("unverified imported signing stays in QA, never Signed E-Sign", () => {
  const queues = classify([lead("imported", "external_signed_review")]);
  assert.equal(Object.values(queues).flat().length, 0);
});
test("latest exact-matter callback wins without crossing a sibling", () => {
  const file = lead("siblings", "contacting");
  file.claims.push({ ...file.claims[0], id: "sibling-closed", status: "dq" });
  const queues = classify([file], [call(file, { disposition: "callback", callback_at: old }), call(file, { claim_id: "sibling-closed", created_at: recent })]);
  assert.equal(queues.callbacks.length, 1); assert.equal(queues.calling.length, 0);
  const resumed = classify([file], [call(file, { disposition: "callback", callback_at: old }), call(file, { created_at: recent, disposition: "no_answer" })]);
  assert.equal(resumed.callbacks.length, 0); assert.equal(resumed.calling.length, 1);
});
test("ambiguous, foreign and passenger envelopes never sign the wrong file", () => {
  const file = lead("parent");
  for (const change of [{ firm_id: "foreign" }, { claim_id: "other" }, { campaign_id: "other" }, { pax_index: 0 }]) {
    const queues = classify([file], [], [agreement(file, { status: "signed", signed_at: old, ...change })]);
    assert.equal(queues.signed.length, 0);
  }
  file.claims.push({ ...file.claims[0], id: "sibling" });
  assert.equal(classify([file], [], [agreement(file, { claim_id: null, status: "signed" })]).signed.length, 0);
});
test("newest voided envelope does not revive an older pending envelope", () => {
  const file = lead("voided", "esign_sent");
  const queues = classify([file], [], [agreement(file), agreement(file, { id: "newest", created_at: recent, status: "voided", voided_at: recent })]);
  assert.equal(queues.sent.length, 0); assert.equal(queues.calling.length, 1);
});
test("correction waiting for signature is Sent E-Sign while signed original remains history", () => {
  const file = lead("corrected", "signed_grievous");
  const queues = classify([file], [], [agreement(file, { status: "signed", replacement_requested_at: recent }), agreement(file, { id: "replacement", created_at: recent })]);
  assert.equal(queues.sent.length, 1); assert.equal(queues.signed.length, 0); assert.equal(queues.wip.length, 0);
});
test("archives, other campaigns and other case types cannot leak into pilot queues", () => {
  const archived = { ...lead("archived"), archived_at: recent }, other = lead("other"), motel = lead("motel");
  other.claims[0].campaign_id = "other"; motel.claims[0].claim_type = "motel_trafficking";
  assert.equal(Object.values(classify([archived, other, motel])).flat().length, 0);
});
test("failed acquisition dependencies pause calling but preserve signed service work", () => {
  const queues = classify([lead("new"), lead("calling", "contacting"), { ...lead("signed", "signed_grievous"), signed_at: old }, lead("wip", "signed_wip")], [], [], { acquisitionReady: false });
  assert.equal(queues.new.length + queues.calling.length + queues.callbacks.length, 0);
  assert.equal(queues.signed.length + queues.wip.length, 2);
});
(async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: String(i).padStart(5, "0") }));
  const db = new FakeDb({ records: rows });
  assert.deepEqual((await readDeskRows(() => db.from("records").select("id"))).data, rows);
  passed++; console.log("ok pagination retains work beyond the first 1000 records");
  db.failOn = () => "offline";
  assert.ok((await readDeskRows(() => db.from("records").select("id"))).error);
  passed++; console.log("ok failed page is not silently presented as an empty queue");
  console.log(`${passed} Desk queue checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

