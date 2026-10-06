import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase-server';
import { requireStaff } from '@/lib/mva-call/server';
import { resolveSigningMatter } from '@/lib/mva-call/signing-matter';
import { POST as checkFile } from '@/app/api/calls/file-qa/route';
export const runtime = 'edge';

// Legacy entry point delegates to the same matter-bound advisory review.
// A model verdict never grants signing, QA approval, or delivery permission.
export async function GET(req: NextRequest) {
  const db = await supabaseServer(), actor = await requireStaff(db);
  if (!actor || !(actor.can('intake.fill') || actor.can('intake.qa'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url), leadId = url.searchParams.get('lead_id'), claimId = url.searchParams.get('claim_id');
  if (!leadId || !claimId) return NextResponse.json({ error: 'Select the matter to review.' }, { status: 400 });
  const scope = await resolveSigningMatter(db, leadId, { claimId, authoritativeDb: supabaseAdmin() });
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const history = await db.from('audit_log').select('id,created_at,meta').eq('lead_id', leadId).eq('claim_id', claimId)
    .eq('firm_id', scope.lead.firm_id).eq('meta->>action', 'file_qa').order('created_at', { ascending: false }).limit(5);
  if (history.error) return NextResponse.json({ error: 'Could not read review history.' }, { status: 503 });
  return NextResponse.json({ approved: false, reviews: history.data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body?.op !== 'review') return NextResponse.json({ error: 'Choose a file review.' }, { status: 400 });
  const request = (op: string, fingerprint?: string) => new NextRequest(req.url, { method: 'POST', headers: req.headers,
    body: JSON.stringify({ op, lead_id: body.lead_id, claim_id: body.claim_id, fingerprint }) });
  const quick = await checkFile(request('check'));
  if (!quick.ok) return quick;
  let result = await quick.json();
  if (body.kind === 'full' && !result.report.sent) {
    const narrative = await checkFile(request('story', result.report.fingerprint));
    if (!narrative.ok) return narrative;
    result = await narrative.json();
  }
  return NextResponse.json({ approved: false, report: result.report, review: { verdict: 'advisory',
    summary: result.report.sent ? 'Delivery is already recorded. Do not resend.' : 'Check these findings, then finish the existing PDF and firm-delivery review.',
    issues: result.report.findings.map((f: any) => f.message) } });
}
