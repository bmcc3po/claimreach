import { isActiveFile, isTestFile } from './file-visibility';
import { sourceRefMatchesLead, speedToLeadMinutes, type PartnerSourceRef } from './partner-access';
import { summarizePartnerRows } from './partner-report-view';
import { validDqExplanation } from './dq-explanation';
import { resolveFileStatus } from './statuses';
import type { SignatureReportRow } from './signature-report';
import type { ReportAccess } from './partner-report-access';

export type PartnerReportRow = {
  name: string; phone: string; receivedAt: string | null; called: boolean;
  signed: 'Yes' | 'No' | 'Check signature'; signedAt: string | null; status: string;
  statusKey: string; deliveryGroup: 'awaiting' | 'sent' | 'declined' | null;
  speedMinutes: number | null; callDurationSeconds: number | null; state: string | null;
  lastActivityAt: string | null; notes: string | null;
  dqKind: 'Current intake DQ' | 'Historical DQ' | 'Firm turn-down' | null;
  dqReason: string | null; dqReview: string | null; campaign: string;
};
export type PartnerReportSummary = {
  total: number; signed: number; unsigned: number; verify: number; called: number;
  awaitingDelivery: number; sentToFirm: number; declined: number;
  inProgress: number; lost: number; signRate: number; averageSpeedMinutes: number | null; speedSamples: number;
};
const date = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
/** Receipt cohorts use the lead's ClaimReach creation timestamp. */
export function partnerReceivedDate(lead: any): string | null { return date(lead.created_at); }
export function partnerAllowedLeads(access: Pick<ReportAccess, 'firm_id' | 'scope'>, leads:any[], refs:PartnerSourceRef[]) {
  return leads.filter(l => l.firm_id === access.firm_id && isActiveFile(l) && !isTestFile(l) &&
    (access.scope === 'campaign' || refs.some(r => r.partner_key === 'pr-digital' && sourceRefMatchesLead(r,l))));
}
/** The only public projection. Never spread a lead, signature row, or document. */
export function partnerReportData(access: Pick<ReportAccess, 'firm_id' | 'campaign_id' | 'scope'>,
  leads: any[], claims: any[], signatures: SignatureReportRow[], refs: PartnerSourceRef[],
  evidence: { calls?: any[]; notes?: any[]; activities?: any[]; callLogs?: any[]; reasons?: any[]; statuses?: any[] } = {}) {
  const allowed = partnerAllowedLeads(access,leads,refs);
  const rows: PartnerReportRow[] = allowed.flatMap(lead => {
    const matters = claims.filter(c => c.lead_id === lead.id && c.firm_id === access.firm_id &&
      c.campaign_id === access.campaign_id && c.claim_type === 'mva');
    if (matters.length !== 1) return []; // Never choose an ambiguous matter.
    const sig = signatures.find(s => s.claimId === matters[0].id);
    if (!sig || sig.archived || sig.test) return [];
    const declined = sig.declined || sig.firmDecision === 'Firm declined';
    const status = declined ? resolveFileStatus({ status: 'signed_dropped' }).label : sig.status;
    const sole = claims.filter(c => c.lead_id === lead.id && c.firm_id === access.firm_id).length === 1;
    const claim = matters[0];
    const scoped = (r: any) => r.firm_id === access.firm_id && r.lead_id === lead.id &&
      (r.claim_id === claim.id || !r.claim_id && sole);
    // Communications have no claim_id. Do not attribute another matter's calls.
    const comms = sole ? (evidence.calls || []).filter(scoped) : [];
    const calls = comms.filter(r => ['call','voicemail'].includes(r.channel));
    const logs = (evidence.callLogs || []).filter(scoped);
    const callDates = calls.map(r => date(r.occurred_at)).filter((v): v is string => !!v);
    const first = [sole ? date(lead.first_dialed_at) : null, ...callDates]
      .filter((v): v is string => !!v).sort((a,b) => Date.parse(a)-Date.parse(b))[0] || null;
    const called = !!(first || logs.some(r => date(r.created_at)) || sole && date(lead.last_called_at));
    const receivedAt = partnerReceivedDate(lead);
    const activities = (evidence.activities || []).filter(r => r.firm_id === access.firm_id && r.lead_id === lead.id &&
      (r.meta?.claim_id === claim.id || !r.meta?.claim_id && sole));
    const lastActivityAt = [...comms.map(r => date(r.occurred_at)), sole ? date(lead.last_called_at) : null, ...logs.map(r => date(r.created_at)),
      ...activities.map(r => date(r.created_at)), date(sig.signedAt), date(sig.deliveredAt), date(sig.decisionAt)]
      .filter((v): v is string => !!v).sort((a,b) => Date.parse(b)-Date.parse(a))[0] || null;
    const durations = calls.filter(r => r.channel === 'call' && typeof r.duration_sec === 'number' && r.duration_sec >= 0);
    const key = sig.statusKey || claim.status || 'new';
    // A recorded call is progress even when a legacy import kept the New key.
    // This is a read-only presentation; signed/closed statuses take precedence.
    const statusKey = sig.state === 'unsigned' && key === 'new' && called ? 'contacting' : key;
    const displayStatus = statusKey !== key ? resolveFileStatus({ status: statusKey }).label : status;
    const rawState = String(lead.mail_state || '').trim();
    const state = /^[a-z]{2}$/i.test(rawState) ? rawState.toUpperCase() : rawState || null;
    const deliveryGroup = sig.state !== 'signed' ? null : declined ? 'declined' as const :
      date(sig.deliveredAt) || sig.ownerSent === true ? 'sent' as const : 'awaiting' as const;
    const isDq = resolveFileStatus({ status: key }, evidence.statuses).qualify === 'disqualify';
    const dqKind = declined || key === 'signed_dropped' || key === 'dq_billable' ? 'Firm turn-down' as const : isDq ? 'Current intake DQ' as const : claim.dq_reason_key || claim.dq_explanation ? 'Historical DQ' as const : null;
    const reason = (evidence.reasons || []).find(r => r.key === claim.dq_reason_key);
    const explanation = validDqExplanation(claim.dq_explanation) ? claim.dq_explanation.trim() : null;
    const dqReason = dqKind ? reason?.label || 'Reason missing' : null;
    const dqReview = dqKind ? !reason && !explanation ? 'Review required: reason and explanation missing' : !reason ? 'Review required: reason missing' : !explanation ? 'Review required: explanation missing' : 'Reviewed explanation recorded' : null;
    return [{ name: lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Name not recorded',
      phone: lead.phone || '', receivedAt,
      statusKey, deliveryGroup, state, lastActivityAt, notes: dqKind ? explanation : null, dqKind, dqReason, dqReview, campaign: 'INNO MVA',
      speedMinutes: receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) ? speedToLeadMinutes(receivedAt, first) : null,
      callDurationSeconds: durations.length ? durations.reduce((sum,r) => sum + r.duration_sec, 0) : null,
      called,
      signed: sig.state === 'signed' ? 'Yes' as const : sig.state === 'verify' ? 'Check signature' as const : 'No' as const,
      signedAt: sig.state === 'signed' ? sig.signedAt : null,
      status: sig.state === 'verify' ? `${displayStatus} · signature needs verification` : displayStatus }];
  }).sort((a,b) => (b.receivedAt || '').localeCompare(a.receivedAt || '') || a.name.localeCompare(b.name));
  return { rows, summary: summarizePartnerRows(rows) };
}
/** Keep the public projection shared with the summary's eligibility rules. */
export function partnerReportRows(...args: Parameters<typeof partnerReportData>): PartnerReportRow[] {
  return partnerReportData(...args).rows;
}
