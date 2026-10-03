import { NextRequest, NextResponse } from 'next/server';
import { netflyContext, netflyMatter } from '@/lib/netfly-server';
import { netflyPacketReview } from '@/lib/netfly-packet';
import { deliverLeadToFirm } from '@/lib/firm-delivery';
import { readFirmDispatch } from '@/lib/firm-delivery-dispatch';
import { buildIntakePdf, loadIntakeBundle } from '@/lib/intake-render';
export const runtime = 'edge';
const fail = (error: string, status = 409) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can('leads.view')) return fail('NETFLY access is unavailable.', 403);
  const url = new URL(req.url), matter = await netflyMatter(ctx, url.searchParams.get('file') || '');
  if (!matter) return fail('NETFLY file not found.', 404);
  try {
    if (url.searchParams.get('pdf') === 'intake') {
      const bundle = await loadIntakeBundle(ctx.db, matter.lead.id, matter.claim.id);
      if (!bundle) return fail('The intake could not be read.', 503);
      const bytes = await buildIntakePdf(bundle);
      return new Response(bytes as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${matter.lead.lead_no}_NETFLY_intake.pdf"`, 'Cache-Control': 'no-store' } });
    }
    const config = await ctx.db.from('campaigns').select('*').eq('id', ctx.campaign.id).eq('firm_id', ctx.campaign.firm_id).single();
    if (config.error || !config.data) return fail('Could not read NETFLY delivery settings.', 503);
    const packet = await netflyPacketReview(ctx.db, matter.lead, matter.claim, config.data);
    const dispatch = await readFirmDispatch(ctx.db, matter.lead.id, matter.claim.id);
    if (dispatch.error) return fail(dispatch.error, 503);
    const state = await ctx.db.from('claims').select('firm_sent_at, firm_send_result').eq('id', matter.claim.id).eq('firm_id', ctx.campaign.firm_id).single();
    if (state.error) return fail('Could not check delivery status.', 503);
    return NextResponse.json({ ...packet, documents: packet.documents.map((doc: any) => ({ id: doc.id, name: doc.file_name })),
      sent_at: state.data.firm_sent_at, dispatch: dispatch.row, can_send: ctx.actor.can('intake.fill') });
  } catch (error: any) { return fail(error.message || 'Could not prepare this packet.', 503); }
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can('intake.fill')) return fail('This account cannot send a NETFLY file.', 403);
  let body: any;
  try { body = await req.json(); } catch { return fail('Invalid request.', 400); }
  const matter = await netflyMatter(ctx, String(body.file || ''));
  if (!matter) return fail('NETFLY file not found.', 404);
  if (body.reviewed !== true || !/^[a-f0-9]{64}$/.test(String(body.snapshot || ''))) return fail('Open the intake and signed PDF, then confirm the final review.');
  try {
    const result = await deliverLeadToFirm({ leadId: matter.lead.id, claimId: matter.claim.id,
      triggeredBy: 'manual', actorName: ctx.actor.name, includeOwner: true, netflySnapshot: body.snapshot }, { db: ctx.db });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch { return fail('The delivery result could not be checked. Refresh delivery status before trying again.', 503); }
}
