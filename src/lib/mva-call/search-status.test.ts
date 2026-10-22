import assert from "node:assert/strict";
import { test } from "node:test";
import { searchStatusLabel } from "./search-status";
import { OWNER_SENT_UNKNOWN_DATE } from "../owner-file-confirmation";

test("search uses confirmed delivery wording for imports and scoped native signatures", () => {
  const lead = { id: "lead", signed_at: "2026-10-01" };
  const claim = { id: "claim", firm_id: "firm", status: "delivered" };
  const signed = { lead_id: "lead", claim_id: "claim", firm_id: "firm", status: "completed", signed_at: "2026-10-01", created_at: "2026-10-01" };
  assert.equal(searchStatusLabel(lead, { ...claim, firm_send_result: OWNER_SENT_UNKNOWN_DATE }, []), "Sent to firm");
  assert.equal(searchStatusLabel(lead, claim, [signed]), "Sent to firm");
  for (const other of [{ claim_id: "sibling" }, { firm_id: "other" }, { lead_id: "other" }, { pax_index: 0 }, { voided_at: "2026-10-02" }, { replacement_requested_at: "2026-10-02" }]) {
    assert.equal(searchStatusLabel(lead, claim, [{ ...signed, ...other }]), "Sent to firm");
  }
  assert.equal(searchStatusLabel(lead, claim, [signed, { ...signed, status: "voided", created_at: "2026-10-02" }]), "Sent to firm");
  assert.equal(searchStatusLabel(lead, claim, []), "Sent to firm", "lead-wide signed date alone is insufficient");
});
