import assert from "node:assert/strict";
import { test } from "node:test";
import { signatureReport, signatureCsv, signatureRowsInRange, type SignatureReportInput } from "./signature-report";
import { reportPages } from "./signature-report-loader";
import { OWNER_FILE_CONFIRMATION, OWNER_SENT_UNKNOWN_DATE } from "./owner-file-confirmation";

function fixture(): SignatureReportInput {
  return { firmId: "f", campaignId: "inno", firmEmail: "firm@example.test", ownerEmail: "owner@example.test",
    leads: [{ id: "l", firm_id: "f", claimant_name: "Example Person", lead_no: "TMP-1" }],
    claims: [{ id: "c", lead_id: "l", firm_id: "f", campaign_id: "inno", claim_type: "mva", status: "new" }],
    submissions: [{ id: "s", lead_id: "l", firm_id: "f", claim_id: "c", campaign_id: "inno", status: "signed", signed_at: "2026-10-02T06:00:00Z", created_at: "2026-10-01T06:00:00Z" }],
    emergencies: [], originals: [], confirmations: [], ownerIds: ["owner"], deliveries: [], users: [], rehearsalKeys: [] };
}
test("confirmed signatures count independently of workflow status; no receipt means no clock", () => {
  const [row] = signatureReport(fixture());
  assert.equal(row.state, "signed"); assert.equal(row.deliveredAt, null); assert.equal(row.returnEndsAt, null);
  assert.equal(row.packet, "Office step needs review");
});
test("a claimed signed status or timestamp cannot create provider evidence", () => {
  const f = fixture(); f.submissions = []; f.claims[0].status = "signed_qa";
  assert.equal(signatureReport(f)[0].state, "unsigned");
  f.leads[0].signed_at = "2026-10-01T00:00:00Z";
  assert.equal(signatureReport(f)[0].state, "verify");
});
test("unconfirmed provider statuses and void/replacement history need review", () => {
  for (const patch of [{ status: "sent" }, { voided_at: "2026-10-03" }, { replacement_requested_at: "2026-10-03" }]) {
    const f = fixture(); Object.assign(f.submissions[0], patch);
    assert.equal(signatureReport(f)[0].state, "verify");
  }
  const f = fixture(); f.submissions.push({ ...f.submissions[0], id: "new", created_at: "2026-10-03T00:00:00Z", signed_at: null, status: "voided" });
  assert.equal(signatureReport(f)[0].state, "verify");
});
test("newer emergency supersedes the native packet", () => {
  const f = fixture(); f.emergencies = [{ firm_id: "f", lead_id: "l", audit: { emergency: { claim_id: "c" } }, status: "signed", created_at: "2026-10-03T00:00:00Z" }];
  assert.equal(signatureReport(f)[0].state, "verify");
});
test("matter, campaign and firm isolation; ambiguous legacy rows cannot fill siblings", () => {
  const f = fixture(); f.submissions[0].claim_id = null;
  f.claims.push({ ...f.claims[0], id: "sibling", campaign_id: "netfly" });
  assert.equal(signatureReport(f)[0].state, "unsigned");
  f.submissions[0].claim_id = "c"; f.submissions[0].firm_id = "foreign";
  assert.equal(signatureReport(f)[0].state, "unsigned");
  f.claims[0].campaign_id = "netfly"; assert.equal(signatureReport(f).length, 0);
});
test("passenger's own file counts; an old passenger envelope on driver does not", () => {
  const f = fixture(); f.submissions[0].pax_index = 0;
  assert.equal(signatureReport(f)[0].state, "unsigned");
  f.leads[0].external_id = "00000000-0000-4000-8000-000000000001:pax:one";
  assert.equal(signatureReport(f)[0].state, "signed");
});
test("owner-approved imported original is signed with unknown date; no fabricated clock", () => {
  const f = fixture(); f.submissions = []; f.originals = [{ firm_id: "f", lead_id: "l", meta: { claim_id: "c" } }];
  assert.equal(signatureReport(f)[0].state, "verify");
  f.confirmations = [{ actor: "owner", firm_id: "f", lead_id: "l", meta: { claim_id: "c", event: OWNER_FILE_CONFIRMATION, signature_confirmed: true, confirmation_source: "direct_owner_instruction" } }];
  f.claims[0].firm_send_result = OWNER_SENT_UNKNOWN_DATE;
  const [row] = signatureReport(f);
  assert.equal(row.state, "signed"); assert.equal(row.signedAt, null); assert.equal(row.ownerSent, true); assert.equal(row.returnEndsAt, null);
  f.confirmations[0].actor = "agent";
  assert.equal(signatureReport(f)[0].state, "verify");
  f.confirmations[0].actor = "owner";
  f.confirmations[0].meta.claim_id = "other";
  assert.equal(signatureReport(f)[0].state, "verify");
});
test("owner confirmation cannot revive a voided provider agreement", () => {
  const f = fixture(); f.submissions[0].status = "voided";
  f.originals = [{ firm_id: "f", lead_id: "l", meta: { claim_id: "c" } }];
  f.confirmations = [{ actor: "owner", firm_id: "f", lead_id: "l", meta: { claim_id: "c", event: OWNER_FILE_CONFIRMATION, signature_confirmed: true, confirmation_source: "direct_owner_instruction" } }];
  assert.equal(signatureReport(f)[0].state, "verify");
});
test("only successful same-matter firm delivery starts seven-day clock", () => {
  const f = fixture();
  f.deliveries = [
    { firm_id: "f", lead_id: "l", claim_id: "sibling", ok: true, to_email: f.firmEmail, created_at: "2026-10-01T00:00:00Z" },
    { firm_id: "f", lead_id: "l", claim_id: "c", ok: false, to_email: f.firmEmail, created_at: "2026-10-01T00:00:00Z" },
    { firm_id: "f", lead_id: "l", claim_id: "c", ok: true, to_email: f.ownerEmail, created_at: "2026-10-01T00:00:00Z" }];
  assert.equal(signatureReport(f)[0].deliveredAt, null);
  f.deliveries.push({ firm_id: "f", lead_id: "l", claim_id: "c", ok: true, to_email: f.firmEmail, created_at: "2026-10-02T00:00:00Z" });
  assert.equal(signatureReport(f)[0].returnEndsAt, "2026-10-09T00:00:00.000Z");
});
test("date filters use signature Pacific day, not created date, and undated stays in all-time", () => {
  const [row] = signatureReport(fixture());
  assert.equal(signatureRowsInRange([row], "2026-10-01", "2026-10-01").length, 1);
  assert.equal(signatureRowsInRange([{ ...row, signedAt: null }], "", "").length, 1);
  assert.equal(signatureRowsInRange([{ ...row, signedAt: null }], "2026-10-01", "2026-10-02").length, 0);
});
test("archive and rehearsal classification preserved for explicit inclusion", () => {
  const f = fixture(); f.leads[0].archived_at = "2026-10-03"; f.rehearsalKeys = ["REHEARSAL_l_OTHER"];
  const [row] = signatureReport(f); assert.equal(row.archived, true); assert.equal(row.test, true);
});
test("CSV protects spreadsheet formulas, quotes and newlines; preserves unknown invoice history", () => {
  const [r] = signatureReport(fixture());
  const csv = signatureCsv([{ ...r, name: '=HYPERLINK("x")\nnext', ownerSent: true }], "Example Firm", "2026-10-05");
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\nnext\""));
  assert.ok(csv.includes("Not tracked — reconcile prior invoices"));
  assert.ok(csv.includes("Sent — owner confirmed; date unknown"));
});
test("pagination reads beyond 1,000; a failed page fails the complete report", async () => {
  const data = Array.from({ length: 1201 }, (_, id) => ({ id }));
  assert.equal((await reportPages(() => ({ order() { return this; }, range(from: number, to: number) { return { data: data.slice(from, to + 1) }; } }))).length, 1201);
  await assert.rejects(reportPages(() => ({ order() { return this; }, range(from: number) { return from ? { error: { message: "failed" } } : { data: data.slice(0, 500) }; } })), /complete signature report/);
});
