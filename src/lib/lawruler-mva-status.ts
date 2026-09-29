import { setClaimStatusForLeads } from './claim-status';
import { isSignedKey, type StatusDef } from './statuses';

const EVENT = 'mva_status_reconciliation';
export const EXTERNAL_SIGNED_REVIEW = 'external_signed_review';
export const EXTERNAL_DQ_REVIEW = 'external_dq_review';
const SIGNED_REVIEW_REASON = 'LawRuler reports a signature or delivery. Verify the signed original and certificate before counting or delivering this matter in ClaimReach.';
const DQ_REVIEW_REASON = 'LawRuler reports a closed/disqualified matter. Review and select its standardized DQ reason before final DQ.';
const labelKey = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\s*\(default\)$/, '').trim();
export type MvaStatusOutcome = 'applied' | 'unchanged' | 'review_required' | 'out_of_scope';
export interface MvaAcquisitionSignal {
  firm_id: string; lead_id: string; claim_id: string; campaign_id: string;
  source_status: string; mapped_status: string | null; acquisition_hold: boolean;
  outcome: MvaStatusOutcome; reason: string; observed_at: string;
}
export interface MvaStatusResult {
  outcome: MvaStatusOutcome; applied: boolean; acquisition_hold: boolean;
  mapped_status: string | null; reason: string; communications_triggered: false;
}

/** Exact-matter stop signals survive later unsequenced status messages and answer saves.
 * Only an explicitly reviewed release event can remove a hold. Receipt order is not source order. */
export async function loadMvaAcquisitionHolds(db: any, leadIds: string[], opts: { firmId?: string } = {}): Promise<Map<string, MvaAcquisitionSignal>> {
  const result = new Map<string, MvaAcquisitionSignal>();
  if (!leadIds.length) return result;
  let query = db.from('lead_activity').select('firm_id, lead_id, meta, created_at')
    .in('lead_id', [...new Set(leadIds)]).eq('meta->>event', EVENT).order('created_at', { ascending: false }).limit(2000);
  if (opts.firmId) query = query.eq('firm_id', opts.firmId);
  const { data, error } = await query;
  if (error || (data || []).length >= 2000) throw new Error(error ? `Could not read LawRuler contact holds: ${error.message}` : 'LawRuler hold history is too large to safely build this queue. Review the affected files.');
  const released = new Set<string>();
  for (const row of data || []) {
    const meta = row.meta || {}, id = meta.claim_id;
    if (!id || !row.firm_id || !row.lead_id || !meta.campaign_id || meta.source !== 'lawruler') continue;
    if (!result.has(id)) result.set(id, {
      firm_id: row.firm_id, lead_id: row.lead_id, claim_id: id, campaign_id: meta.campaign_id,
      source_status: meta.source_status || '', mapped_status: meta.mapped_status || null,
      acquisition_hold: meta.acquisition_hold === true, outcome: meta.outcome || 'review_required',
      reason: meta.reason || 'Review the external case status before contacting this caller.', observed_at: row.created_at,
    });
    const signal = result.get(id)!;
    if (signal.firm_id !== row.firm_id || signal.lead_id !== row.lead_id) continue;
    if (meta.hold_release_reviewed === true && meta.acquisition_hold === false) released.add(id);
    if (!released.has(id) && meta.acquisition_hold === true) signal.acquisition_hold = true;
  }
  return result;
}

export function stopsAcquisition(status: string | null | undefined, catalog: StatusDef[]): boolean {
  const def = catalog.find(s => s.key === status);
  return isSignedKey(status, catalog) || !!def && (def.qualify === 'disqualify' || def.phase === 'terminal' || def.is_final || def.unlocks_firm);
}

/** Acquisition work only: never use this to hide signed files from history or service work.
 * Missing/ambiguous identity or catalog fails closed. A sibling's hold does not stop this claim. */
export function isAcquisitionEligible(lead: any, claim: any, opts: { statuses: StatusDef[]; holds: Map<string, MvaAcquisitionSignal> }): boolean {
  if (!lead?.id || lead.archived_at || !claim?.id || claim.lead_id !== lead.id || claim.firm_id !== lead.firm_id) return false;
  const def = opts.statuses.find(s => s.key === claim.status);
  if (!def || def.active === false || stopsAcquisition(claim.status, opts.statuses)) return false;
  const hold = opts.holds.get(claim.id);
  if (hold?.acquisition_hold && hold.lead_id === lead.id && hold.firm_id === lead.firm_id && hold.campaign_id === claim.campaign_id) return false;
  return def.phase === 'pre_qa';
}

/** A legacy call with no claim ID belongs only to a sole compatible matter. */
export function acquisitionClaimForRow(lead: any, row: { claim_id?: string | null; campaign_id?: string | null }): any | null {
  const claims = (lead?.claims || []).filter((c: any) => c.lead_id === lead.id && c.firm_id === lead.firm_id);
  const claim = row.claim_id ? claims.find((c: any) => c.id === row.claim_id) : claims.length === 1 ? claims[0] : null;
  return claim && (!row.campaign_id || row.campaign_id === claim.campaign_id) ? claim : null;
}

/** Dispatch-time check for legacy lead-scoped acquisition jobs. Never guess between
 * several matters. Other case types keep their existing retention/service rules. */
export async function mayDispatchMvaAcquisition(db: any, opts: { firmId: string; leadId: string; claimId?: string | null }): Promise<{ allowed: boolean; reason: string; outOfScope?: boolean; claimId?: string }> {
  try {
    const [leadRes, claimRes] = await Promise.all([
      db.from('leads').select('id, firm_id, archived_at, case_type').eq('id', opts.leadId).eq('firm_id', opts.firmId).maybeSingle(),
      db.from('claims').select('id, lead_id, firm_id, campaign_id, claim_type, status').eq('lead_id', opts.leadId).eq('firm_id', opts.firmId),
    ]);
    if (leadRes.error || claimRes.error) return { allowed: false, reason: 'Could not verify the current matter before dispatch.' };
    const lead = leadRes.data, claims = claimRes.data || [];
    if (!lead || lead.archived_at) return { allowed: false, reason: 'The file is missing or archived.' };
    if (opts.claimId && !claims.some((c: any) => c.id === opts.claimId)) return { allowed: false, reason: 'The named matter does not belong to this file and firm.' };
    if (!claims.some((c: any) => c.claim_type === 'mva') && lead.case_type !== 'mva') return { allowed: true, outOfScope: true, reason: 'The existing non-MVA workflow applies.' };
    const claim = acquisitionClaimForRow({ ...lead, claims }, { claim_id: opts.claimId });
    if (!claim) return { allowed: false, reason: 'This lead-scoped job cannot identify one exact matter. Review its assignment.' };
    if (claim.claim_type !== 'mva') return { allowed: true, outOfScope: true, claimId: claim.id, reason: 'The existing non-MVA workflow applies.' };
    const [catalog, holds] = await Promise.all([db.from('statuses').select('*'), loadMvaAcquisitionHolds(db, [lead.id], { firmId: opts.firmId })]);
    if (catalog.error) return { allowed: false, reason: 'Could not verify the current status before dispatch.' };
    const allowed = isAcquisitionEligible(lead, claim, { statuses: catalog.data || [], holds });
    return { allowed, claimId: claim.id, reason: allowed ? 'This matter is eligible for acquisition follow-up.' : holds.get(claim.id)?.reason || 'This matter is no longer eligible for acquisition follow-up.' };
  } catch (error) {
    return { allowed: false, reason: error instanceof Error ? error.message : 'Could not verify acquisition eligibility.' };
  }
}

/** Ordinary live INNO MVA status reconciliation. The source reports state; it does not
 * create signing evidence, a signing timestamp, notifications, delivery, or automation. */
export async function reconcileLawRulerMvaStatus(db: any, opts: {
  firmId: string; leadId: string; claimId: string; campaignId: string;
  sourceStatus: string | null; historical?: boolean; dqReasonKey?: string | null;
}): Promise<MvaStatusResult> {
  const base = { applied: false, acquisition_hold: false, mapped_status: null, communications_triggered: false as const };
  if (opts.historical) return { ...base, outcome: 'review_required', reason: 'Historical recovery remains pending an explicit reviewed correction.' };
  const [campaign, lead, claim, aliases, statuses] = await Promise.all([
    db.from('campaigns').select('id, firm_id, name, case_type, active').eq('id', opts.campaignId).maybeSingle(),
    db.from('leads').select('id, firm_id, archived_at').eq('id', opts.leadId).eq('firm_id', opts.firmId).maybeSingle(),
    db.from('claims').select('id, lead_id, firm_id, campaign_id, claim_type, status').eq('id', opts.claimId).eq('lead_id', opts.leadId).eq('firm_id', opts.firmId).maybeSingle(),
    db.from('lawruler_aliases').select('alias, status_key'),
    db.from('statuses').select('*'),
  ]);
  for (const read of [campaign, lead, claim, aliases, statuses]) if (read.error) throw new Error(`Could not reconcile LawRuler status: ${read.error.message}`);
  if (!campaign.data || campaign.data.active !== true || campaign.data.firm_id !== opts.firmId || labelKey(campaign.data.name) !== 'inno mva' || campaign.data.case_type !== 'mva') {
    return { ...base, outcome: 'out_of_scope', reason: 'Automatic LawRuler status reconciliation is enabled only for the active INNO MVA campaign.' };
  }
  if (!lead.data || !claim.data || claim.data.campaign_id !== opts.campaignId || claim.data.claim_type !== 'mva') throw new Error('The LawRuler status does not identify this exact firm, file, and MVA matter.');
  if (lead.data.archived_at) return { ...base, outcome: 'review_required', reason: 'This file is archived. Review it without reopening it automatically.' };
  const catalog = statuses.data as StatusDef[], sourceStatus = String(opts.sourceStatus || '').trim().slice(0, 500);
  const matches = (aliases.data || []).filter((row: any) => labelKey(row.alias) === labelKey(sourceStatus));
  const targets = [...new Set<string>(matches.map((row: any) => row.status_key))];
  const mapped = targets.length === 1 ? catalog.find(s => s.key === targets[0] && s.active !== false && ['intake', 'esign', 'firm', 'terminal'].includes(s.track)) : undefined;
  const priorSignal = (await loadMvaAcquisitionHolds(db, [opts.leadId], { firmId: opts.firmId })).get(opts.claimId);
  const priorHold = !!priorSignal?.acquisition_hold && priorSignal.campaign_id === opts.campaignId;
  const hold = priorHold || !!mapped && stopsAcquisition(mapped.key, catalog);
  // A vendor status is a report, not a verified signature, signed packet, or
  // ClaimReach firm-delivery receipt. Keep it out of the Signed totals and firm
  // portal until an owner reviews the original and evidence on this matter.
  const externalSigned = !!mapped && isSignedKey(mapped.key, catalog);
  const reviewedDq = claim.data.status === EXTERNAL_DQ_REVIEW && !!opts.dqReasonKey && !!mapped && mapped.qualify === 'disqualify';
  let result: MvaStatusResult = { ...base, outcome: 'review_required', acquisition_hold: hold, mapped_status: mapped?.key || null, reason: '' };
  if (!mapped) result.reason = 'The LawRuler label has no unambiguous active MVA-compatible mapping. An owner/admin must review it.';
  else if (claim.data.status === mapped.key) result = { ...result, outcome: 'unchanged', reason: 'The exact matter already has this status.' };
  else if (claim.data.status === EXTERNAL_SIGNED_REVIEW && externalSigned) result.reason = SIGNED_REVIEW_REASON;
  else if (claim.data.status === EXTERNAL_DQ_REVIEW && mapped.qualify === 'disqualify' && !opts.dqReasonKey) result.reason = DQ_REVIEW_REASON;
  else if ((stopsAcquisition(claim.data.status, catalog) && !reviewedDq) || (priorHold && mapped.key !== priorSignal?.mapped_status)) result.reason = 'A signed, closed, or externally held matter cannot be changed by an unsequenced external message. Review this transition.';
  else if (!catalog.some(s => s.key === claim.data.status)) result.reason = 'The existing status is unknown. Review it before replacing it.';
  else if ((claim.data.status === 'esign_sent' && ['new', 'contacting'].includes(mapped.key)) || (claim.data.status === 'contacting' && mapped.key === 'new')) result.reason = 'An unsequenced external message cannot move this matter backward or reopen it. Review the source order.';
  else {
    let reasonKey: string | null = null;
    let targetStatus = mapped.key;
    let pendingReason: string | null = null;
    if (externalSigned) {
      targetStatus = EXTERNAL_SIGNED_REVIEW;
      pendingReason = SIGNED_REVIEW_REASON;
    }
    if (mapped.qualify === 'disqualify') {
      const reason = opts.dqReasonKey ? await db.from('dq_reasons').select('key, active').eq('key', opts.dqReasonKey).maybeSingle() : null;
      if (reason?.error) throw new Error(`Could not validate the disqualification reason: ${reason.error.message}`);
      if (reason?.data?.active !== false && reason?.data?.key) reasonKey = reason.data.key;
      else {
        targetStatus = EXTERNAL_DQ_REVIEW;
        pendingReason = DQ_REVIEW_REASON;
      }
    }
    if (!result.reason) {
      const changed = await setClaimStatusForLeads({
        leadIds: [opts.leadId], claimIds: [opts.claimId], expectedStatus: claim.data.status ?? null,
        status: targetStatus, dqReasonKey: reasonKey, historical: true, statuses: catalog,
        actorName: 'LawRuler status reconciliation',
      }, { db, audit: async () => {}, automation: async () => { throw new Error('External reconciliation must not start automation.'); }, webhook: async () => { throw new Error('External reconciliation must not publish events.'); }, deliver: async () => { throw new Error('External reconciliation must not deliver a file.'); } });
      result = { ...result, applied: !!changed.claimIds?.length, outcome: changed.ok && !pendingReason ? 'applied' : 'review_required', reason: changed.ok ? pendingReason || 'LawRuler status applied to this matter without communications or new signing.' : changed.error || 'This matter changed during reconciliation. Review the current state.' };
    }
  }
  // A repeated message with the same decision does not add duplicate reconciliation history.
  if (!priorSignal || priorSignal.source_status !== sourceStatus || priorSignal.mapped_status !== result.mapped_status || priorSignal.acquisition_hold !== result.acquisition_hold || priorSignal.reason !== result.reason || priorSignal.outcome !== result.outcome) {
    const saved = await db.from('lead_activity').insert({
      firm_id: opts.firmId, lead_id: opts.leadId, kind: 'system',
      body: `LawRuler status: ${sourceStatus || 'not supplied'}. ${result.reason}`,
      meta: { source: 'lawruler', event: EVENT, claim_id: opts.claimId, campaign_id: opts.campaignId, source_status: sourceStatus, status: sourceStatus, previous_status: claim.data.status,
        source_signed_reported: externalSigned, source_signed_at: null, signature_validation: 'not_performed', ...result },
    });
    if (saved.error) throw new Error(`${result.applied ? 'Status changed, but' : 'No status correction completed:'} LawRuler reconciliation history/hold could not be saved: ${saved.error.message}. Review this matter before retrying.`);
  }
  return result;
}
