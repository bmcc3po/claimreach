import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { uuid } from '@/lib/firm-review-access';
import { completeSignedDecline, DeclineError, declineView, loadDeclineContext } from '@/lib/signed-decline-workflow';
import { invalidateAlertCache } from '@/lib/alerts';
export const runtime = 'edge';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function context(id: unknown) {
  const db = await supabaseServer(), me = await gateUser(db);
  if (!me || !['owner', 'admin'].includes(me.role) || !me.can('intake.qa')) throw new DeclineError('Only the owner or an authorized admin can decline a signed file.', 403);
  if (!uuid(id)) throw new DeclineError('Choose a file.', 400);
  return { ...await loadDeclineContext(db, id, me.firmId), me };
}
export async function GET(req: NextRequest) {
  try { return json(await declineView(await context(req.nextUrl.searchParams.get('claim')))); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Could not open this action.' }, e instanceof DeclineError ? e.status : 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin || !req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Refresh before saving.' }, 403);
  try {
    const raw = await req.text(); if (raw.length > 10000) return json({ error: 'Keep the reason under 5,000 characters.' }, 400);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (b.confirm !== true || !['decline', 'retry_email'].includes(b.action)) return json({ error: 'Confirm the decline and drop-letter request.' }, 400);
    const c = await context(b.claim);
    if (!c.decline && (b.version !== c.claim.updated_at || b.to !== c.to)) return json({ error: 'The file or firm email changed. Review the action again.' }, 409);
    const saved = await completeSignedDecline(c, { source: 'bmc', reason: typeof b.reason === 'string' ? b.reason : '',
      retryEmail: b.action === 'retry_email', actor: { id: c.me.id, name: c.me.name || 'Owner' } });
    invalidateAlertCache(); revalidatePath('/', 'layout');
    return json({ ok: true, ...saved });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'The decline could not be completed.' }, e instanceof DeclineError ? e.status : 503); }
}
