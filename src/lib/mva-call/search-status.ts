import { resolveFileStatus } from "../statuses";
import { paxParentId } from "../linked-files";

/** Search evidence must name this matter; a sibling's signature is not enough. */
export function searchStatusLabel(lead: any, claim: any, submissions: any[]) {
  if (!claim) return null;
  const current = submissions.filter(s => s.lead_id === lead.id && s.claim_id === claim.id &&
    s.firm_id === claim.firm_id && (paxParentId(lead.external_id) || s.pax_index == null))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  const signed = !!current && !current.voided_at && !current.replacement_requested_at &&
    ["signed", "completed"].includes(current.status) && !!current.signed_at;
  return resolveFileStatus(claim, undefined, signed).label;
}
