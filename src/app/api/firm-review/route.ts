import { NextRequest, NextResponse } from 'next/server';
import { REVIEW_CLAIM_COLS, REVIEW_EVENT, REVIEW_LEAD_COLS, reviewEvents, reviewerContext, reviewerFile, reviewerPdf, reviewerSignedClaimIds } from '@/lib/firm-review-server';
import { releasedToReviewer, reviewActivity, reviewInput, reviewState, uuid } from '@/lib/firm-review-access';
import { rowBelongsToMatter } from '@/lib/matter';
import { paxParentId } from '@/lib/linked-files';
export const runtime = 'edge';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export async function GET(req: NextRequest) {
  try {
    const c = await reviewerContext();
    if (!c) return json({ error: 'Please sign in with your approved firm email.' }, 403);
    const claimId = req.nextUrl.searchParams.get('claim');
    const document = req.nextUrl.searchParams.get('document');
    if (claimId || document) {
      if (!uuid(claimId) || !['intake', 'retainer'].includes(document || '')) return json({ error: 'File unavailable.' }, 404);
      const file = await reviewerFile(c.db, c.scope, claimId);
      if (!file) return json({ error: 'File unavailable.' }, 404);
      const bytes = await reviewerPdf(c.db, c.scope, file, document as 'intake' | 'retainer');
      const filename = `${file.lead.lead_no}_${document}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"` } });
    }
    const { data: claims, error } = await c.db.from('claims').select(REVIEW_CLAIM_COLS)
      .eq('firm_id', c.scope.firmId).eq('campaign_id', c.scope.campaignId).in('status', ['delivered', 'retained'])
      .order('updated_at', { ascending: false }).limit(1000);
    if (error || claims?.length === 1000) throw new Error('Could not load the complete file list. Please contact ClaimReach.');
    if (!claims?.length) return json({ campaign: c.campaign, name: c.scope.name, files: [] });
    const result = await c.db.from('leads').select(REVIEW_LEAD_COLS).eq('firm_id', c.scope.firmId)
      .is('archived_at', null).in('id', claims.map(row => row.lead_id));
    if (result.error) throw new Error('Could not load the file list. Please try again.');
    const leads = new Map((result.data || []).map(row => [row.id, row]));
    const signed = await reviewerSignedClaimIds(c.db, c.scope);
    const released = claims.filter(claim => signed.has(claim.id) && releasedToReviewer(c.scope, claim, leads.get(claim.lead_id)));
    if (!released.length) return json({ campaign: c.campaign, name: c.scope.name, files: [] });
    const [events, agreements, counts] = await Promise.all([
      reviewEvents(c.db, c.scope, released.map(claim => claim.id)),
      c.db.from('esign_submissions').select('id,lead_id,firm_id,claim_id,campaign_id,pax_index,status,created_at')
        .eq('firm_id', c.scope.firmId).in('lead_id', released.map(claim => claim.lead_id)).order('created_at', { ascending: false }).limit(5000),
      c.db.from('claims').select('id,lead_id').in('lead_id', released.map(claim => claim.lead_id)).limit(5000),
    ]);
    if (agreements.error || counts.error || agreements.data?.length === 5000 || counts.data?.length === 5000) throw new Error('Could not verify the agreement list. Please try again.');
    return json({ campaign: c.campaign, name: c.scope.name, files: released.map(claim => {
      const lead = leads.get(claim.lead_id)!;
      const matter = { claim, sole: (counts.data || []).filter(row => row.lead_id === lead.id).length === 1 };
      const current = (agreements.data || []).find(row => row.lead_id === lead.id && rowBelongsToMatter(row, matter) && (row.pax_index == null || paxParentId(lead.external_id)));
      return { id: claim.id, number: lead.lead_no, name: lead.claimant_name,
        packetNote: current?.status === 'signed' ? 'Client-signed copy · office completion not yet recorded' : '',
        ...reviewState(events.filter((event: any) => event.meta.claim_id === claim.id && event.lead_id === lead.id)) };
    }) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not open the file. Please try again.' }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Please refresh before saving.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid request.' }, 400);
  try {
    const c = await reviewerContext();
    if (!c) return json({ error: 'Please sign in with your approved firm email.' }, 403);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: 'Please keep the explanation under 5,000 characters.' }, 400);
    const body = JSON.parse(raw);
    const input = reviewInput(body);
    if (!uuid(body.claim) || !input) return json({ error: 'Choose an action. A turn down requires an explanation.' }, 400);
    const file = await reviewerFile(c.db, c.scope, body.claim);
    if (!file) return json({ error: 'File unavailable.' }, 404);
    // Append-only audit: receipt and decision are separate from intake/signing
    // status. Never change delivery evidence, signatures, or the seven-day clock.
    const result = await c.db.from('lead_activity').insert(reviewActivity(c.scope, file.claim, input,
      { id: c.user.id, name: c.scope.name, email: c.user.email })).select('id,created_at,meta').single();
    if (result.error || !result.data) throw new Error('Your review has not saved. Please try again.');
    const events = await reviewEvents(c.db, c.scope, [file.claim.id]);
    return json({ ok: true, ...reviewState(events.filter((event: any) => event.lead_id === file.lead.id)) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Your review has not saved. Please try again.' }, 503); }
}
