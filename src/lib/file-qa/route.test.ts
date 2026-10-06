import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from '../test-fake-db';
import * as report from './report';
globalThis.fetch = async () => { throw Error('Network forbidden'); };
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../app/api/calls/file-qa/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(options: { denied?: boolean; stale?: boolean; badAudit?: boolean; changed?: boolean; sent?: boolean; invalidModel?: boolean } = {}) {
  const db = new FakeDb({ audit_log: [] });
  if (options.badAudit) db.failOn = op => op.kind === 'insert' ? 'audit failed' : null;
  let snapshots = 0, modelCalls = 0;
  const mods: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, opts: any = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => db },
    '@/lib/mva-call/server': { requireStaff: async () => options.denied ? null : { id: 'actor', name: 'Synthetic Agent', can: () => true } },
    '@/lib/file-qa/report': report,
    '@/lib/file-qa/server': { loadQaSnapshot: async (_db: any, _admin: any, lead: string, claim: string) => {
      assert.equal(lead, 'own-lead'); assert.equal(claim, 'own-claim'); snapshots++;
      return { lead: { id: lead, firm_id: 'own-firm' }, claim: { id: claim }, fingerprint: options.changed && snapshots > 1 ? 'new' : 'saved',
        input: { flow: 'netfly', answers: { fields: { incident_story: 'Synthetic rear-end crash', seen_doctor: 'No' } }, contact: {}, packetErrors: [], sent: !!options.sent } };
    } },
    '@/lib/ai-relay': { askRelay: async (_system: string, data: string) => { modelCalls++; assert.doesNotMatch(data, /unrelated/); return options.invalidModel ? 'not JSON' : JSON.stringify({ findings: [] }); } },
    '@/lib/netfly-server': { netflyContext: async () => ({}), netflyMatter: async (_ctx: any, file: string) => file === 'own-file' ? { lead: { id: 'own-lead' }, claim: { id: 'own-claim' } } : null },
  };
  const mod: any = {}; new Function('require', 'exports', code)((id: string) => { if (!(id in mods)) throw Error(id); return mods[id]; }, mod);
  return { db, modelCalls: () => modelCalls, snapshots: () => snapshots, post: (body: any = {}, origin = 'https://claimreach.test') => mod.POST({ url: 'https://claimreach.test/api/calls/file-qa', headers: new Headers({ origin }), json: async () => ({ lead_id: 'own-lead', claim_id: 'own-claim', op: 'check', ...body }) }) };
}
async function main() {
  let f = fixture({ denied: true }); assert.equal((await f.post()).status, 403); assert.equal(f.snapshots(), 0);
  f = fixture(); assert.equal((await f.post({}, 'https://other.test')).status, 403); assert.equal(f.snapshots(), 0);
  assert.equal((await f.post({ file: 'other-file' })).status, 404); assert.equal(f.snapshots(), 0);
  assert.equal((await f.post({ op: 'story', fingerprint: 'old' })).status, 409); assert.equal(f.modelCalls(), 0); assert.equal(f.db.ops.length, 0);
  f = fixture(); const quick = await f.post(); assert.equal(quick.status, 200); assert.equal(quick.body.report.narrative, 'not_run');
  assert.equal(f.modelCalls(), 0); assert.equal(f.db.tables.audit_log[0].claim_id, 'own-claim'); assert.equal(f.db.tables.audit_log[0].firm_id, 'own-firm');
  assert.ok(f.db.ops.every(op => op.table === 'audit_log' && op.kind === 'insert'));
  f = fixture(); assert.equal((await f.post({ op: 'story', fingerprint: 'saved' })).body.report.narrative, 'complete'); assert.equal(f.modelCalls(), 1);
  f = fixture({ invalidModel: true }); assert.equal((await f.post({ op: 'story', fingerprint: 'saved' })).body.report.narrative, 'unavailable');
  f = fixture({ sent: true }); assert.equal((await f.post({ op: 'story', fingerprint: 'saved' })).body.report.sent, true); assert.equal(f.modelCalls(), 0);
  f = fixture({ changed: true }); assert.equal((await f.post({ op: 'story', fingerprint: 'saved' })).status, 409); assert.equal(f.db.ops.length, 0);
  f = fixture({ badAudit: true }); assert.equal((await f.post()).status, 503);
  console.log('File QA route: 10 authorization, stale-response, failure and audit-only scenarios passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
