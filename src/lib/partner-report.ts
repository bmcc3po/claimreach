import { isActiveFile, isTestFile } from './file-visibility';
import { sourceRefMatchesLead, type PartnerSourceRef } from './partner-access';
import { resolveFileStatus } from './statuses';
import type { SignatureReportRow } from './signature-report';
import type { ReportAccess } from './partner-report-access';

export type PartnerReportRow = {
  name: string; phone: string; receivedAt: string | null; called: boolean;
  signed: 'Yes' | 'No' | 'Check signature'; signedAt: string | null; status: string;
};
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
/** The only public projection. Never spread a lead, signature row, or document. */
export function partnerReportRows(access: Pick<ReportAccess, 'firm_id' | 'campaign_id' | 'scope'>,
  leads: any[], claims: any[], signatures: SignatureReportRow[], refs: PartnerSourceRef[]): PartnerReportRow[] {
  const allowed = leads.filter(l => l.firm_id === access.firm_id && isActiveFile(l) && !isTestFile(l) &&
    (access.scope === 'campaign' || refs.some(r => r.partner_key === 'pr-digital' && sourceRefMatchesLead(r, l))));
  return allowed.flatMap(lead => {
    const matters = claims.filter(c => c.lead_id === lead.id && c.firm_id === access.firm_id &&
      c.campaign_id === access.campaign_id && c.claim_type === 'mva');
    if (matters.length !== 1) return []; // Never choose an ambiguous matter.
    const sig = signatures.find(s => s.claimId === matters[0].id);
    if (!sig || sig.archived || sig.test) return [];
    const declined = sig.declined || sig.firmDecision === 'Firm declined';
    const status = declined ? resolveFileStatus({ status: 'signed_dropped' }).label : sig.status;
    return [{ name: lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Name not recorded',
      phone: lead.phone || '', receivedAt: date(lead.lawruler_created_at) || (lead.source_system === 'lawruler' ? null : date(lead.created_at)),
      called: !!(date(lead.first_dialed_at) || date(lead.last_called_at)),
      signed: sig.state === 'signed' ? 'Yes' as const : sig.state === 'verify' ? 'Check signature' as const : 'No' as const,
      signedAt: sig.state === 'signed' ? sig.signedAt : null,
      status: sig.state === 'verify' ? `${status} · signature needs verification` : status }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}
