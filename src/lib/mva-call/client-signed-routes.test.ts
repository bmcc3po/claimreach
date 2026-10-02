import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type ResponseShape = { status: number; body?: any; location?: string; headers?: Record<string, string> };
const nextResponse = {
  json: (body: any, init: any = {}): ResponseShape => ({ status: init.status ?? 200, body, headers: init.headers }),
  redirect: (location: string, init: any = {}): ResponseShape => ({ status: init.status ?? 302, location, headers: init.headers }),
};

function loadRoute(relative: string, modules: Record<string, any>) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/api/calls/esign', relative, 'route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const exports: any = {};
  new Function('require', 'exports', code)((name: string) => {
    assert.ok(name in modules, `Unstubbed route import ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

let passed = 0;
async function test(name: string, run: () => Promise<void>) {
  await run(); passed++; console.log('ok', name);
}

function docFixture() {
  let staff: any = { id: 'agent' };
  let row: any = { id: 'agreement', firm_id: 'firm', submission_id: 123, status: 'signed', signed_at: '2026-09-29T12:00:00Z', completed_pdf_path: null, cert_pdf_path: null };
  let snapshot: any = { ok: true, path: 'firm/client-ds-123.pdf' };
  const calls = { reads: 0, admin: 0, snapshot: 0, signedUrls: 0 };
  const sb = { from: (table: string) => {
    assert.equal(table, 'esign_submissions'); calls.reads++;
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) };
  } };
  const admin = { storage: { from: (bucket: string) => {
    assert.equal(bucket, 'signed-docs');
    return { download: async (requested: string) => ({ data: new Blob([`%PDF-${requested}`], { type: 'application/pdf' }), error: null }), createSignedUrl: async (requested: string, seconds: number) => {
      calls.signedUrls++; assert.equal(seconds, 300);
      return { data: { signedUrl: `https://storage.example.invalid/${requested}` }, error: null };
    } };
  } } };
  const route = loadRoute('doc/[id]/[kind]', {
    'next/server': { NextResponse: nextResponse },
    '@/lib/supabase-server': { supabaseServer: async () => sb, supabaseAdmin: () => { calls.admin++; return admin; } },
    '@/lib/mva-call/server': { requireStaff: async () => staff },
    '@/lib/signed-docs': { SIGNED_BUCKET: 'signed-docs', SIGNED_URL_SECONDS: 300 },
    '@/lib/mva-call/esign': { expectedPacketPaths: (_firm: string, _submission: string, count: number) => Array.from({ length: count }, (_, i) => `firm/signed-${i + 1}.pdf`) },
    '@/lib/mva-call/client-signed': { ensureClientSignedSnapshot: async () => { calls.snapshot++; return snapshot; } },
  });
  return { route, calls, setStaff: (value: any) => { staff = value; }, setRow: (value: any) => { row = value; }, setSnapshot: (value: any) => { snapshot = value; } };
}

function reviewFixture() {
  let staff: any = { id: 'agent', name: 'Agent' };
  let selected: any = { ok: true, row: {
    id: 'current', lead_id: 'lead', firm_id: 'firm', submission_id: 123, status: 'signed', signed_at: '2026-09-29T12:00:00Z',
    voided_at: null, replacement_requested_at: null, agent_reviewed_at: null,
  } };
  let snapshot: any = { ok: true, path: 'firm/client-ds-123.pdf' };
  const calls = { admin: 0, snapshot: 0, updates: 0, audits: 0, filters: [] as [string, any][], order: [] as string[] };
  const sb = {};
  const admin = { from: (table: string) => {
    assert.equal(table, 'esign_submissions');
    return {
      update: (values: any) => {
        calls.updates++; calls.order.push('update');
        assert.equal(values.agent_reviewed_by, 'agent');
        const q: any = {
          eq: (key: string, value: any) => { calls.filters.push([key, value]); return q; },
          is: (key: string, value: any) => { calls.filters.push([key, value]); return q; },
          select: () => q,
          maybeSingle: async () => ({ data: { id: 'current' }, error: null }),
        };
        return q;
      },
    };
  } };
  const route = loadRoute('review', {
    'next/server': { NextResponse: nextResponse },
    '@/lib/supabase-server': { supabaseServer: async () => sb, supabaseAdmin: () => { calls.admin++; return admin; } },
    '@/lib/mva-call/server': { requireStaff: async () => staff },
    '@/lib/mva-call/signing-matter': {
      resolveSigningMatter: async () => ({ ok: true, lead: { id: 'lead' }, matter: { claim: { id: 'claim' } } }),
      getMatterAgreement: async (_sb: any, _lead: any, _matter: any, id: string) => {
        assert.equal(id, 'current'); return selected;
      },
    },
    '@/lib/mva-call/client-signed': { ensureClientSignedSnapshot: async () => { calls.snapshot++; calls.order.push('snapshot'); return snapshot; } },
    '@/lib/audit': { recordAudit: async () => { calls.audits++; } },
  });
  const request: any = { json: async () => ({ lead_id: 'lead', claim_id: 'claim', agreement_id: 'current' }) };
  return { route, request, calls, setStaff: (value: any) => { staff = value; }, setSelected: (value: any) => { selected = value; }, setSnapshot: (value: any) => { snapshot = value; } };
}

(async () => {
  await test('client-signed PDF route denies unauthenticated access before RLS or admin storage', async () => {
    const f = docFixture(); f.setStaff(null);
    const response = await f.route.GET(null, { params: Promise.resolve({ id: 'agreement', kind: 'client' }) });
    assert.equal(response.status, 401); assert.equal(f.calls.reads, 0); assert.equal(f.calls.admin, 0);
  });
  await test('client-signed PDF route denies an RLS-hidden agreement before admin storage', async () => {
    const f = docFixture(); f.setRow(null);
    const response = await f.route.GET(null, { params: Promise.resolve({ id: 'hidden', kind: 'client' }) });
    assert.equal(response.status, 404); assert.equal(f.calls.reads, 1); assert.equal(f.calls.admin, 0);
  });
  await test('client-signed PDF route serves a short-lived private preliminary copy, separate from final', async () => {
    const f = docFixture();
    const preliminary = await f.route.GET(new Request('https://app.example.invalid/api/calls/esign/doc/agreement/client'), { params: Promise.resolve({ id: 'agreement', kind: 'client' }) });
    assert.equal(preliminary.status, 302); assert.match(preliminary.location, /client-ds-123\.pdf$/);
    assert.equal(preliminary.headers?.['Cache-Control'], 'no-store'); assert.equal(f.calls.snapshot, 1);
    const final = await f.route.GET(null, { params: Promise.resolve({ id: 'agreement', kind: 'signed' }) });
    assert.equal(final.status, 404); assert.equal(f.calls.snapshot, 1);
  });
  await test('client-signed PDF route fails closed when the preliminary copy is unavailable', async () => {
    const f = docFixture(); f.setSnapshot({ ok: false, error: 'Preview unavailable' });
    const response = await f.route.GET(null, { params: Promise.resolve({ id: 'agreement', kind: 'client' }) });
    assert.equal(response.status, 503); assert.equal(f.calls.signedUrls, 0);
  });
  await test('manual download returns the available PDF without claiming firm delivery', async () => {
    const f = docFixture();
    const response = await f.route.GET(new Request('https://app.example.invalid/api/calls/esign/doc/agreement/client?download=1'), { params: Promise.resolve({ id: 'agreement', kind: 'client' }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Disposition') || '', /attachment/);
    assert.equal(f.calls.signedUrls, 0);
  });
  await test('review route denies unauthenticated access before admin writes', async () => {
    const f = reviewFixture(); f.setStaff(null);
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 401); assert.equal(f.calls.admin, 0); assert.equal(f.calls.snapshot, 0);
  });
  await test('review route rejects a stale or historical agreement selected by the matter guard', async () => {
    const f = reviewFixture(); f.setSelected({ ok: false, status: 409, error: 'Not the current agreement.' });
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 409); assert.equal(f.calls.admin, 0); assert.equal(f.calls.snapshot, 0);
  });
  await test('review route refuses to acknowledge a signature without a durable preliminary PDF', async () => {
    const f = reviewFixture(); f.setSnapshot({ ok: false, error: 'Preview unavailable' });
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 503); assert.equal(f.calls.updates, 0); assert.equal(f.calls.audits, 0);
  });
  await test('review route saves the signed evidence before recording an exact-row review', async () => {
    const f = reviewFixture();
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 200); assert.equal(response.body.ok, true);
    assert.deepEqual(f.calls.order, ['snapshot', 'update']);
    assert.deepEqual(f.calls.filters, [['id', 'current'], ['status', 'signed'], ['voided_at', null], ['agent_reviewed_at', null]]);
    assert.equal(f.calls.audits, 1);
  });
  console.log(`${passed} client-signed route tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
