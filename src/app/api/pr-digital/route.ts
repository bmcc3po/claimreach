import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { loadPartnerReport, loadReportAccess } from '@/lib/partner-report-server';
import { PARTNER_REPORT_COOKIE, REPORT_RESPONSE_HEADERS, REPORT_SESSION_SECONDS,
  reportHmac, reportPasswordMatches, createReportSession, verifyReportSession } from '@/lib/partner-report-access';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: REPORT_RESPONSE_HEADERS });
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api/pr-digital' };
const sameOrigin = (req: NextRequest) => req.headers.get('origin') === new URL(req.url).origin &&
  req.headers.get('sec-fetch-site') !== 'cross-site';

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin(), access = await loadReportAccess(db);
    if (!access || !await verifyReportSession(req.cookies.get(PARTNER_REPORT_COOKIE)?.value, access)) {
      return reply({ error: 'Enter the report password.' }, 401);
    }
    return reply(await loadPartnerReport(db, access));
  } catch { return reply({ error: 'The live report is temporarily unavailable. Please try again.' }, 503); }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'Please open the report and try again.' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: 'Invalid request.' }, 400);
    const body = JSON.parse(raw);
    if (typeof body.password !== 'string' || !body.password || body.password.length > 256) return reply({ error: 'Enter the report password.' }, 400);
    const db = supabaseAdmin(), access = await loadReportAccess(db);
    if (!access) return reply({ error: 'This report is not available yet.' }, 503);
    // Cloudflare overwrites CF-Connecting-IP. Do not trust X-Forwarded-For.
    const clientHash = await reportHmac(req.headers.get('cf-connecting-ip') || 'unknown', access.token_secret);
    const attempt = await db.rpc('consume_partner_report_attempt', { p_report_key: access.report_key, p_client_hash: clientHash });
    if (attempt.error) return reply({ error: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
    if (attempt.data !== true) return reply({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, 429);
    if (!await reportPasswordMatches(body.password, access)) return reply({ error: 'That password did not match. Please try again.' }, 401);
    const response = reply({ ok: true });
    response.cookies.set(PARTNER_REPORT_COOKIE, await createReportSession(access), { ...cookieOptions, maxAge: REPORT_SESSION_SECONDS });
    return response;
  } catch { return reply({ error: 'Could not open the report. Please try again.' }, 503); }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: 'Please open the report and try again.' }, 403);
  const response = reply({ ok: true });
  response.cookies.set(PARTNER_REPORT_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
