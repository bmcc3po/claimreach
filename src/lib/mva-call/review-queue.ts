import { agreementName } from "./agreement-names";

export interface ClientSignedReviewRow {
  id: string; lead_id: string; claim_id: string | null; campaign_id: string | null; firm_id: string | null;
  status: string; signed_at: string | null; voided_at: string | null; agent_reviewed_at: string | null;
  signer_name: string | null; template_key: string | null;
  leads: { id: string; firm_id: string; campaign_id: string | null; archived_at: string | null; claimant_name: string | null; phone: string | null } | null;
}
export interface ReviewMatter { id: string; lead_id: string; firm_id: string; campaign_id: string | null; claim_type: string }
export interface ReviewQueueRow {
  id: string; name: string | null; phone: string | null; sub: string; at: string;
  tag: string; href: string;
}

/** Queue only the exact active MVA matter that owns an unreviewed client
 * signature. A same-name lead or another firm's/campaign's matter never stands
 * in for the submission's claim_id. */
export function clientSignedReviewQueue(rows: ClientSignedReviewRow[], matters: ReviewMatter[], innoCampaignIds: string[]): ReviewQueueRow[] {
  const allowed = new Set(innoCampaignIds);
  const claims = new Map(matters.map((claim) => [claim.id, claim]));
  return rows.flatMap((row) => {
    const lead = row.leads, claim = row.claim_id ? claims.get(row.claim_id) : null;
    if (row.status !== "signed" || !row.signed_at || row.voided_at || row.agent_reviewed_at || !lead || lead.archived_at || !claim) return [];
    if (claim.lead_id !== row.lead_id || lead.id !== row.lead_id || claim.firm_id !== row.firm_id || lead.firm_id !== row.firm_id) return [];
    if (claim.claim_type !== "mva" || !claim.campaign_id || !allowed.has(claim.campaign_id) || claim.campaign_id !== row.campaign_id || lead.campaign_id !== row.campaign_id) return [];
    return [{ id: row.id, name: lead.claimant_name || row.signer_name, phone: lead.phone,
      sub: `${agreementName(row.template_key)} · Client signed; office copy still pending`, at: row.signed_at,
      tag: "Review", href: `/app/${row.lead_id}?claim=${claim.id}&review=${row.id}` }];
  });
}
