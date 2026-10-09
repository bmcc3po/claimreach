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

test('NETFLY original needs the latest same-matter PDF reviewed; review date is never signing date',()=>{
  const f=fixture();f.submissions=[];f.claims[0].answers={netfly_secondary:{review:{retainer_reviewed_document_id:'pdf',status:'retainer_reviewed'}}};
  f.documents=[{id:'pdf',firm_id:'f',lead_id:'l',claim_id:'c',doc_type:'netfly_signed_retainer',created_at:'2026-10-01'}];
  const [r]=signatureReport(f);assert.equal(r.state,'signed');assert.equal(r.signedAt,null);
  f.documents.push({...f.documents[0],id:'new',created_at:'2026-10-02'});assert.equal(signatureReport(f)[0].state,'verify');
  f.documents=[{...f.documents[0],claim_id:'sibling'}];assert.notEqual(signatureReport(f)[0].state,'signed');
});
test('firm rejection and reason remain visible without erasing signature/delivery; sibling decisions stay isolated', () => {
  const f=fixture(); f.claims[0].firm_send_result=OWNER_SENT_UNKNOWN_DATE;
  f.reviews=[{id:'a',firm_id:'f',lead_id:'l',created_at:'2026-10-05',meta:{event:'firm_file_review',claim_id:'c',campaign_id:'inno',action:'turned_down',explanation:'Treatment gap'}},
    {id:'b',firm_id:'f',lead_id:'l',created_at:'2026-10-06',meta:{event:'firm_file_review',claim_id:'other',campaign_id:'inno',action:'accepted'}}];
  const [r]=signatureReport(f);assert.equal(r.state,'signed');assert.equal(r.ownerSent,true);assert.equal(r.firmDecision,'Firm declined');assert.equal(r.firmReason,'Treatment gap');
  assert.match(signatureCsv([r],'Firm','2026-10-05'),/Firm declined/);assert.match(signatureCsv([r],'Firm','2026-10-05'),/Treatment gap/);
});
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

test("invoice report retains delivery date after changing the firm email without crediting a sibling", () => {
  const f = fixture();
  f.deliveries = [
    { firm_id: 'other', lead_id: 'l', claim_id: 'c', ok: true, to_email: f.firmEmail, triggered_by: 'manual', created_at: '2026-09-01T00:00:00Z' },
    { firm_id: 'f', lead_id: 'l', claim_id: 'sibling', ok: true, to_email: f.firmEmail, triggered_by: 'manual', created_at: '2026-09-02T00:00:00Z' },
    { firm_id: 'f', lead_id: 'l', claim_id: 'c', ok: true, to_email: f.firmEmail, triggered_by: 'manual', created_at: '2026-10-02T00:00:00Z' },
  ];
  const before = signatureReport(f)[0]; f.firmEmail = 'replacement@firm.test';
  const after = signatureReport(f)[0];
  assert.equal(after.deliveredAt, '2026-10-02T00:00:00Z');
  assert.equal(after.returnEndsAt, before.returnEndsAt);
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

test('declined signed file retains its signature and delivery clock with bad-sign reason in export', () => {
  const f=fixture(); f.claims[0].status='signed_dropped';f.claims[0].dq_reason='Treatment gap';
  f.deliveries=[{firm_id:'f',lead_id:'l',claim_id:'c',ok:true,to_email:f.firmEmail,created_at:'2026-10-02T00:00:00Z'}];
  const [r]=signatureReport(f);assert.equal(r.state,'signed');assert.equal(r.declined,true);
  assert.equal(r.returnEndsAt,'2026-10-09T00:00:00.000Z');assert.equal(r.declineReason,'Treatment gap');
  assert.match(signatureCsv([r],'Firm','2026-10-07'),/Excluded — signed file declined/);
});
