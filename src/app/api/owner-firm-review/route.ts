import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { reviewActivity, reviewInput, reviewState, uuid } from '@/lib/firm-review-access';
import { reviewerFile, reviewEvents } from '@/lib/firm-review-server';
export const runtime = 'edge';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context(claimId: unknown) {
  const db = await supabaseServer();
  const me = await gateUser(db);
  if (me?.role !== 'owner') return { error: 'Only the owner can record a firm decision here.', status: 403 } as const;
  if (!uuid(claimId)) return { error: 'Choose a file.', status: 400 } as const;
  // Use the authenticated connection: a supplied claim ID cannot widen access.
  const result = await db.from('claims').select('id,firm_id,campaign_id').eq('id', claimId).maybeSingle();
  if (result.error) throw new Error('Could not verify the file. Please try again.');
  if (!result.data?.firm_id || !result.data.campaign_id) return { error: 'File unavailable.', status: 404 } as const;
  const scope = { firmId: result.data.firm_id, campaignId: result.data.campaign_id, name: me.name || 'Owner' };
  const file = await reviewerFile(db, scope, claimId);
  if (!file) return { error: 'Firm decisions are available on active files sent to the firm.', status: 409 } as const;
  return { db, me, scope, file };
}
export async function GET(req: NextRequest) {
  try {
    const c = await context(req.nextUrl.searchParams.get('claim'));
    if ('error' in c) return json({ error: c.error }, c.status);
    const events = (await reviewEvents(c.db, c.scope, [c.file.claim.id])).filter((e: any) => e.lead_id === c.file.lead.id);
    return json({ ...reviewState(events), history: events });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not read firm decisions.' }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Please refresh before saving.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid request.' }, 400);
  try {
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: 'Keep the explanation under 5,000 characters.' }, 400);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
    const input = reviewInput(body);
    if (!input || input.action === 'received') return json({ error: 'Choose approved or rejected. Rejection requires an explanation.' }, 400);
    const c = await context(body.claim);
    if ('error' in c) return json({ error: c.error }, c.status);
    const saved = await c.db.from('lead_activity').insert(reviewActivity(c.scope, c.file.claim, input,
      { id: c.me.id, name: c.scope.name, owner: true })).select('id,lead_id,created_at,meta').single();
    if (saved.error || !saved.data) throw new Error('The firm decision has not saved. Please try again.');
    revalidatePath('/', 'layout');
    return json({ ok: true, event: saved.data });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'The firm decision has not saved.' }, 503); }
}
