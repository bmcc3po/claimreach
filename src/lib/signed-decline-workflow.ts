import { loadSignatureReport } from './signature-report-loader';
import { setClaimStatusForLeads } from './claim-status';
import { signedDecline, declineOutcome, type SignedDecline } from './signed-decline';
import { notifySignedDecline, readDropRequest } from './signed-decline-notification';
import { reviewActivity, REVIEW_EVENT } from './firm-review-access';

export class DeclineError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function loadDeclineContext(db: any, id: string, firmId?: string | null) {
  const r = await db.from('claims').select('id,lead_id,firm_id,campaign_id,campaign,claim_type,status,updated_at,answers').eq('id', id).maybeSingle();
  if (r.error) throw new Error('Could not read this file.');
  const claim = r.data;
  if (!claim?.firm_id || !claim.campaign_id || claim.claim_type !== 'mva' || firmId && firmId !== claim.firm_id) throw new DeclineError('File unavailable.', 404);
  const [l, camp] = await Promise.all([
    db.from('leads').select('id,firm_id,lead_no,claimant_name,archived_at,intake_agent_id,phone,email,mail_addr1,mail_city,mail_state,mail_zip').eq('id', claim.lead_id).eq('firm_id', claim.firm_id).maybeSingle(),
    db.from('campaigns').select('id,firm_id,name,firm_email').eq('id', claim.campaign_id).eq('firm_id', claim.firm_id).maybeSingle(),
  ]);
  if (l.error || camp.error) throw new Error('Could not verify the file and firm.');
  if (!l.data || l.data.archived_at || camp.data?.name !== 'INNO MVA') throw new DeclineError('Choose an active signed INNO MVA file.');
  const decline = signedDecline(claim);
  const report = (await loadSignatureReport(db, camp.data)).find(row => row.claimId === claim.id);
  if (!decline && report?.state !== 'signed') throw new DeclineError('Verify the client signature before declining a signed file.');
  return { db, claim, lead: l.data, campaign: camp.data, decline,
    to: String(camp.data.firm_email || '').trim().toLowerCase(),
    agentId: report?.agentId || null, agentName: report?.agentName || 'Agent not recorded' };
}
export function publicDropReceipt(receipt: any) {
  const m = receipt?.meta || receipt;
  return m ? { state: m.state, to: m.to, error: m.error, at: m.finished_at || m.started_at } : null;
}
export async function declineView(c: Awaited<ReturnType<typeof loadDeclineContext>>) {
  return { name: c.lead.claimant_name, number: c.lead.lead_no, to: c.to, agent: c.agentName,
    version: c.claim.updated_at, decline: c.decline,
    notification: publicDropReceipt(c.decline ? await readDropRequest(c.db, c.claim, c.decline.id) : null) };
}

/** Both BMC and firm outcomes use the same terminal claim transition and
 * durable email reservation. The signed snapshot is authoritative even if
 * projecting the decision into activity history fails partway through. */
export async function completeSignedDecline(c: Awaited<ReturnType<typeof loadDeclineContext>>, input: {
  source: 'bmc' | 'firm'; reason: string; retryEmail?: boolean;
  actor: { id: string; name: string; type?: 'staff' | 'firm' };
}, deps: { setStatus?: typeof setClaimStatusForLeads; notify?: typeof notifySignedDecline } = {}) {
  let d = c.decline;
  if (!d) {
    if (!input.reason.trim() || input.reason.length > 5000 || input.retryEmail) throw new DeclineError('Enter the reason this signed file does not qualify.', 400);
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c.to)) throw new DeclineError('Set a valid firm delivery email before requesting the drop letter.');
    const dispatch = await c.db.from('firm_delivery_dispatch').select('state').eq('claim_id', c.claim.id).eq('lead_id', c.claim.lead_id).maybeSingle();
    if (dispatch.error) throw new Error('Could not check for a firm delivery in progress. Nothing changed.');
    if (['sending', 'uncertain'].includes(dispatch.data?.state)) throw new DeclineError('A firm delivery is in progress or needs reconciliation. Check its result before declining this file.');
    d = { id: crypto.randomUUID(), at: new Date().toISOString(), reason: input.reason.trim(),
      actorId: input.actor.id, actorName: input.actor.name, actorType: input.actor.type || 'staff',
      source: input.source, agentId: c.agentId, agentName: c.agentName, previousStatus: c.claim.status,
      ...(input.source === 'firm' ? { reviewEventId: crypto.randomUUID() } : {}) };
  } else if (!input.retryEmail && (d.source || 'bmc') !== input.source) {
    throw new DeclineError(`This file is already ${declineOutcome(d).toLowerCase()}. Its saved outcome has not been replaced.`);
  }
  const changed = await (deps.setStatus || setClaimStatusForLeads)({ leadIds: [c.claim.lead_id], claimIds: [c.claim.id], status: 'signed_dropped',
    dqReasonKey: 'criteria', dqNote: d.reason, actorId: d.actorType === 'firm' ? null : d.actorId, actorName: d.actorName,
    expectedStatus: c.claim.status, expectedUpdatedAt: c.claim.updated_at, signedDecline: d, suppressAutoDelivery: true },
    { db: c.db, automation: async () => {}, webhook: async () => {} });
  if (!changed.ok) throw new DeclineError(changed.error || 'The decline could not be saved.');
  // Keep existing review consumers on the same append-only audit format.
  // A stored event ID makes repair after a partial failure idempotent.
  let event: any = null;
  if (d.source === 'firm' && d.reviewEventId) {
    const activity = { ...reviewActivity({ firmId: c.claim.firm_id, campaignId: c.claim.campaign_id, name: d.actorName }, c.claim,
      { action: 'turned_down', explanation: d.reason }, { id: d.actorId, name: d.actorName, owner: d.actorType !== 'firm' }),
      id: d.reviewEventId, created_at: d.at };
    const r = await c.db.from('lead_activity').insert(activity).select('id,lead_id,created_at,meta').single();
    if (r.error?.code === '23505') {
      const prior = await c.db.from('lead_activity').select('id,lead_id,created_at,meta').eq('id', d.reviewEventId)
        .eq('firm_id', c.claim.firm_id).eq('lead_id', c.claim.lead_id).eq('meta->>claim_id', c.claim.id).eq('meta->>event', REVIEW_EVENT).maybeSingle();
      if (prior.error || !prior.data) throw new Error('The decline is saved, but its decision history needs repair. Reload and try again.');
      event = prior.data;
    } else if (r.error || !r.data) throw new Error('The decline is saved, but its decision history has not saved. Reload and try again.');
    else event = r.data;
  }
  const notification = await (deps.notify || notifySignedDecline)({ ...c, decline: d }, input.retryEmail === true);
  return { decline: d, notification: publicDropReceipt(notification), event, status: 'signed_dropped' as const };
}
