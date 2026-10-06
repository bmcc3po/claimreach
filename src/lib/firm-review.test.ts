import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as access from './firm-review-access';
const firm = '11111111-1111-4111-8111-111111111111', campaign = '22222222-2222-4222-8222-222222222222', claimId = '33333333-3333-4333-8333-333333333333';
const user = { id: 'reviewer', email: 'reviewer@example.test', app_metadata: { account_type: 'firm_review', firm_review: { active: true, email: 'reviewer@example.test', firm_id: firm, campaign_id: campaign, name: 'Reviewer' } } };
const scope = access.firmReviewScope(user)!;
assert.ok(scope);
assert.equal(access.reviewerProfileAllowed(user, null), true);
const retiredUser = { ...user, app_metadata: { ...user.app_metadata, firm_review: { ...user.app_metadata.firm_review, retired_profile_id: user.id } } };
const retiredProfile = { id: user.id, role: 'firm', active: false };
assert.equal(access.reviewerProfileAllowed(retiredUser, retiredProfile), true);
assert.equal(access.reviewerProfileAllowed(user, retiredProfile), false, 'inactive alone is not a conversion grant');
for (const change of [{ active: true }, { active: null }, { role: 'owner' }, { role: 'agent' }, { id: 'someone-else' }]) assert.equal(access.reviewerProfileAllowed(retiredUser, { ...retiredProfile, ...change }), false);
assert.equal(access.firmReviewScope({ ...user, app_metadata: {}, user_metadata: user.app_metadata }), null, 'self-editable metadata grants nothing');
assert.equal(access.firmReviewScope({ ...user, email: 'someone-else@example.test' }), null);
assert.equal(access.firmReviewScope({ ...user, app_metadata: { ...user.app_metadata, firm_review: { ...user.app_metadata.firm_review, active: false } } }), null);
const lead = { id: 'lead', firm_id: firm, claimant_name: 'Fictional Client', archived_at: null };
const claim = { id: claimId, lead_id: lead.id, firm_id: firm, campaign_id: campaign, status: 'delivered' };
assert.equal(access.releasedToReviewer(scope, claim, lead), true);
for (const other of [{ ...claim, firm_id: 'other' }, { ...claim, campaign_id: 'netfly' }, { ...claim, status: 'signed' }, { ...claim, lead_id: 'other' }]) assert.equal(access.releasedToReviewer(scope, other, lead), false);
assert.equal(access.releasedToReviewer(scope, claim, { ...lead, archived_at: '2026-10-05' }), false);
assert.equal(access.releasedToReviewer(scope, claim, { ...lead, claimant_name: 'TEST Client' }), false);
assert.equal(access.reviewInput({ action: 'turned_down', explanation: '  ' }), null);
assert.equal(access.reviewInput({ action: 'delete' }), null);
assert.deepEqual(access.reviewInput({ action: 'turned_down', explanation: ' Needs an explanation. ' }), { action: 'turned_down', explanation: 'Needs an explanation.' });
for (const route of ['/api/leads', '/portal', '/m6', '/dashboard', '/api/firm-review/extra']) assert.equal(access.reviewerPathAllowed(route), false);
assert.deepEqual(access.reviewState([
  { created_at: 'later', meta: { action: 'received' } },
  { created_at: 'earlier', meta: { action: 'turned_down', explanation: 'Reason', reviewer_name: 'Carol' } },
]), { receivedAt: 'later', decision: 'turned_down', decisionAt: 'earlier', explanation: 'Reason', reviewer: 'Carol' }, 'acknowledgment must not erase a case decision');

const compile = (filename: string, modules: Record<string, any>) => {
  const source = fs.readFileSync(path.resolve(__dirname, filename), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result: any = {};
  new Function('require', 'exports', code)((id: string) => { assert.ok(id in modules, `Unexpected dependency ${id}`); return modules[id]; }, result);
  return result;
};
let authenticated = true, visible = true, writeError = false;
const writes: any[] = [], events: any[] = [];
const db = { from(table: string) {
  assert.equal(table, 'lead_activity', 'review actions cannot rewrite claims, signatures, delivery or financial status');
  return { insert(row: any) { writes.push(row); return { select() { return { single: async () => {
    if (writeError) return { error: { message: 'failure' } };
    const e = { ...row, id: 'event', created_at: '2026-10-05T00:00:00Z' }; events.unshift(e); return { data: e };
  } }; } }; } };
} };
const route = compile('../app/api/firm-review/route.ts', {
  'next/server': require('next/server'), '@/lib/firm-review-access': access,
  '@/lib/matter': require('./matter'), '@/lib/linked-files': require('./linked-files'),
  '@/lib/firm-review-server': { REVIEW_EVENT: 'firm_file_review', reviewerContext: async () => authenticated ? { db, user, scope } : null,
    reviewerFile: async (_db: any, _scope: any, id: string) => visible && id === claimId ? { claim, lead } : null,
    reviewEvents: async () => events, reviewerPdf: async () => new TextEncoder().encode('%PDF-synthetic') },
});
function request(body: any, origin = 'https://claimreach.test') { return new NextRequest('https://claimreach.test/api/firm-review', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
(async () => {
  assert.equal((await route.POST(request({ claim: claimId, action: 'received' }, 'https://hostile.test'))).status, 403); assert.equal(writes.length, 0);
  authenticated = false; assert.equal((await route.POST(request({ claim: claimId, action: 'received' }))).status, 403); assert.equal(writes.length, 0); authenticated = true;
  visible = false; assert.equal((await route.POST(request({ claim: claimId, action: 'accepted' }))).status, 404); assert.equal(writes.length, 0); visible = true;
  assert.equal((await route.POST(request({ claim: claimId, action: 'turned_down' }))).status, 400); assert.equal(writes.length, 0);
  for (const action of ['received', 'accepted', 'turned_down']) {
    const res = await route.POST(request({ claim: claimId, action, explanation: 'Fictional QA reason.' })); assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.equal(writes.at(-1).meta.reviewer_id, user.id); assert.equal(writes.at(-1).meta.claim_id, claimId);
    assert.equal(writes.at(-1).firm_id, firm); assert.equal(writes.at(-1).meta.campaign_id, campaign);
  }
  assert.equal(events.length, 3, 'history is retained');
  writeError = true; const failed = await route.POST(request({ claim: claimId, action: 'received' })); assert.equal(failed.status, 503); assert.equal((await failed.json()).ok, undefined);
  visible = false; assert.equal((await route.GET(new NextRequest(`https://claimreach.test/api/firm-review?claim=${claimId}&document=intake`))).status, 404);
  authenticated = false; assert.equal((await route.GET(new NextRequest(`https://claimreach.test/api/firm-review?claim=${claimId}&document=retainer`))).status, 403);
  console.log('Firm review: trusted identity, firm/campaign/release scope, archive/test exclusion, CSRF, required turn-down reason, audit retention and failure checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
