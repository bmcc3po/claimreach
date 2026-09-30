import assert from "node:assert/strict";
import { FakeDb } from "./test-fake-db";
import { setClaimStatusForLeads } from "./claim-status";
import { DEFAULT_STATUSES } from "./statuses";

const firmId = "firm-test", leadId = "lead-test", claimId = "claim-test";
function fixture() {
  return new FakeDb({
    leads: [{ id: leadId, firm_id: firmId, campaign_id: "campaign-test", claimant_name: "Synthetic Tester" }],
    claims: [{ id: claimId, lead_id: leadId, firm_id: firmId, campaign_id: "campaign-test", campaign: "Test MVA", claim_type: "mva", status: "signed_qa" }],
    statuses: DEFAULT_STATUSES.map((status) => ({ ...status })),
  });
}
async function approve(deliver: () => Promise<unknown>) {
  const db = fixture();
  const result = await setClaimStatusForLeads({ leadIds: [leadId], claimIds: [claimId], status: "signed_approved", statuses: DEFAULT_STATUSES }, {
    db, audit: async () => {}, automation: async () => {}, webhook: async () => {}, deliver,
  });
  assert.equal(db.tables.claims[0].status, "signed_approved");
  return result;
}

(async () => {
  const rejected = await approve(async () => ({ ok: false, error: "The signed certificate is missing. Nothing was emailed." }));
  assert.equal(rejected.ok, true);
  assert.match(rejected.deliveryWarning || "", /certificate is missing/);
  assert.match(rejected.deliveryWarning || "", /matter claim-test/);

  const held = await approve(async () => ({ ok: true, skipped: "Automatic delivery is off for this matter's campaign." }));
  assert.match(held.deliveryWarning || "", /Automatic delivery is off/);

  const uncertain = await approve(async () => { throw new Error("provider timeout"); });
  assert.equal(uncertain.ok, true);
  assert.match(uncertain.deliveryWarning || "", /could not be confirmed/);

  const alreadySent = await approve(async () => ({ ok: true, skipped: "This matter was already sent to the firm." }));
  assert.equal(alreadySent.deliveryWarning, undefined);

  const sent = await approve(async () => ({ ok: true, attachments: ["intake.pdf", "intake.csv"] }));
  assert.equal(sent.deliveryWarning, undefined);
  console.log("ok QA approval reports held, failed and uncertain firm handoffs without repeating a prior delivery");
})().catch((error) => { console.error(error); process.exitCode = 1; });
