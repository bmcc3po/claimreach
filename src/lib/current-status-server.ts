import { supabaseServer, supabaseAdmin } from './supabase-server';
import { requireStaff } from './mva-call/server';
import { netflyContext, netflyMatter } from './netfly-server';
import { intakeFirmScope } from './intake-firm-scope';
import { ownerConfirmedDelivery } from './owner-file-confirmation';
import { currentStatusMapping, type StatusEdit } from './current-status';
export class CurrentStatusError extends Error { constructor(message:string,public status=409){super(message);} }
export const CURRENT_STATUS_COLS = 'id,lead_id,firm_id,campaign_id,campaign,claim_type,status,answers,updated_at,firm_sent_at,firm_send_result,status_reason_category,status_descriptor,status_note,status_callback_at,status_changed_at';
/** Authorize before any privileged claim read. NETFLY retains its own exact scope. */
export async function currentStatusContext(leadId:string,claimId:string) {
  if (![leadId,claimId].every(id=>/^[0-9a-f-]{36}$/i.test(id))) throw new CurrentStatusError('Choose an exact file and claim.',400);
  const session = await supabaseServer(), actor = await requireStaff(session);
  if (!actor) throw new CurrentStatusError('Sign in with a staff account.',401);
  if (!actor.can('leads.view')) throw new CurrentStatusError('File access is unavailable.',403);
  const visible = await session.from('claims').select('id,lead_id,firm_id,campaign_id').eq('id',claimId).eq('lead_id',leadId).maybeSingle();
  if (visible.error) throw new CurrentStatusError('Could not verify claim access.',503);
  let authorized = false;
  let targetScope=visible.data;
  if (visible.data) {
    const access = await intakeFirmScope(session,actor,visible.data.firm_id,supabaseAdmin);
    if (!access.ok) throw new CurrentStatusError(access.error,access.status);
    authorized = true;
  } else {
    const ctx = await netflyContext();
    const matter = ctx?.actor.id === actor.id && ctx.actor.can('leads.view') ? await netflyMatter(ctx,leadId) : null;
    authorized = !!matter && matter.claim.id === claimId;
    if(authorized)targetScope=matter!.claim;
  }
  if (!authorized) throw new CurrentStatusError('This claim is not available.',404);
  const db = supabaseAdmin();
  const result = await db.from('claims').select(CURRENT_STATUS_COLS).eq('id',claimId).eq('lead_id',leadId).maybeSingle();
  if (result.error) throw new CurrentStatusError('Current status is unavailable. Check that the reviewed status migration is installed.',503);
  if (!result.data) throw new CurrentStatusError('Claim not found.',404);
  const claim = result.data;
  if (!targetScope || claim.firm_id !== targetScope.firm_id || claim.campaign_id !== targetScope.campaign_id) throw new CurrentStatusError('Claim assignment changed. Refresh.');
  const lead = await db.from('leads').select('id,firm_id,archived_at').eq('id',leadId).eq('firm_id',claim.firm_id).maybeSingle();
  if (lead.error || !lead.data || lead.data.archived_at) throw new CurrentStatusError('This file is unavailable or archived.',404);
  return {db,actor,claim,lead:lead.data};
}
export function currentStatusResponse(claim:any,canEdit:boolean) {
  return {...currentStatusMapping(claim.status),claim_id:claim.id,lead_id:claim.lead_id,updated_at:claim.updated_at,
    category:claim.status_reason_category,descriptor:claim.status_descriptor,note:claim.status_note,
    callback_at:claim.status_callback_at,changed_at:claim.status_changed_at,can_edit:canEdit};
}
export async function currentStatusEvidence(ctx:Awaited<ReturnType<typeof currentStatusContext>>,edit:StatusEdit) {
  const {db,claim,actor} = ctx;
  if (!actor.can('claims.status')) throw new CurrentStatusError('Status editing is unavailable to this account.',403);
  if (edit.status==='bmc_rejected' && !['owner','admin'].includes(actor.role)) throw new CurrentStatusError('BMC rejection requires an owner or administrator.',403);
  if (edit.status==='new' && claim.status!=='new') throw new CurrentStatusError('New lead is the initial status, not a reset of existing history.');
  if (edit.status==='delivered' || edit.status==='retained' || edit.status==='firm_rejected') {
    if (!(claim.firm_sent_at && claim.firm_send_result==='sent') && !ownerConfirmedDelivery(claim.firm_send_result))
      throw new CurrentStatusError('Record or verify the firm handoff before recording this firm outcome.');
  }
  if (edit.status==='esign_sent' || edit.status==='signed_grievous') {
    const r = await db.from('esign_submissions').select('id,status,signed_at,voided_at,replacement_requested_at,created_at')
      .eq('firm_id',claim.firm_id).eq('lead_id',claim.lead_id).eq('claim_id',claim.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (r.error) throw new CurrentStatusError('Could not check agreement evidence.',503);
    const a=r.data;
    if (!a || a.voided_at || a.replacement_requested_at || !['sent','opened','signed','completed'].includes(a.status)) throw new CurrentStatusError('Use the agreement workflow to send or verify this claim’s agreement first.');
    if (edit.status==='signed_grievous' && (!a.signed_at || !['signed','completed'].includes(a.status))) throw new CurrentStatusError('A verified client signature is required.');
  }
}
