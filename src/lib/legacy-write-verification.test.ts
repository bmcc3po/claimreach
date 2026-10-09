import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { FakeDb } from './test-fake-db';
import * as matter from './matter';
const compile = (file: string, mods: Record<string, any>) => {
  const out: any = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), { compilerOptions: { target: 9, module: 1 } }).outputText;
  new Function('require', 'exports', code)((id: string) => { assert.ok(id in mods, id); return mods[id]; }, out);
  return out;
};
function fixture() {
  const db = new FakeDb({ app_users: [{ id: 'user', role: 'owner', firm_id: null, full_name: 'Synthetic Owner' }],
    leads: [{ id: 'lead', firm_id: 'firm', archived_at: null }],
    claims: [{ id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'campaign', answers: {} }], notifications: [], notes: [] });
  const h = { db, authenticated: true, audits: [] as any[] };
  const session = Object.assign(db, { auth: { getUser: async () => ({ data: { user: h.authenticated ? { id: 'user' } : null } }) } });
  const sb = { supabaseServer: async () => session, supabaseAdmin: () => db };
  const resolver = compile('mva-call/signing-matter.ts', { '@/lib/matter': matter, '@/lib/linked-files': {}, './server': { LEAD_CALL_COLS: '*' }, '@/lib/supabase-server': sb, './passenger-signing': {} });
  const mods = { 'next/server': require('next/server'), '@/lib/supabase-server': sb, '@/lib/audit': { recordAudit: async (entry: any) => h.audits.push(entry) }, '@/lib/mva-call/signing-matter': resolver };
  const tier = compile('../app/api/tier/route.ts', mods), info = compile('../app/api/request-info/route.ts', mods);
  const req = (payload: any) => new NextRequest('https://claimreach.test/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return { ...h, tier, info, req, auth: (value: boolean) => { h.authenticated = value; } };
}
async function main() {
  const tierBody = { claim_id: 'claim', tier_number: 2, tier: '2' };
  const infoBody = { lead_id: 'lead', claim_id: 'claim', body: 'Synthetic request' };
  for (const kind of ['tier', 'info'] as const) {
    for (const failure of ['signed-out', 'no-user', 'hidden-lead', 'hidden-claim', 'archived', 'foreign-firm', 'different-lead'] as const) {
      const h = fixture();
      if (failure === 'signed-out') h.auth(false);
      if (failure === 'no-user') h.db.tables.app_users = [];
      if (failure === 'hidden-lead') h.db.tables.leads = [];
      if (failure === 'hidden-claim') h.db.tables.claims = [];
      if (failure === 'archived') h.db.tables.leads[0].archived_at = '2026-10-01';
      if (failure === 'foreign-firm') h.db.tables.claims[0].firm_id = 'other';
      if (failure === 'different-lead') h.db.tables.claims[0].lead_id = 'other';
      const r = await h[kind].POST(h.req(kind === 'tier' ? tierBody : infoBody));
      assert.ok(r.status >= 400, `${kind}/${failure}`); assert.equal(h.db.ops.filter(op => op.kind !== 'select').length, 0); assert.equal(h.audits.length, 0);
    }
  }
  for (const failure of ['error', 'zero'] as const) {
    const h = fixture(); h.db.failOn = op => { if (op.table !== 'claims' || op.kind !== 'update') return null; if (failure === 'error') return 'failed'; h.db.tables.claims = []; return null; };
    const r = await h.tier.POST(h.req(tierBody)); assert.equal(r.status, failure === 'error' ? 500 : 409); assert.equal(h.audits.length, 0);
  }
  const t = fixture(); assert.equal((await t.tier.POST(t.req(tierBody))).status, 200); assert.equal(t.db.tables.claims[0].tier_number, 2); assert.equal(t.audits[0].firm_id, 'firm');
  const update = t.db.ops.find(op => op.kind === 'update')!; assert.ok(update.filters.some(f => f[1] === 'firm_id' && f[2] === 'firm'));
  for (const failure of ['notifications', 'notes'] as const) {
    const h = fixture(); h.db.failOn = op => op.table === failure && op.kind === 'insert' ? 'failed' : null;
    const r = await h.info.POST(h.req(infoBody)); assert.equal(r.status, failure === 'notifications' ? 500 : 503);
    assert.equal(h.db.tables.notes.length, 0); assert.equal(h.db.tables.notifications.length, failure === 'notes' ? 1 : 0);
    if (failure === 'notes') { assert.match((await r.json()).error, /Check history before retrying/); assert.match(h.audits[0].description, /failed to save/); }
  }
  const i = fixture(); assert.equal((await i.info.POST(i.req(infoBody))).status, 200);
  assert.equal(i.db.tables.notifications[0].firm_id, 'firm'); assert.equal(i.db.tables.notes[0].claim_id, 'claim'); assert.equal(i.audits[0].firm_id, 'firm');
  assert.equal((await fixture().info.POST(i.req({ lead_id: 'lead', body: 12 }))).status, 400);
  console.log('Legacy writes: 14 inaccessible/archive/matter checks; failed and zero-row updates; verified tier; request partial failures and resolved firm scope passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
