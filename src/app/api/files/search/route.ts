import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { requireStaff } from '@/lib/mva-call/server';
import { netflyContext } from '@/lib/netfly-server';
import { NETFLY_CAMPAIGN } from '@/lib/netfly-ontake';
import { fileSearchMatch, fileSearchRows, mergeFileSearchRows } from '@/lib/file-search';
export const runtime = 'edge';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const leadCols = 'id,firm_id,lead_no,claimant_name,phone,campaign_id,campaign,updated_at,archived_at';
const claimCols = 'id,lead_id,firm_id,campaign_id,campaign,claim_type,status';
export async function GET(req: NextRequest) {
  const db = await supabaseServer(), actor = await requireStaff(db);
  if (!actor) return json({ error: 'Sign in to search files.' }, 401);
  if (!actor.can('leads.view')) return json({ error: 'File search is not available to this account.' }, 403);
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0,80);
  if (q.length < 2) return json({ results: [] });
  try {
    // Ordinary sources use the caller's RLS. No campaign/work-area restriction.
    const found = await fileSearchMatch(db.from('leads').select(leadCols).is('archived_at', null).or(`campaign.is.null,campaign.neq.${NETFLY_CAMPAIGN}`).order('updated_at', { ascending: false }).limit(30), q);
    if (found.error) throw found.error;
    const leads = (found.data || []).filter((l: any) => l.campaign !== NETFLY_CAMPAIGN);
    const claims = leads.length ? await db.from('claims').select(claimCols).in('lead_id', leads.map((l: any) => l.id)) : { data: [], error: null };
    if (claims.error) throw claims.error;
    const rows = fileSearchRows(leads, claims.data || [], actor.role);
    // NETFLY's existing intake-organization gate is independent of ordinary RLS.
    const ctx = await netflyContext();
    if (ctx?.actor.can('leads.view')) {
      const found = await fileSearchMatch(ctx.db.from('leads').select(leadCols)
        .eq('firm_id', ctx.campaign.firm_id).eq('campaign_id', ctx.campaign.id).eq('case_type','mva')
        .is('archived_at',null).order('updated_at',{ascending:false}).limit(30), q);
      if (found.error) throw found.error;
      if (found.data?.length) {
        const claims = await ctx.db.from('claims').select(claimCols).eq('firm_id',ctx.campaign.firm_id)
          .eq('campaign_id',ctx.campaign.id).in('lead_id',found.data.map((l:any)=>l.id));
        if (claims.error) throw claims.error;
        rows.push(...fileSearchRows(found.data, claims.data || [], actor.role, true));
      }
    }
    return json({ results: mergeFileSearchRows(rows), limit: 30 });
  } catch { return json({ error: 'Could not check all authorized files. Retry before creating a new file.' }, 503); }
}
