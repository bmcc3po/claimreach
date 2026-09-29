// Run: node ../ts-test-runner.cjs src/lib/mva-call/review-queue.test.ts
import assert from "node:assert/strict";
import { clientSignedReviewQueue, type ClientSignedReviewRow, type ReviewMatter } from "./review-queue";

const claim: ReviewMatter = { id: "matter-1", lead_id: "lead-1", firm_id: "tmp", campaign_id: "inno", claim_type: "mva" };
const row: ClientSignedReviewRow = {
  id: "agreement-1", lead_id: "lead-1", claim_id: "matter-1", campaign_id: "inno", firm_id: "tmp",
  status: "signed", signed_at: "2026-09-29T17:00:00Z", voided_at: null, agent_reviewed_at: null,
  signer_name: "Case Tester", template_key: "NV_FLAT",
  leads: { id: "lead-1", firm_id: "tmp", campaign_id: "inno", archived_at: null, claimant_name: "Case Tester", phone: "7025550142" },
};

const found = clientSignedReviewQueue([row], [claim], ["inno"]);
assert.equal(found.length, 1);
assert.equal(found[0].href, "/app/lead-1?claim=matter-1&review=agreement-1");
assert.match(found[0].sub, /Nevada non-tiered.*office copy still pending/);
for (const change of [
  { status: "completed" }, { voided_at: "2026-09-29T18:00:00Z" },
  { agent_reviewed_at: "2026-09-29T18:00:00Z" }, { claim_id: null },
  { firm_id: "other" }, { campaign_id: "other" },
  { leads: { ...row.leads!, archived_at: "2026-09-29T18:00:00Z" } },
]) assert.deepEqual(clientSignedReviewQueue([{ ...row, ...change }], [claim], ["inno"]), []);
assert.deepEqual(clientSignedReviewQueue([row], [{ ...claim, firm_id: "other" }], ["inno"]), []);
assert.deepEqual(clientSignedReviewQueue([row], [{ ...claim, claim_type: "motel" }], ["inno"]), []);
assert.deepEqual(clientSignedReviewQueue([row], [claim], ["unrelated"]), []);
console.log("ok client-signed review queue stays on the exact active INNO MVA matter");
