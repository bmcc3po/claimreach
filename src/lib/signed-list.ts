import { isSignedKey, type SignedCatalogRow } from "./statuses";
import { ownerConfirmedDelivery } from "./owner-file-confirmation";
import { loadSignatureReport } from './signature-report-loader';

/** Reuse the same matter-scoped proof as the signature and partner reports. */
export async function attachSignatureEvidence(sb: any, leads: any[]): Promise<void> {
  const ids = [...new Set(leads.map(l=>l.firm_id).filter(Boolean))];
  for (const firmId of ids) {
    const { data: campaigns, error } = await sb.from('campaigns').select('id,firm_id,firm_email')
      .eq('firm_id',firmId).eq('case_type','mva').eq('name','INNO MVA');
    if (error) throw new Error('Signature evidence unavailable');
    for (const campaign of campaigns || []) {
      const proof = await loadSignatureReport(sb, campaign);
      for (const lead of leads.filter(l=>l.firm_id===firmId)) {
        const matches = proof.filter(p=>p.leadId===lead.id && p.state==='signed' && !p.archived && !p.test);
        if (matches.length) { lead.signature_verified = true; if (matches.length===1) lead.signed_at = matches[0].signedAt; }
      }
    }
  }
}

// A delivered, no-signature campaign is not a signed client. Status alone is
// insufficient: it also describes a firm handoff without a retainer.
export function isSignedClient(lead: any, catalog: SignedCatalogRow[] | null, signedSubmissionIds: Set<string>): boolean {
  if (lead.signature_verified === true) return true;
  const status = lead.claims?.[0]?.status ?? lead.status;
  return isSignedKey(status, catalog) && (!!lead.signed_at || signedSubmissionIds.has(lead.id) ||
    (status === "delivered" && ownerConfirmedDelivery(lead.claims?.[0]?.firm_send_result)));
}

export async function signedSubmissionIdsForLeads(sb: any, leadIds: string[]): Promise<Set<string>> {
  if (!leadIds.length) return new Set();
  const { data, error } = await sb.from("esign_submissions")
    .select("lead_id,signed_at,voided_at").in("lead_id", leadIds).not("signed_at", "is", null);
  if (error) return new Set();
  return new Set((data ?? []).filter((row: any) => row.signed_at && !row.voided_at).map((row: any) => row.lead_id));
}

