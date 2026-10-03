import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import * as settings from './netfly-delivery-settings';

function route(file: string, modules: Record<string, any>) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result: any = {};
  new Function('require', 'exports', code)((name: string) => {
    if (name === 'next/server') return { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } };
    return modules[name] || {};
  }, result);
  return result;
}
const FIRM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const initial = () => new FakeDb({ campaigns: [
  { id: 'netfly', firm_id: FIRM, firm_email: 'before@example.test', firm_cc: 'copy@example.test', firm_delivery_on: false },
  { id: 'other', firm_id: OTHER, firm_email: 'untouched@example.test' },
], firms: [{ id: FIRM }, { id: OTHER }], audit_log: [] });
let db = initial();
let actor: any = { id: 'owner', name: 'Test Owner', role: 'owner', can: () => true };
let available = true;
const netfly = route('../app/api/netfly/route.ts', {
  '@/lib/netfly-server': { netflyContext: async () => available ? { db, actor, campaign: { ...db.tables.campaigns[0] } } : null },
  '@/lib/netfly-delivery-settings': settings,
});
const post = (body: any = {}) => netfly.POST({ json: async () => ({ op: 'delivery_settings', firm_email: 'After@Example.Test ', expected_to: 'before@example.test', ...body }) });
const legacy = route('../app/api/campaigns/route.ts', {
  '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => { throw new Error('Campaign writes must not bypass RLS'); } },
  '@/lib/gate': { gateUser: async () => available ? actor : null },
});
const campaignPost = (body: any = {}) => legacy.POST({ json: async () => ({ id: 'netfly', name: 'Test campaign', case_type: 'mva', firm_id: FIRM, firm_email: 'owner@example.test', ...body }) });

async function main() {
  for (const role of ['agent', 'qa', 'manager', 'admin', 'firm']) {
    actor.role = role;
    assert.equal((await post()).status, 403, role + ' cannot redirect signed files');
    assert.equal(db.ops.length, 0);
  }
  actor.role = 'owner'; actor.can = () => false;
  assert.equal((await post()).status, 403);
  actor.can = () => true;
  available = false;
  assert.equal((await post()).status, 403);
  assert.equal((await campaignPost()).status, 401);
  available = true;
  for (const email of ['', 'bad', 'one@example.test,two@example.test', 'Brett <one@example.test>', 'bmc@innovativeintake.com', 'a\n@example.test']) {
    assert.equal((await post({ firm_email: email })).status, 400);
  }
  assert.equal((await post({ expected_to: 'stale@example.test' })).status, 409);
  assert.equal(db.ops.length, 0, 'rejected requests cannot mutate anything');
  const saved = await post({ firm_id: OTHER, campaign_id: 'other', firm_cc: 'evil@example.test', firm_delivery_on: true });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.delivery.to, 'after@example.test');
  assert.equal(db.tables.campaigns[0].firm_email, 'after@example.test');
  assert.equal(db.tables.campaigns[0].firm_cc, 'copy@example.test');
  assert.equal(db.tables.campaigns[0].firm_delivery_on, false);
  assert.equal(db.tables.campaigns[1].firm_email, 'untouched@example.test');
  assert.equal(db.tables.audit_log[0].meta.previous, 'before@example.test');
  const write = db.ops.find(op => op.table === 'campaigns' && op.kind === 'update')!;
  for (const column of ['id', 'firm_id', 'firm_email']) assert(write.filters.some(filter => filter[1] === column));
  db = initial(); db.failOn = op => op.kind === 'update' ? 'write failed' : null;
  assert.equal((await post()).status, 503);
  assert.equal(db.tables.campaigns[0].firm_email, 'before@example.test');
  db = initial(); db.failOn = op => op.table === 'audit_log' ? 'audit unavailable' : null;
  const warning = await post();
  assert.equal(warning.status, 200); assert(warning.body.warning);

  db = initial();
  assert.equal((await campaignPost({ firm_id: OTHER })).status, 409, 'cannot reassign an existing campaign');
  assert.equal((await campaignPost({ id: 'hidden' })).status, 403);
  assert.equal((await campaignPost({ firm_id: 'hidden' })).status, 403);
  assert.equal(db.ops.filter(op => op.kind !== 'select').length, 0);
  db = initial(); db.failOn = op => op.kind === 'update' ? 'RLS denies update' : null;
  assert.equal((await campaignPost()).status, 500);
  assert.equal(db.tables.campaigns[0].firm_email, 'before@example.test');
  assert.equal((await legacy.DELETE({ url: 'https://example.test/api/campaigns?id=netfly' })).status, 500);
  db = initial();
  assert.equal((await campaignPost()).status, 200);
  const scoped = db.ops.find(op => op.kind === 'update')!;
  assert(scoped.filters.some(filter => filter[1] === 'firm_id' && filter[2] === FIRM));
  actor.role = 'agent';
  assert.equal((await campaignPost()).status, 403);
  assert.equal((await legacy.DELETE({ url: 'https://example.test/api/campaigns?id=netfly' })).status, 403);
  console.log('NETFLY delivery settings: recipient validation, owner access, firm scope, concurrency, failure visibility and campaign RLS checks passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
