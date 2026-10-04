import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from '../test-fake-db';
import * as signing from './signing-matter';

globalThis.fetch = async () => { throw Error('No network in offline test'); };
async function run(status: string, passenger: boolean, signedAt: string | null = '2026-10-04T12:00:00Z') {
  const db = new FakeDb({
    leads: [{ id: 'caller', firm_id: 'firm', campaign_id: '40000000-0000-4000-8000-000000000001', phone: '2025550100' }],
    claims: [{ id: '20000000-0000-4000-8000-000000000001', lead_id: 'caller', firm_id: 'firm', campaign_id: '40000000-0000-4000-8000-000000000001', claim_type: 'mva' }],
    esign_submissions: [{ id: 'current', lead_id: 'caller', firm_id: 'firm', claim_id: '20000000-0000-4000-8000-000000000001', campaign_id: '40000000-0000-4000-8000-000000000001', pax_index: null, status, signed_at: signedAt }],
    signable_documents: [], esign_templates: [],
  });
  // Stop at the first existing step after our guard. A passing guard must reach
  // campaign-template validation; denied callers must not touch it or mutate.
  db.failOn = op => op.table === 'esign_templates' ? 'Offline test boundary' : null;
  let adminCalls = 0;
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => { adminCalls++; throw Error('No privileged mutation in this test'); } },
    '@/lib/mva-call/server': { requireStaff: async () => ({ id: 'agent', role: 'agent' }), parseDob: () => null },
    '@/lib/docuseal': { docusealConfigured: () => true },
    '@/lib/justcall-send': { toE164: (v: string) => v },
    '@/lib/mva-call/signing-matter': { ...signing, resolveSigningMatter: (session: any, lead: string, opts: any) => signing.resolveSigningMatter(session, lead, { ...opts, authoritativeDb: db }) },
    '@/lib/office-clock': { officeDateUS: () => '10/04/2026' },
    '@/lib/audit': { recordAudit: async () => {} },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/api/calls/esign/route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route: any = {};
  new Function('require', 'exports', code)((id: string) => modules[id] ?? {}, route);
  const result = await route.POST({ json: async () => ({ lead_id: 'caller', claim_id: '20000000-0000-4000-8000-000000000001', signer_name: 'Synthetic Person', via: 'Text', phone: '2025550101', doi: '10/02/2026', ...(passenger ? { pax_index: 0, pax_key: 'friend' } : {}) }) });
  const allowed = !passenger || (['signed', 'completed'].includes(status) && !!signedAt);
  assert.equal(result.status, allowed ? 503 : 409, JSON.stringify(result));
  assert.match(result.body.error, allowed ? /campaign.*templates/ : /caller’s signature first/);
  assert.equal(db.ops.some(op => op.table === 'esign_templates'), allowed);
  assert.equal(adminCalls, 0);
  assert.ok(db.ops.every(op => op.kind === 'select'));
}
(async () => {
  for (const status of ['sent', 'opened', 'voided', 'expired', 'declined', 'signed', 'completed']) await run(status, true);
  await run('signed', true, null);
  await run('sent', false);
  console.log('9 actual send-route caller-first cases passed; zero provider calls or writes');
})().catch(e => { console.error(e); process.exitCode = 1; });
