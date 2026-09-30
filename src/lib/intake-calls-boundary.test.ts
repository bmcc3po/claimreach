import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve(__dirname, '../app/api/intake-calls/route.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;

async function check(role: string, visible: boolean) {
  const calls = { sessionUpdates: 0, admin: 0 };
  const sb = { from: (table: string) => {
    assert.equal(table, 'intake_calls'); calls.sessionUpdates++;
    return { update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({
      data: visible ? { id: 'call' } : null, error: null,
    }) }) }) }) };
  } };
  const exports: any = {};
  new Function('require', 'exports', code)((name: string) => {
    const modules: Record<string, any> = {
      'next/server': { NextResponse: { json: (body: any, init: any = {}) => ({ status: init.status ?? 200, body }) } },
      '@/lib/supabase-server': {
        supabaseServer: async () => sb,
        supabaseAdmin: () => { calls.admin++; throw new Error('Privileged client must not be used by PATCH'); },
      },
      '@/lib/gate': { gateUser: async () => ({ role }) },
    };
    assert.ok(name in modules, `Unstubbed route import ${name}`);
    return modules[name];
  }, exports);
  const result = await exports.PATCH({ json: async () => ({ id: 'call', post_sign: { ok: true } }) });
  return { result, calls };
}

(async () => {
  const firm = await check('firm', true);
  assert.equal(firm.result.status, 403);
  assert.equal(firm.calls.sessionUpdates, 0);
  assert.equal(firm.calls.admin, 0);

  const hidden = await check('owner', false);
  assert.equal(hidden.result.status, 404);
  assert.equal(hidden.calls.sessionUpdates, 1);
  assert.equal(hidden.calls.admin, 0);

  const visible = await check('owner', true);
  assert.equal(visible.result.status, 200);
  assert.equal(visible.calls.sessionUpdates, 1);
  assert.equal(visible.calls.admin, 0);
  console.log('intake-call PATCH session boundary passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
