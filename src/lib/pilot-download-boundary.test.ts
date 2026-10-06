import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadRoute(relative: string, modules: Record<string, any>) {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/api', relative, 'route.ts'), 'utf8');
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

const response = {
  json: (body: any, init: any = {}) => ({ status: init.status ?? 200, body }),
  redirect: (url: string) => ({ status: 302, url }),
};

function signedFixture(role: string, visible: boolean) {
  const calls = { documentReads: 0, signedUrls: 0 };
  const sb = { from: (table: string) => {
    assert.equal(table, 'signable_documents'); calls.documentReads++;
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? { id: 'doc' } : null, error: null }) }) }) };
  } };
  const admin = {
    from: (table: string) => {
      assert.equal(table, 'signable_documents');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'doc', firm_id: 'tmp', lead_id: 'pilot-lead', signed_at: '2026-09-29T12:00:00Z',
        completed_pdf_path: 'tmp/signed-doc.pdf', cert_pdf_path: null,
      }, error: null }) }) }) };
    },
    storage: { from: () => ({ createSignedUrl: async () => {
      calls.signedUrls++; return { data: { signedUrl: 'https://storage.example.invalid/doc' } };
    } }) },
  };
  const route = loadRoute('signed-doc/[id]/[kind]', {
    'next/server': { NextResponse: response },
    '@/lib/supabase-server': { supabaseServer: async () => sb, supabaseAdmin: () => admin },
    '@/lib/gate': { gateUser: async () => ({ role, firmId: null }) },
    '@/lib/permissions': { isInternalRole: (r: string) => ['owner', 'admin', 'manager', 'agent', 'qa'].includes(r) },
    '@/lib/signed-docs': {
      SIGNED_BUCKET: 'signed-docs', SIGNED_URL_SECONDS: 300,
      isSignedKind: (kind: string) => kind === 'signed' || kind === 'cert',
      mayOpenSignedDoc: () => true,
    },
  });
  return { route, calls };
}

(async () => {
  const hidden = signedFixture('agent', false);
  const denied = await hidden.route.GET(null, { params: Promise.resolve({ id: 'doc', kind: 'signed' }) });
  assert.equal(denied.status, 404);
  assert.equal(hidden.calls.documentReads, 1);
  assert.equal(hidden.calls.signedUrls, 0);

  const visible = signedFixture('agent', true);
  const allowed = await visible.route.GET(null, { params: Promise.resolve({ id: 'doc', kind: 'signed' }) });
  assert.equal(allowed.status, 302);
  assert.equal(visible.calls.signedUrls, 1);

  const owner = signedFixture('owner', false);
  const ownerResult = await owner.route.GET(null, { params: Promise.resolve({ id: 'doc', kind: 'signed' }) });
  assert.equal(ownerResult.status, 302);
  assert.equal(owner.calls.documentReads, 0);

  const sbTables: string[] = [];
  const sb = { from: (table: string) => {
    sbTables.push(table);
    if (table === 'leads') return { select: () => {
      const q: any = { eq: () => q, is: (column: string, value: unknown) => { assert.equal(column, 'archived_at'); assert.equal(value, null); return q; }, order: async () => ({ data: [{ id: 'pilot', lead_no: 'TMP-1', claimant_name: 'Test Client' }], error: null }) };
      return q;
    } };
    if (table === 'claims') return { select: () => ({ in: async () => ({ data: [{ lead_id: 'pilot', answers: {} }], error: null }) }) };
    throw new Error(`unexpected ${table}`);
  } };
  const exportRoute = loadRoute('export/answers-csv', {
    'next/server': { NextResponse: response },
    '@/lib/supabase-server': { supabaseServer: async () => sb },
    '@/lib/gate': { requirePerm: async () => ({ ok: true, user: { role: 'manager' } }) },
    '@/lib/permissions': { isInternalRole: () => true },
    '@/lib/forms': { resolveIntakeFields: async () => [] },
    '@/lib/questionnaire': { intakeForType: () => [] },
  });
  const csv = await exportRoute.GET({ url: 'https://claimreach.example/api/export/answers-csv?case_type=inno_mva' });
  assert.equal(csv.status, 200);
  assert.deepEqual(sbTables, ['leads', 'claims']);
  assert.match(await csv.text(), /Test Client/);
  console.log('signed-document and answers-CSV pilot boundaries passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
