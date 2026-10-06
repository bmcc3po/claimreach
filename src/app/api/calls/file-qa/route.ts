import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { requireStaff } from '@/lib/mva-call/server';
import { loadQaSnapshot, loadNetflyQaSnapshot } from '@/lib/file-qa/server';
import { deterministicQa, narrativeQa, qaSources, QA_NARRATIVE_SYSTEM, QA_RULE_VERSION, type QaReport } from '@/lib/file-qa/report';
import { askRelay } from '@/lib/ai-relay';
import { netflyContext } from '@/lib/netfly-server';
export const runtime = 'edge';
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Advisory only. No answer, signature, approval, delivery or stage writes. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return fail('Open this check from ClaimReach.', 403);
  const db = await supabaseServer(), actor = await requireStaff(db);
  if (!actor || !(actor.can('intake.fill') || actor.can('intake.qa'))) return fail('File review access is unavailable.', 403);
  const body = await req.json().catch(() => null);
  if (!body || !['check', 'story'].includes(body.op)) return fail('Open a specific file before checking it.', 400);
  const netfly = typeof body.file === 'string' ? await netflyContext() : null;
  if (typeof body.file === 'string' && (!netfly || netfly.actor.id !== actor.id)) return fail('NETFLY file access is unavailable.', 403);
  if (!netfly && (typeof body.lead_id !== 'string' || typeof body.claim_id !== 'string' || !body.lead_id || !body.claim_id)) return fail('Open a specific file before checking it.', 400);
  const admin = supabaseAdmin();
  const load = () => netfly ? loadNetflyQaSnapshot(netfly, body.file) : loadQaSnapshot(db, admin, body.lead_id, body.claim_id);
  try {
    const snapshot = await load();
    if (body.op === 'story' && body.fingerprint !== snapshot.fingerprint) return fail('This file changed. Run the quick check again before reviewing its story.', 409);
    const report: QaReport = { claimId: snapshot.claim.id, fingerprint: snapshot.fingerprint, checkedAt: new Date().toISOString(), findings: deterministicQa(snapshot.input), narrative: 'not_run', sent: snapshot.input.sent };
    if (body.op === 'story' && !report.sent) {
      const sources = qaSources(snapshot.input);
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18000);
      let raw = '';
      try { raw = await askRelay(QA_NARRATIVE_SYSTEM, JSON.stringify({ sources }), controller.signal, { preferProxy: true }); } finally { clearTimeout(timer); }
      let parsed: unknown;
      try { parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); } catch { parsed = null; }
      const extra = narrativeQa(parsed, sources);
      report.narrative = extra ? 'complete' : 'unavailable';
      if (extra) report.findings.push(...extra);
    }
    // A slow model response must never appear to review newer source material.
    const current = await load();
    if (current.fingerprint !== report.fingerprint) return fail('Answers or documents changed during the check. Run it again.', 409);
    const saved = await admin.from('audit_log').insert({ firm_id: snapshot.lead.firm_id, lead_id: snapshot.lead.id, claim_id: snapshot.claim.id,
      actor: actor.id, actor_name: actor.name, category: 'system', description: 'Checked this matter’s file; findings are advisory. No status or delivery changed.',
      meta: { action: 'file_qa', rule_version: QA_RULE_VERSION, report } });
    if (saved.error) return fail('The review history did not save. Please run the check again; nothing was approved or sent.', 503);
    return NextResponse.json({ report }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) { return fail(error.message || 'The check could not finish. Your file is unchanged.', 503); }
}
