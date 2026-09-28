// npx tsx src/lib/standard-fields.test.ts
import assert from "node:assert/strict";
import { STANDARD_FIELDS, STANDARD_KEYS, standardFromRows, STD_LEAD_COLS } from "./standard-fields";
import { mapInbound, canonicalToLeadColumns } from "./webhooks";
import { leadPatchFromAnswers } from "./mva-call/server";

let pass = 0;
function t(name: string, fn: () => void) { fn(); pass++; console.log("ok", name); }

t("keys are unique and every key is built", () => {
  assert.equal(new Set(STANDARD_KEYS).size, STANDARD_KEYS.length);
  const rec = standardFromRows({ lead: {} });
  for (const k of STANDARD_KEYS) assert.ok(k in rec, `missing ${k}`);
  for (const k of Object.keys(rec)) assert.ok(STANDARD_KEYS.includes(k), `unlisted ${k}`);
});

t("one source per field: the cell is leads.phone, never a legacy copy", () => {
  const rec = standardFromRows({
    lead: { id: "L1", lead_no: "TMP-1", phone: "7089161007", ip_phone: "9999999999", caller_phone: "8888888888", email: "a@b.co", caller_email: "x@y.z",
      mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477", address: "old line",
      home_phone: "7085550001", work_phone: "7085550002", dl_number: "D123", incident_start: "2026-09-20", incident_city: "Las Vegas", incident_state: "NV",
      created_at: "2026-09-28T16:43:00Z", first_dialed_at: "2026-09-28T16:45:00Z", last_called_at: "2026-09-28T19:01:00Z", ssn_last4: "1234", first_name: "Ariana", last_name: "Garafalo" },
    claim: { id: "C1", status: "signed_qa", campaign: "INNO MVA", claim_type: "mva", answers: { mva_call: { file: { report: "LV-77", carrier: "GEICO" } } } },
    statusLabel: "Signed: QA", firmName: "Turnbull Moak & Pendergrass",
    submission: { template_key: "NV_FLAT", status: "completed", sent_at: "2026-09-28T19:05:00Z", completed_at: "2026-09-28T19:20:00Z" },
    signingAgent: "Lisa Grant",
    lastCall: { disposition: "signed", reason: null },
  });
  assert.equal(rec.cell_phone, "7089161007");
  assert.equal(rec.email, "a@b.co");
  assert.equal(rec.full_address, "18475 Zurich Ln, Tinley Park, IL 60477");
  assert.equal(rec.full_name, "Ariana Garafalo");
  assert.equal(rec.incident_state, "NV");
  assert.equal(rec.agreement, "Nevada non-tiered");
  assert.equal(rec.sign_date, "2026-09-28T19:20:00Z");
  assert.equal(rec.signing_agent, "Lisa Grant");
  assert.equal(rec.status_label, "Signed: QA");
  assert.equal(rec.outcome, "Signed");
  assert.equal(rec.police_report_number, "LV-77");
  assert.equal(rec.other_driver_insurance, "GEICO");
  assert.equal(rec.first_contact_at, "2026-09-28T16:45:00Z");
  assert.ok(!("ssn" in rec));
});

t("an unsigned agreement names no signing agent", () => {
  const rec = standardFromRows({ lead: {}, submission: { template_key: "TX", status: "opened", sent_at: "x" }, signingAgent: "Lisa" });
  assert.equal(rec.signing_agent, null);
  assert.equal(rec.esign_sent_date, "x");
});

t("the lead select names only real columns the record reads", () => {
  for (const c of ["phone", "home_phone", "work_phone", "dl_number", "incident_city", "incident_state", "mail_addr1"]) assert.ok(STD_LEAD_COLS.split(", ").includes(c));
  assert.ok(!STD_LEAD_COLS.includes("mail_address1"));
});

t("inbound: a sender using our standard names needs no mapping", () => {
  const cols = canonicalToLeadColumns(mapInbound({ first_name: "Ann", last_name: "Lee", cell_phone: "7085550000", home_phone: "7085550001", work_phone: "7085550002",
    email: "ann@x.co", address1: "1 A St", city: "Joliet", state: "IL", zip: "60431", dl_number: "L99", incident_date: "2026-09-01", incident_state: "NV", incident_city: "Reno" }));
  assert.equal(cols.phone, "7085550000");
  assert.equal(cols.home_phone, "7085550001");
  assert.equal(cols.work_phone, "7085550002");
  assert.equal(cols.mail_addr1, "1 A St");
  assert.equal(cols.dl_number, "L99");
  assert.equal(cols.incident_start, "2026-09-01");
  assert.equal(cols.incident_state, "NV");
  assert.equal(cols.incident_city, "Reno");
});

t("the call writes license and where the wreck happened onto the record", () => {
  const p = leadPatchFromAnswers({ story: { city: "Las Vegas, NV" }, file: { dl: "D-555" } });
  assert.equal(p.incident_state, "NV");
  assert.equal(p.incident_city, "Las Vegas");
  assert.equal(p.dl_number, "D-555");
});

t("every field has a label and a group", () => {
  for (const f of STANDARD_FIELDS) { assert.ok(f.label); assert.ok(f.group); assert.ok(f.source); }
});
console.log(`${pass} passed`);
