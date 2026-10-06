import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as access from './firm-review-access';
const campaign = '22222222-2222-4222-8222-222222222222', firm = '11111111-1111-4111-8111-111111111111';
let role = 'agent', conflict = false, existing: any = null, failure = false;
let conversionProfile: any = null, auditFailure = false, retireFailure = false, updateFailure = false;
const sequence: string[] = [];
const created: any[] = [];
const db: any = { from(table: string) {
  if (table === 'audit_log') return { insert: async () => { sequence.push('audit'); return { error: auditFailure ? {} : null }; } };
  const q: any = { select: () => q, eq: () => q, ilike: () => q, order: () => q,
    limit: async () => ({ data: conflict ? [{ id: 'existing' }] : table === 'app_users' && conversionProfile ? [conversionProfile] : [] }),
    update: (value: any) => { assert.deepEqual(value, { active: false }); sequence.push('retire'); q.maybeSingle = async () => retireFailure ? { error: {} } : { data: { id: existing.id } }; return q; },
    maybeSingle: async () => ({ data: { id: campaign, name: 'Fictional Campaign', firm_id: firm } }) };
  assert.ok(['campaigns', 'app_users', 'firm_access'].includes(table)); return q;
}, auth: { admin: {
  listUsers: async () => ({ data: { users: existing ? [existing] : [] } }),
  createUser: async (data: any) => { created.push(data); return failure ? { error: {} } : { data: { user: { id: 'new' } } }; },
  updateUserById: async (id: string, data: any) => { sequence.push('restrict'); assert.equal(id, existing.id); assert.equal(data.password, undefined); assert.deepEqual(Object.keys(data), ['app_metadata']);
    if (updateFailure) return { error: {} }; existing = { ...existing, app_metadata: data.app_metadata }; conversionProfile.active = false; return { data: { user: existing } }; },
} } };
const modules: any = { 'next/server': require('next/server'), '@/lib/supabase-server': { supabaseServer: async () => ({}), supabaseAdmin: () => db },
  '@/lib/gate': { gateUser: async () => ({ id: 'owner-id', role }) }, '@/lib/firm-review-access': access };
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/api/firm-review-admin/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const route: any = {}; new Function('require', 'exports', code)((key: string) => { assert.ok(key in modules); return modules[key]; }, route);
function req(origin = 'https://claimreach.test', restrict_existing = false) { return new NextRequest('https://claimreach.test/api/firm-review-admin', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'Carol@example.test', name: 'Carol', campaign, restrict_existing }) }); }
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
  failure = false;
  existing = { id: 'firm-user', email: 'carol@example.test', app_metadata: { preserved: true } };
  conversionProfile = { id: 'firm-user', role: 'firm', active: true, firm_id: 'old-firm', perm_overrides: {} };
  assert.equal((await route.POST(req())).status, 409, 'conversion requires explicit owner instruction'); assert.equal(sequence.length, 0);
  for (const forbidden of ['agent', 'admin', 'owner']) { conversionProfile.role = forbidden; assert.equal((await route.POST(req(undefined, true))).status, 409); }
  conversionProfile.role = 'firm';
  auditFailure = true; assert.equal((await route.POST(req(undefined, true))).status, 503); assert.deepEqual(sequence.splice(0), ['audit']); auditFailure = false;
  retireFailure = true; assert.equal((await route.POST(req(undefined, true))).status, 503); assert.deepEqual(sequence.splice(0), ['audit', 'retire']); retireFailure = false;
  updateFailure = true; assert.equal((await route.POST(req(undefined, true))).status, 503); assert.deepEqual(sequence.splice(0), ['audit', 'retire', 'restrict']); updateFailure = false;
  assert.equal((await route.POST(req(undefined, true))).status, 200); assert.deepEqual(sequence.splice(0), ['audit', 'retire', 'restrict']);
  assert.equal(existing.app_metadata.preserved, true); assert.equal(existing.app_metadata.firm_review.retired_profile_id, 'firm-user'); assert.equal(existing.app_metadata.firm_review.firm_id, firm);
  assert.equal((await route.POST(req(undefined, true))).status, 200); assert.deepEqual(sequence, [], 'same-scope retry is read only');
  conversionProfile.active = true; assert.equal((await route.POST(req(undefined, true))).status, 409, 'reactivated broad access must fail closed');
  conversionProfile.active = false; existing.app_metadata.firm_review.campaign_id = 'different'; assert.equal((await route.POST(req(undefined, true))).status, 409, 'cannot overwrite an existing restricted scope');
  console.log('Firm reviewer provisioning: owner only, CSRF, scope derivation, existing-identity conflict, idempotency, metadata audit and failure checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
