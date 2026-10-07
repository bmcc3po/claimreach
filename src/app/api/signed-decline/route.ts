import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { uuid } from '@/lib/firm-review-access';
import { loadSignatureReport } from '@/lib/signature-report-loader';
import { signedDecline, type SignedDecline } from '@/lib/signed-decline';
import { notifySignedDecline, readDropRequest } from '@/lib/signed-decline-notification';
import { setClaimStatusForLeads } from '@/lib/claim-status';
import { invalidateAlertCache } from '@/lib/alerts';
export const runtime = 'edge';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function context(id: unknown) {
  const db = await supabaseServer(), me = await gateUser(db);
  if (!me || !['owner', 'admin'].includes(me.role) || !me.can('intake.qa')) return { error: 'Only the owner or an authorized admin can decline a signed file.', status: 403 } as const;
  if (!uuid(id)) return { error: 'Choose a file.', status: 400 } as const;
  const r = await db.from('claims').select('id,lead_id,firm_id,campaign_id,claim_type,status,updated_at,answers').eq('id', id).maybeSingle();
  if (r.error) throw new Error('Could not read this file.');
  const claim = r.data;
  if (!claim?.firm_id || !claim.campaign_id || claim.claim_type !== 'mva' || me.firmId && me.firmId !== claim.firm_id) return { error: 'File unavailable.', status: 404 } as const;
  const [l, camp] = await Promise.all([
    db.from('leads').select('id,firm_id,lead_no,claimant_name,archived_at,intake_agent_id,phone,email,mail_addr1,mail_city,mail_state,mail_zip').eq('id', claim.lead_id).eq('firm_id', claim.firm_id).maybeSingle(),
    db.from('campaigns').select('id,firm_id,name,firm_email').eq('id', claim.campaign_id).eq('firm_id', claim.firm_id).maybeSingle(),
  ]);
  if (l.error || camp.error) throw new Error('Could not verify the file and firm.');
  if (!l.data || l.data.archived_at || camp.data?.name !== 'INNO MVA') return { error: 'Choose an active signed INNO MVA file.', status: 409 } as const;
  const to = String(camp.data.firm_email || '').trim().toLowerCase();
  const decline = signedDecline(claim);
  const report = (await loadSignatureReport(db, camp.data)).find(row => row.claimId === claim.id);
  if (!decline && report?.state !== 'signed') return { error: 'Verify the client signature before declining a signed file.', status: 409 } as const;
  return { db, me, claim, lead: l.data, campaign: camp.data, to, decline,
    agentId: report?.agentId || null, agentName: report?.agentName || 'Agent not recorded' };
}
function publicReceipt(receipt: any) {
  const m = receipt?.meta || receipt;
  return m ? { state: m.state, to: m.to, error: m.error, at: m.finished_at || m.started_at } : null;
}
export async function GET(req: NextRequest) {
  try {
    const c = await context(req.nextUrl.searchParams.get('claim'));
    if ('error' in c) return json({ error: c.error }, c.status);
    const receipt = c.decline ? await readDropRequest(c.db, c.claim, c.decline.id) : null;
    return json({ name: c.lead.claimant_name, number: c.lead.lead_no, to: c.to, agent: c.agentName,
      version: c.claim.updated_at, decline: c.decline, notification: publicReceipt(receipt) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not open this action.' }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin || !req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Refresh before saving.' }, 403);
  try {
    const raw = await req.text(); if (raw.length > 10000) return json({ error: 'Keep the reason under 5,000 characters.' }, 400);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (b.confirm !== true || !['decline', 'retry_email'].includes(b.action)) return json({ error: 'Confirm the decline and drop-letter request.' }, 400);
    const c = await context(b.claim); if ('error' in c) return json({ error: c.error }, c.status);
    let d = c.decline;
    if (!d) {
      const dispatch = await c.db.from('firm_delivery_dispatch').select('state').eq('claim_id', c.claim.id).eq('lead_id', c.claim.lead_id).maybeSingle();
      if (dispatch.error) throw new Error('Could not check for a firm delivery in progress. Nothing changed.');
      if (['sending', 'uncertain'].includes(dispatch.data?.state)) return json({ error: 'A firm delivery is in progress or needs reconciliation. Check its result before declining this file.' }, 409);
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (b.action !== 'decline' || !reason || reason.length > 5000) return json({ error: 'Enter the reason this signed file does not qualify.' }, 400);
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c.to)) return json({ error: 'Set a valid firm delivery email before requesting the drop letter.' }, 409);
      if (b.version !== c.claim.updated_at || b.to !== c.to) return json({ error: 'The file or firm email changed. Review the action again.' }, 409);
      d = { id: crypto.randomUUID(), at: new Date().toISOString(), reason, actorId: c.me.id,
        actorName: c.me.name || 'Owner', agentId: c.agentId,
        agentName: c.agentName, previousStatus: c.claim.status } satisfies SignedDecline;
    }
    // One atomic claim write preserves all answers and delivery evidence.
    // A retry repairs queue flags before any email; it never creates a new sign.
    const changed = await setClaimStatusForLeads({ leadIds: [c.claim.lead_id], claimIds: [c.claim.id], status: 'signed_dropped',
      dqReasonKey: 'criteria', dqNote: d.reason, actorId: c.me.id, actorName: c.me.name,
      expectedStatus: c.claim.status, expectedUpdatedAt: c.claim.updated_at, signedDecline: d, suppressAutoDelivery: true },
      { db: c.db, automation: async () => {}, webhook: async () => {} });
    if (!changed.ok) return json({ error: changed.error }, 409);
    invalidateAlertCache(); revalidatePath('/', 'layout');
    const notification = await notifySignedDecline({ ...c, decline: d }, b.action === 'retry_email');
    return json({ ok: true, decline: d, notification: publicReceipt(notification) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'The decline could not be completed.' }, 503); }
}
