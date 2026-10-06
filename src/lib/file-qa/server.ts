import { resolveSigningMatter, getMatterAgreement, type SigningContext } from '../mva-call/signing-matter';
import { packetShort } from '../mva-call/esign';
import { resolveFormKey } from '../forms';
import { NETFLY_CAMPAIGN } from '../netfly-ontake';
import { netflyPacketReview } from '../netfly-packet';
import { readFirmDispatch } from '../firm-delivery-dispatch';
import { ownerConfirmedDelivery } from '../owner-file-confirmation';
import { confirmedFirmDeliveryAt } from '../firm-delivery-state';
import { matterRowsFilter, resolveMatter } from '../matter';
import { netflyMatter, type netflyContext } from '../netfly-server';
import { contentHash } from '../resend-inbound';
import { QA_RULE_VERSION, type QaInput } from './report';

/** Session proves record access before privileged storage/audit operations. */
export async function loadQaSnapshot(db: any, admin: any, leadId: string, claimId: string) {
  const context = await resolveSigningMatter(db, leadId, { claimId, authoritativeDb: admin });
  if (!context.ok) throw new Error(context.error);
  return snapshotForContext(db, admin, context);
}

/** NETFLY staff already use this narrow campaign-authorized projection. Never
 * fall back to admin on an arbitrary lead/session failure. */
export async function loadNetflyQaSnapshot(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, key: string) {
  const file = await netflyMatter(ctx, key);
  if (!file) throw new Error('NETFLY file not found.');
  const matter = await resolveMatter(ctx.db, file.lead.id, { claimId: file.claim.id, campaignId: ctx.campaign.id, authoritativeDb: ctx.db });
  if (!matter.ok) throw new Error(matter.error);
  if (matter.claim.id !== file.claim.id || matter.claim.firm_id !== ctx.campaign.firm_id || matter.claim.campaign_id !== ctx.campaign.id) throw new Error('NETFLY matter access is unavailable.');
  return snapshotForContext(ctx.db, ctx.db, { ok: true, lead: file.lead, matter, campaignId: ctx.campaign.id });
}

async function snapshotForContext(db: any, admin: any, context: SigningContext) {
  const { lead, matter, campaignId } = context, claim = matter.claim;
  const leadId = lead.id, claimId = claim.id;
  const config = await db.from('campaigns').select('id,firm_id,name,path,esign_required,firm_email,firm_cc')
    .eq('id', campaignId).eq('firm_id', lead.firm_id).maybeSingle();
  if (config.error || !config.data) throw new Error('Could not verify this campaign.');
  const campaign = config.data;
  const form = await resolveFormKey(db, leadId, claimId);
  const flow = campaign.name === NETFLY_CAMPAIGN ? 'netfly' : campaign.name === 'INNO MVA' ? 'inno' : null;
  if (!flow || claim.claim_type !== 'mva' || !['mva', 'netfly_secondary'].includes(form || '')) throw new Error('This file check is for INNO MVA and NETFLY. Use the existing review for other work.');
  const delivery = await db.from('claims').select('firm_sent_at,firm_send_result,updated_at').eq('id', claimId).eq('lead_id', leadId).eq('firm_id', lead.firm_id).single();
  if (delivery.error) throw new Error('Could not verify delivery history.');
  const dispatch = await readFirmDispatch(admin, leadId, claimId);
  if (dispatch.error) throw new Error('Could not verify the last delivery attempt.');
  const history = await admin.from('firm_deliveries').select('ok,to_email,cc_email,created_at,triggered_by')
    .eq('lead_id', leadId).or(matterRowsFilter(matter));
  if (history.error) throw new Error('Could not verify the delivery receipts.');
  const sent = dispatch.row?.state === 'sent' || !!confirmedFirmDeliveryAt(history.data || [], campaign.firm_email, 'bmc@innovativeintake.com') || ownerConfirmedDelivery(delivery.data.firm_send_result);
  const packetErrors: string[] = [];
  let packetStamp: unknown;
  if (flow === 'netfly') {
    const packet = await netflyPacketReview(admin, lead, claim, campaign);
    packetStamp = packet.snapshot;
    if (!sent) packetErrors.push(...packet.errors);
  } else {
    const agreement = await getMatterAgreement(db, lead, matter);
    if (!agreement.ok) throw new Error(agreement.error);
    const row = agreement.row;
    packetStamp = row;
    if (!sent) {
      if (!row || row.status !== 'completed' || row.voided_at || row.replacement_requested_at) packetErrors.push('Finish and verify this client’s current agreement and office signature.');
      else {
        if (!row.agent_reviewed_at) packetErrors.push('Open the signed packet and record your review.');
        if (await packetShort(admin, row)) packetErrors.push('The complete signed packet or certificate is unavailable. Open agreement recovery before sending.');
      }
      const call = await db.from('intake_calls').select('id').eq('lead_id', leadId).eq('claim_id', claimId).eq('disposition', 'signed').not('ended_at', 'is', null).limit(1).maybeSingle();
      if (call.error) throw new Error('Could not check the saved call outcome.');
      if (!call.data) packetErrors.push('Save the signed call outcome before final delivery.');
    }
  }
  if (['sending', 'uncertain'].includes(dispatch.row?.state || '')) packetErrors.push('A delivery is pending or uncertain. Ask the owner to reconcile its receipt; do not resend.');
  const input: QaInput = { flow, answers: claim.answers?.[flow === 'netfly' ? 'netfly_secondary' : 'mva_call'] || {},
    contact: { phone: lead.phone || '', email: lead.email || '', address: [lead.mail_addr1, lead.mail_city, lead.mail_state, lead.mail_zip].filter(Boolean).join(', ') }, packetErrors, sent };
  const fingerprint = await contentHash(new TextEncoder().encode(JSON.stringify({ rule: QA_RULE_VERSION, claimId, firm: lead.firm_id, input, packetStamp, delivery: delivery.data, dispatch: dispatch.row, campaign, receipts: history.data })));
  return { lead, claim, input, fingerprint };
}
