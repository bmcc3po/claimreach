import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import { netflyDocumentKey } from './netfly-documents';

const db = new FakeDb({ case_documents: [
  { id: 'pdf', firm_id: 'firm', lead_id: 'lead', claim_id: 'claim', doc_type: 'netfly_signed_retainer', storage_path: 'firm/lead/claim/test.pdf' },
  { id: 'other-claim', firm_id: 'firm', lead_id: 'lead', claim_id: 'other', doc_type: 'netfly_signed_retainer', storage_path: 'firm/lead/other.pdf' },
  { id: 'other-firm', firm_id: 'other', lead_id: 'lead', claim_id: 'claim', doc_type: 'netfly_signed_retainer', storage_path: 'other/lead/test.pdf' },
  { id: 'not-retainer', firm_id: 'firm', lead_id: 'lead', claim_id: 'claim', doc_type: 'other', storage_path: 'firm/lead/email.txt' },
  { id: 'bad-path', firm_id: 'firm', lead_id: 'lead', claim_id: 'claim', doc_type: 'netfly_signed_retainer', storage_path: 'firm/lead/../private.pdf' },
] });
let allowed = true, issue = false, issued = 0;
(db as any).storage = { from: (bucket: string) => ({ createSignedUrl: async (key: string, ttl: number) => {
  assert.equal(bucket, 'case-docs'); assert.equal(key, 'firm/lead/claim/test.pdf'); assert.equal(ttl, 300);
  issued++; return issue ? { error: 'unavailable' } : { data: { signedUrl: `https://storage.example.test/test.pdf?attempt=${issued}` } };
} }) };
const modules: Record<string, any> = {
  'next/server': { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }),
    redirect: (url: string, status: number) => ({ url, status, headers: new Headers() }) } },
  '@/lib/netfly-server': { netflyContext: async () => ({ actor: { can: (permission: string) => allowed && permission === 'leads.view' }, db, campaign: { firm_id: 'firm' } }),
    netflyMatter: async (_ctx: any, file: string) => file === 'TMP-TEST' ? { lead: { id: 'lead' }, claim: { id: 'claim' } } : null },
  '@/lib/netfly-ontake': { NETFLY_RETAINER_TYPE: 'netfly_signed_retainer' },
  '@/lib/netfly-documents': { netflyDocumentKey },
};
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/api/netfly/retainer/route.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const route: any = {};
new Function('require', 'exports', compiled)((name: string) => { assert.ok(modules[name], name); return modules[name]; }, route);
const open = (doc = 'pdf', file = 'TMP-TEST') => route.GET({ url: `https://claimreach.test/api/netfly/retainer?file=${file}&document=${doc}` });
async function main() {
  allowed = false; assert.equal((await open()).status, 403);
  allowed = true; assert.equal((await open('pdf', 'foreign')).status, 404);
  for (const id of ['other-claim', 'other-firm', 'not-retainer', 'bad-path', 'missing']) assert.equal((await open(id)).status, 404);
  assert.equal(issued, 0, 'never sign a document outside the scoped retainer');
  const first = await open(), second = await open();
  assert.equal(first.status, 307); assert.notEqual(first.url, second.url, 'each opening asks storage for a fresh link');
  assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
  issue = true; assert.equal((await open()).status, 503);
  console.log('NETFLY PDF opening: fresh links, no-cache, permissions, matter/firm/type/path boundaries and storage failure passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
