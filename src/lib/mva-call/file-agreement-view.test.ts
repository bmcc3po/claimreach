import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { paxParentId } from '../linked-files';

// Exercise the real file endpoint, which feeds inline review, final delivery,
// the command center and owner download. Passenger provenance is not UI scope.
const source = fs.readFileSync(path.resolve(__dirname, '../../app/api/calls/file/route.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(externalId: string | null, pax: number | null) {
  let staff = true;
  let readError = false;
  const filters: string[] = [];
  const lead = { id: 'child', firm_id: 'firm', external_id: externalId, claimant_name: 'TEST Passenger', archived_at: null };
  const rows = [
    { id: 'latest', pax_index: pax, status: 'signed', signed_at: '2026-10-04', created_at: '2026-10-04' },
    { id: 'old', pax_index: null, status: 'completed', created_at: '2026-10-03' },
  ];
  const db = { from(table: string) {
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (key: string, value: string) => { if (table === 'esign_submissions') filters.push(`${key}=${value}`); return q; },
      or: (value: string) => { if (table === 'esign_submissions') filters.push(value); return q; },
      maybeSingle: async () => ({ data: lead }),
      then: (resolve: any) => Promise.resolve({ data: table === 'esign_submissions' ? rows : [], error: table === 'esign_submissions' && readError ? { message: 'test read failure' } : null }).then(resolve),
    };
    return q;
  } };
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, init: any = {}) => ({ status: init.status || 200, body }) } },
    '@/lib/mva-call/agreement-names': { agreementName: () => 'TEST packet' },
    '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => db },
    '@/lib/mva-call/server': { requireStaff: async () => staff ? { id: 'agent', role: 'agent' } : null },
    '@/lib/file-notes': { loadFileNotes: async () => ({ notes: [], deskNotes: [] }), mergeFileNotes: () => [] },
    '@/lib/claim-status': { loadStatuses: async () => [] },
    '@/lib/statuses': { resolveStatus: () => ({ label: 'Signed', tone: 'neutral' }), SIGNED_QA_RETURN_STATUS: 'qa_return' },
    '@/lib/mva-call/signing-matter': { resolveSigningMatter: async () => ({ ok: true, lead, matter: { claim: { id: 'own-claim', status: 'signed' } } }) },
    '@/lib/matter': { matterRowsFilter: () => 'claim_id.eq.own-claim' },
    '@/lib/lawruler-recovery': { loadLawRulerProvenance: async () => null },
    '@/lib/mva-call/send-attempt': { readPendingSendAttempt: async () => ({ ok: true, attempt: null }) },
    '@/lib/linked-files': { paxParentId },
  };
  const route: any = {};
  new Function('require', 'exports', code)((name: string) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; }, route);
  return { filters, rows, get: () => route.GET(new Request('https://example.invalid/api/calls/file?lead_id=child&claim_id=own-claim')),
    deny: () => { staff = false; }, fail: () => { readError = true; } };
}

(async () => {
  for (const index of [0, 1]) {
    const f = fixture(`90000000-0000-4000-8000-000000000001:pax:p${index}`, index);
    const r = await f.get();
    assert.equal(r.status, 200);
    const primary = r.body.agreements.find((a: any) => a.pax == null);
    assert.equal(primary.id, 'latest', 'passenger current agreement must not disappear or resurrect an older envelope');
    assert.equal(primary.originating_pax_index, index);
    assert.match(primary.client_signed_url, /latest\/client$/);
    assert.equal(f.rows[0].pax_index, index, 'database provenance is unchanged');
    assert.deepEqual(f.filters, ['lead_id=child', 'claim_id.eq.own-claim']);
  }
  const parent = await fixture(null, 1).get();
  assert.equal(parent.body.agreements[0].pax, 1, 'a parent must not adopt an indexed passenger envelope');
  const own = await fixture(null, null).get();
  assert.equal(own.body.agreements[0].pax, null);
  const failed = fixture(null, null); failed.fail(); assert.equal((await failed.get()).status, 500);
  const denied = fixture(null, null); denied.deny(); assert.equal((await denied.get()).status, 401); assert.deepEqual(denied.filters, []);
  console.log('file agreement view: passenger 0/1, own primary, parent exclusion, scope filters, provenance, read failure and auth checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
