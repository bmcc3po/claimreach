import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as access from './firm-review-access';
const campaign = '22222222-2222-4222-8222-222222222222', firm = '11111111-1111-4111-8111-111111111111';
let role = 'agent', conflict = false, existing: any = null, failure = false;
const created: any[] = [];
const db: any = { from(table: string) {
  const q: any = { select: () => q, eq: () => q, ilike: () => q, order: () => q,
    limit: async () => ({ data: conflict ? [{ id: 'existing' }] : [] }),
    maybeSingle: async () => ({ data: { id: campaign, name: 'Fictional Campaign', firm_id: firm } }) };
  assert.ok(['campaigns', 'app_users', 'firm_access'].includes(table)); return q;
}, auth: { admin: {
  listUsers: async () => ({ data: { users: existing ? [existing] : [] } }),
  createUser: async (data: any) => { created.push(data); return failure ? { error: {} } : { data: { user: { id: 'new' } } }; },
} } };
const modules: any = { 'next/server': require('next/server'), '@/lib/supabase-server': { supabaseServer: async () => ({}), supabaseAdmin: () => db },
  '@/lib/gate': { gateUser: async () => ({ id: 'owner-id', role }) }, '@/lib/firm-review-access': access };
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/api/firm-review-admin/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const route: any = {}; new Function('require', 'exports', code)((key: string) => { assert.ok(key in modules); return modules[key]; }, route);
function req(origin = 'https://claimreach.test') { return new NextRequest('https://claimreach.test/api/firm-review-admin', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'Carol@example.test', name: 'Carol', campaign }) }); }
(async () => {
  for (const forbidden of ['agent', 'firm', 'admin', 'manager', 'qa']) { role = forbidden; assert.equal((await route.POST(req())).status, 403); }
  assert.equal(created.length, 0);
  role = 'owner'; assert.equal((await route.POST(req('https://hostile.test'))).status, 403); assert.equal(created.length, 0);
  conflict = true; assert.equal((await route.POST(req())).status, 409); assert.equal(created.length, 0); conflict = false;
  existing = { email: 'carol@example.test', app_metadata: {} }; assert.equal((await route.POST(req())).status, 409); assert.equal(created.length, 0); existing = null;
  assert.equal((await route.POST(req())).status, 200); assert.equal(created.length, 1);
  assert.equal(created[0].email, 'carol@example.test'); assert.equal(created[0].password, undefined); assert.equal(created[0].user_metadata, undefined);
  assert.deepEqual(created[0].app_metadata.firm_review, { email: 'carol@example.test', name: 'Carol', active: true, firm_id: firm, campaign_id: campaign });
  assert.equal(created[0].app_metadata.access_granted_by, 'owner-id');
  existing = { email: 'carol@example.test', app_metadata: created[0].app_metadata }; assert.equal((await route.POST(req())).status, 200); assert.equal(created.length, 1, 'retries must not reset an existing identity');
  existing = { ...existing, app_metadata: { ...existing.app_metadata, firm_review: { ...existing.app_metadata.firm_review, campaign_id: 'other' } } };
  assert.equal((await route.POST(req())).status, 409); assert.equal(created.length, 1);
  existing = null; failure = true; assert.equal((await route.POST(req())).status, 503);
  console.log('Firm reviewer provisioning: owner only, CSRF, scope derivation, existing-identity conflict, idempotency, metadata audit and failure checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
