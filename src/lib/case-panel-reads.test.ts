import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { FakeDb } from './test-fake-db';
async function main() {
  for (const name of ['documents', 'messages']) for (const failed of [true, false]) {
    const db = new FakeDb({ case_documents: [], notes: [] });
    db.failOn = () => failed ? 'Synthetic database read failure' : null;
    const sb = Object.assign(db, { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } });
    const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/api/' + name + '/route.ts'), 'utf8'), { compilerOptions: { target: 9, module: 1 } }).outputText;
    const out: any = {}; let admins = 0;
    new Function('require', 'exports', code)((id: string) => id === 'next/server' ? require('next/server') : { supabaseServer: async () => sb, supabaseAdmin: () => { admins++; return {}; } }, out);
    const r = await out.GET(new NextRequest('https://claimreach.test/api/' + name + '?lead=synthetic'));
    assert.equal(r.status, failed ? 503 : 200);
    const data = await r.json();
    if (failed) { assert.ok(data.error); assert.equal(admins, 0); } else assert.deepEqual(data[name === 'documents' ? 'docs' : 'messages'], []);
  }
  console.log('Document/message GETs return failed reads as errors rather than empty success; no storage signing on failed reads');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
