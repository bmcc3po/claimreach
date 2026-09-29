import { sourceRefMatchesLead, speedToLeadMinutes, type PartnerSourceRef } from './partner-access';

export interface PartnerDashboardRow {
  sourceLeadId: string;
  leadNo: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  marketingSource: string | null;
  receivedAt: string | null;
  firstDialedAt: string | null;
  speedMinutes: number | null;
  lastCalledAt: string | null;
  claimReachCalls: number | null;
  agentName: string | null;
  claimStatus: string | null;
  signed: boolean;
  disqualified: boolean;
  sourceStatus: string | null;
  sourceSignedReported: boolean;
  sourceDqReported: boolean;
  sourceDqReason: string | null;
  dqReason: string | null;
  signedAt: string | null;
  syncState: 'import_pending' | 'identity_review' | 'matter_review' | 'imported';
}

/** Only an exact approved LawRuler ID + firm can produce a visible lead.
 * Ambiguous lead/matter identity shows a review marker, never a guessed file. */
export function buildPartnerRows(opts: {
  refs: PartnerSourceRef[];
  leads: any[];
  claims: any[];
  calls: any[];
  agreements: any[];
  agents: any[];
  statuses: any[];
}): PartnerDashboardRow[] {
  const agents = new Map(opts.agents.map(a => [a.id, a.full_name]));
  const labels = new Map(opts.statuses.map(s => [s.key, s.label]));
  const statusDefs = new Map(opts.statuses.map(s => [s.key, s]));
  return opts.refs.map(ref => {
    const matches = opts.leads.filter(l => sourceRefMatchesLead(ref, l));
    const lead = matches.length === 1 ? matches[0] : null;
    const matters = lead ? opts.claims.filter(c => c.lead_id === lead.id && c.firm_id === ref.firm_id && c.campaign === 'INNO MVA') : [];
    const claim = matters.length === 1 ? matters[0] : null;
    const completed = claim ? opts.agreements.filter(a =>
      a.claim_id === claim.id && a.lead_id === lead.id && a.firm_id === ref.firm_id &&
      a.provider === 'docuseal' && a.pax_index == null && !a.voided_at &&
      a.status === 'completed' && !!a.completed_pdf_path && !!a.cert_pdf_path
    ) : [];
    const agreement = completed.sort((a, b) => Date.parse(b.completed_at || b.signed_at || '') - Date.parse(a.completed_at || a.signed_at || ''))[0];
    const calls = lead ? opts.calls.filter(c => c.lead_id === lead.id && c.firm_id === ref.firm_id && c.direction === 'outbound') : [];
    const receivedAt = lead?.lawruler_created_at || lead?.created_at || null;
    const syncState: PartnerDashboardRow['syncState'] = matches.length > 1 ? 'identity_review' : !lead ? 'import_pending' : matters.length !== 1 ? 'matter_review' : 'imported';
    const sourceStatus = typeof lead?.vendor_fields?.lawruler_status === 'string'
      ? lead.vendor_fields.lawruler_status.trim() : null;
    const sourceStatusKey = sourceStatus?.toLowerCase() || '';
    const sourceSignedReported = /^signed(?:\b|[-_:])/.test(sourceStatusKey) || claim?.status === 'external_signed_review';
    const sourceDqReported = ['disqualified', 'already represented', 'wrong number', 'do not call request', 'not interested', 'duplicate'].includes(sourceStatusKey)
      || claim?.status === 'external_dq_review';
    const sourceDqReason = ['already represented', 'wrong number', 'do not call request', 'not interested', 'duplicate'].includes(sourceStatusKey)
      ? sourceStatus : null;
    return {
      sourceLeadId: ref.source_lead_id,
      leadNo: lead?.lead_no || null,
      name: lead ? (lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null) : null,
      phone: lead?.phone || null, email: lead?.email || null,
      marketingSource: lead?.marketing_source || null,
      receivedAt, firstDialedAt: lead?.first_dialed_at || null,
      speedMinutes: speedToLeadMinutes(receivedAt, lead?.first_dialed_at),
      lastCalledAt: lead?.last_called_at || null,
      claimReachCalls: lead ? calls.length : null,
      agentName: (lead?.assigned_agent && agents.get(lead.assigned_agent)) || null,
      claimStatus: claim ? labels.get(claim.status) || claim.status : null,
      signed: !!agreement,
      disqualified: !!claim && statusDefs.get(claim.status)?.qualify === 'disqualify',
      sourceStatus, sourceSignedReported, sourceDqReported, sourceDqReason,
      dqReason: claim?.dq_reason || claim?.dq_reason_key || null,
      signedAt: agreement?.signed_at || null,
      syncState,
    };
  }).sort((a,b) => Number(b.sourceLeadId) - Number(a.sourceLeadId));
}
