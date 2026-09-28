// Run: npx tsx src/lib/mva-call/server.test.ts
import assert from "node:assert/strict";
import { parseDob, leadPatchFromAnswers, crashDateOf, caseSummaryRows, firmSpoken, splitName } from "./server";
import { validateDispo, callbackAt, DISPO_STATUS, DISPO_FIXED_DQ_KEY } from "./dispo";
import { stateCodeOf } from "./state";
import { ssnForForm } from "./esign";
import { statusFrom, webhookAuthorized, agreementKey, STATUS_RANK } from "../docuseal";
import { passwordProblem } from "../password-rules";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };

t("dob parses the ways agents type it", () => {
  assert.equal(parseDob("04/12/1991"), "1991-04-12");
  assert.equal(parseDob("4/12/91"), "1991-04-12");
  assert.equal(parseDob("04121991"), "1991-04-12");
  assert.equal(parseDob("1991-04-12"), "1991-04-12");
  assert.equal(parseDob("02/30/1991"), null);
  assert.equal(parseDob("13/01/1991"), null);
  assert.equal(parseDob(""), null);
  assert.equal(parseDob("01/01/2999"), null);
});

t("lead patch only carries what was filled, never a blank", () => {
  const p = leadPatchFromAnswers({ send: { client: "Maria Lopez", email: "not-an-email" }, file: { dob: "04/12/1991", addr: "", ssn: "123456789" }, story: { when: "Pick a date", date: "2026-09-20" } });
  assert.deepEqual(p, { claimant_name: "Maria Lopez", first_name: "Maria", last_name: "Lopez", dob: "1991-04-12", incident_start: "2026-09-20" });
  assert.ok(!("ssn" in p) && !("email" in p) && !("mail_addr1" in p));
});

t("lead patch: home address splits, the cell is the file's cell unless texting another number", () => {
  const p = leadPatchFromAnswers({ send: { phone: "(708) 916-1007" }, file: { addr: "18475 Zurich Ln, Tinley Park, IL 60477" } });
  assert.equal(p.phone, "7089161007");
  assert.deepEqual([p.mail_addr1, p.mail_city, p.mail_state, p.mail_zip], ["18475 Zurich Ln", "Tinley Park", "IL", "60477"]);
  const q = leadPatchFromAnswers({ send: { phone: "3125550199", toOther: true } });
  assert.ok(!("phone" in q));
});

t("crash date from Today and Yesterday", () => {
  const now = new Date(2026, 8, 25, 22, 0, 0);
  assert.equal(crashDateOf({ when: "Today" }, now), "2026-09-25");
  assert.equal(crashDateOf({ when: "Yesterday" }, now), "2026-09-24");
  assert.equal(crashDateOf({ when: "Pick a date", date: "bad" }, now), null);
});

t("case summary never prints an SSN", () => {
  const rows = caseSummaryRows({ claimant_name: "Maria", phone: "8325550148" }, { file: { ssn: "123456789", addr: "1 Main" }, story: { fault: "Other driver" } });
  assert.ok(!JSON.stringify(rows).includes("123456789"));
  assert.ok(rows.some((r) => r.k === "Phone" && r.v === "(832) 555-0148"));
});

t("firm name said out loud", () => {
  assert.equal(firmSpoken("Turnbull Moak & Pendergrass"), "Turnbull Moak and Pendergrass");
  assert.deepEqual(splitName("  Mary Ann   Smith "), { first: "Mary", last: "Ann Smith" });
});

t("state from city, one definition", () => {
  assert.equal(stateCodeOf("Houston, TX"), "TX");
  assert.equal(stateCodeOf("Miami, Florida"), "FL");
  assert.equal(stateCodeOf("Mobile, al"), "AL");
  assert.equal(stateCodeOf("Houston"), null);
  assert.equal(agreementKey("TX"), "TX");
  assert.equal(agreementKey("FL"), "FL");
  assert.equal(agreementKey("GA"), "OTHER");
  assert.equal(agreementKey(null), null);
});

t("dispo validation", () => {
  assert.equal(validateDispo({ dispo: "nope" }).ok, false);
  assert.equal(validateDispo({ dispo: "dq", reasons: [] }).ok, false);
  assert.equal(validateDispo({ dispo: "callback", reasons: ["driving"] }).ok, false);
  const ok = validateDispo({ dispo: "callback", reasons: ["driving", "driving"], callback_at: "2026-09-26T19:00:00Z", notify: ["BMC@innovativeintake.com"] });
  assert.ok(ok.ok && ok.value.reasons.length === 1 && ok.value.notify[0] === "bmc@innovativeintake.com");
  assert.equal(validateDispo({ dispo: "dq", reasons: ["DROP TABLE"] }).ok, false);
  assert.equal(validateDispo({ dispo: "signed", notify: ["bad"] }).ok, false);
  assert.ok(validateDispo({ dispo: "dnc" }).ok);
  assert.equal(DISPO_STATUS.signed, null);
  assert.equal(DISPO_FIXED_DQ_KEY.ni, "declined");
});

t("call back times", () => {
  const now = new Date(2026, 8, 25, 14, 0, 0);
  assert.equal(callbackAt("Tonight", null, now)!.getHours(), 19);
  const late = new Date(2026, 8, 25, 20, 0, 0);
  assert.equal(callbackAt("Tonight", null, late)!.getTime(), late.getTime() + 2 * 3600 * 1000);
  const tm = callbackAt("Tomorrow morning", null, now)!;
  assert.equal(tm.getDate(), 26); assert.equal(tm.getHours(), 9);
  assert.equal(callbackAt("Pick a time", "garbage", now), null);
  assert.equal(callbackAt(null, null, now), null);
});

t("SSN goes on the form as given, we keep last 4", () => {
  assert.deepEqual(ssnForForm("123-45-6789"), { printed: "123-45-6789", last4: "6789" });
  assert.deepEqual(ssnForForm("6789"), { printed: "XXX-XX-6789", last4: "6789" });
  assert.equal(ssnForForm("12345"), null);
});

t("DocuSeal status never goes backwards and reads the client", () => {
  assert.equal(statusFrom({ status: "pending", submitters: [{ id: 1, role: "Client", opened_at: "x" }] }), "opened");
  assert.equal(statusFrom({ status: "pending", submitters: [{ id: 1, role: "Client", completed_at: "x" }, { id: 2, role: "Intake" }] }), "signed");
  assert.equal(statusFrom({ status: "completed", submitters: [] }), "completed");
  assert.equal(statusFrom({ status: "pending", submitters: [{ id: 1, role: "Client", declined_at: "x" }] }), "declined");
  assert.ok(STATUS_RANK.signed > STATUS_RANK.opened && STATUS_RANK.completed > STATUS_RANK.signed);
});

t("webhook secret fails closed", () => {
  assert.equal(webhookAuthorized("abc", undefined), false);
  assert.equal(webhookAuthorized(null, "abc"), false);
  assert.equal(webhookAuthorized("abd", "abc"), false);
  assert.equal(webhookAuthorized("abc", "abc"), true);
});

t("starter passwords cannot come back", () => {
  assert.ok(passwordProblem("lisa123", "lisa@x.com"));
  assert.ok(passwordProblem("lisalisa1234", "lisa@x.com"));
  assert.ok(passwordProblem("Summer2026", null));
  assert.equal(passwordProblem("blue pickup 44 rain", "lisa@x.com"), null);
});

console.log(n, "passed");
