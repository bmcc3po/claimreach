import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { loadPartnerReport, loadReportAccess } from '@/lib/partner-report-server';
import { REPORT_RESPONSE_HEADERS } from '@/lib/partner-report-access';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: REPORT_RESPONSE_HEADERS });

/** Owner preview uses the exact external report projection, never staff rows,
 * an impersonated identity, or caller-supplied firm/campaign/source scope. */
export async function GET() {
  try {
    const user = await gateUser(await supabaseServer());
    if (!user) return reply({ error:'Sign in with your owner account to preview this report.' },401);
    if (user.role !== 'owner') return reply({ error:'Only the owner can preview this report.' },403);
    const db = supabaseAdmin(), access = await loadReportAccess(db);
    if (!access) return reply({ error:'The PR Digital report is not active.' },503);
    return reply(await loadPartnerReport(db,access));
  } catch { return reply({ error:'The PR Digital preview is temporarily unavailable. Please try again.' },503); }
}
