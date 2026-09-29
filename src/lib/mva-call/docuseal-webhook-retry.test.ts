import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const routePath = path.resolve(__dirname, '../../app/api/esign/docuseal/route.ts');
const source = fs.readFileSync(routePath, 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture() {
  let lookupError: any = null;
  let syncFailure = false;
  let synced = 0;
  const row = { id: 'agreement', submission_id: '123', status: 'sent' };
  const admin = { from: (table: string) => {
    if (table === 'webhook_events') return { insert: async () => ({ error: null }) };
    assert.equal(table, 'esign_submissions');
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: lookupError ? null : row, error: lookupError }) };
    return q;
  } };
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, init: any = {}) => ({ status: init.status ?? 200, body }) } },
    '@/lib/supabase-server': { supabaseAdmin: () => admin },
    '@/lib/docuseal': { webhookAuthorized: (given: string, expected: string) => given === expected },
    '@/lib/mva-call/esign': { syncSubmission: async (_admin: any, _row: any, opts: any) => {
      synced++; assert.equal(opts.strict, true);
      if (syncFailure) throw new Error('Provider did not answer');
      return 'signed';
    } },
  };
  const exports: any = {};
  new Function('require', 'exports', code)((name: string) => {
    assert.ok(name in modules, `Unstubbed webhook import ${name}`);
    return modules[name];
  }, exports);
  const request: any = {
    url: 'https://claimreach.example.invalid/api/esign/docuseal',
    headers: { get: (name: string) => name === 'x-cr-secret' ? 'offline-secret' : null },
    json: async () => ({ event_type: 'form.completed', data: { submission_id: 123 } }),
  };
  return { route: exports, request, get synced() { return synced; }, setLookupError: (error: any) => { lookupError = error; }, setSyncFailure: (value: boolean) => { syncFailure = value; } };
}

(async () => {
  const previous = process.env.DOCUSEAL_WEBHOOK_SECRET;
  process.env.DOCUSEAL_WEBHOOK_SECRET = 'offline-secret';
  try {
    const lookup = fixture(); lookup.setLookupError({ message: 'database unavailable' });
    assert.equal((await lookup.route.POST(lookup.request)).status, 503);
    assert.equal(lookup.synced, 0);
    console.log('ok DocuSeal webhook requests retry when local agreement lookup fails');

    const provider = fixture(); provider.setSyncFailure(true);
    assert.equal((await provider.route.POST(provider.request)).status, 503);
    assert.equal(provider.synced, 1);
    console.log('ok DocuSeal webhook requests retry when provider verification or persistence fails');

    const success = fixture();
    const response = await success.route.POST(success.request);
    assert.equal(response.status, 200); assert.equal(response.body.status, 'signed');
    console.log('ok DocuSeal webhook acknowledges a confirmed signed transition');
  } finally {
    if (previous === undefined) delete process.env.DOCUSEAL_WEBHOOK_SECRET;
    else process.env.DOCUSEAL_WEBHOOK_SECRET = previous;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
