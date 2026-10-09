import { isActiveFile, isTestFile } from './file-visibility';
import { sourceRefMatchesLead, type PartnerSourceRef } from './partner-access';
import { resolveFileStatus } from './statuses';
import type { SignatureReportRow } from './signature-report';
import type { ReportAccess } from './partner-report-access';

export type PartnerReportRow = {
  name: string; phone: string; receivedAt: string | null; called: boolean;
  signed: 'Yes' | 'No' | 'Check signature'; signedAt: string | null; status: string;
};
export type PartnerReportSummary = {
  total: number; signed: number; unsigned: number; verify: number; called: number;
  awaitingDelivery: number; sentToFirm: number; declined: number;
};
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
/** Recover the original date from the exact source snapshot, never its sync timestamp. */
export function partnerReceivedDate(lead: any): string | null {
  if (date(lead.lawruler_created_at)) return lead.lawruler_created_at;
  if (lead.source_system !== 'lawruler') return date(lead.created_at);
  const source = lead.vendor_fields?.sources?.lawruler;
  if (source?.LeadID !== lead.lawruler_ref_no || String(source?.CaseType || '').trim().toLowerCase() !== 'inno mva') return null;
  const value = String(source?.LeadCreated || '').trim();
  const us = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const iso = us ? `${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !date(iso) || new Date(iso).toISOString().slice(0,10) !== iso) return null;
  return iso;
}
/** The only public projection. Never spread a lead, signature row, or document. */
export function partnerReportData(access: Pick<ReportAccess, 'firm_id' | 'campaign_id' | 'scope'>,
  leads: any[], claims: any[], signatures: SignatureReportRow[], refs: PartnerSourceRef[]) {
  const summary: PartnerReportSummary = { total: 0, signed: 0, unsigned: 0, verify: 0, called: 0, awaitingDelivery: 0, sentToFirm: 0, declined: 0 };
  const allowed = leads.filter(l => l.firm_id === access.firm_id && isActiveFile(l) && !isTestFile(l) &&
    (access.scope === 'campaign' || refs.some(r => r.partner_key === 'pr-digital' && sourceRefMatchesLead(r, l))));
  const rows: PartnerReportRow[] = allowed.flatMap(lead => {
    const matters = claims.filter(c => c.lead_id === lead.id && c.firm_id === access.firm_id &&
      c.campaign_id === access.campaign_id && c.claim_type === 'mva');
    if (matters.length !== 1) return []; // Never choose an ambiguous matter.
    const sig = signatures.find(s => s.claimId === matters[0].id);
    if (!sig || sig.archived || sig.test) return [];
    const declined = sig.declined || sig.firmDecision === 'Firm declined';
    const status = declined ? resolveFileStatus({ status: 'signed_dropped' }).label : sig.status;
    const called = !!(date(lead.first_dialed_at) || date(lead.last_called_at));
    // Count only the same scoped, unambiguous matters projected below. Status text
    // is not delivery evidence, and uncertain signatures are not unsigned files.
    summary.total++;
    if (called) summary.called++;
    if (sig.state === 'signed') {
      summary.signed++;
      const delivered = !!date(sig.deliveredAt) || sig.ownerSent === true;
      if (delivered) summary.sentToFirm++;
      if (declined) summary.declined++;
      if (!delivered && !declined) summary.awaitingDelivery++;
    } else if (sig.state === 'verify') summary.verify++;
    else summary.unsigned++;
    return [{ name: lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Name not recorded',
      phone: lead.phone || '', receivedAt: partnerReceivedDate(lead),
      called,
      signed: sig.state === 'signed' ? 'Yes' as const : sig.state === 'verify' ? 'Check signature' as const : 'No' as const,
      signedAt: sig.state === 'signed' ? sig.signedAt : null,
      status: sig.state === 'verify' ? `${status} · signature needs verification` : status }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { rows, summary };
}
/** Keep the seven-column projection shared with the summary's eligibility rules. */
export function partnerReportRows(...args: Parameters<typeof partnerReportData>): PartnerReportRow[] {
  return partnerReportData(...args).rows;
}
