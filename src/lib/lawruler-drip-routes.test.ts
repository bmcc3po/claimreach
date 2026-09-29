import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import { DEFAULT_STATUSES } from './statuses';
import * as acquisition from './lawruler-mva-status';
import * as dispatch from './drip-dispatch';
import * as rules from './drip-rules';

function fixture() {
  const names = ['open', 'signed', 'dq', 'held', 'archived', 'ambiguous'];
  const leads = names.map(id => ({ id, firm_id: 'firm', case_type: 'mva', archived_at: id === 'archived' ? '2026-01-01' : null }));
  const claims = names.map(id => ({ id: `${id}-claim`, lead_id: id, firm_id: 'firm', claim_type: 'mva', campaign_id: 'inno', status: id === 'signed' ? 'signed_grievous' : id === 'dq' ? 'dq' : 'new' }));
  claims.push({ ...claims.find(c => c.lead_id === 'ambiguous')!, id: 'second-claim' });
  const due = names.map(id => ({ enrollment_id: `enrollment-${id}`, lead_id: id, firm_id: 'firm', campaign: null, channel: 'sms', phone: '2025550100', template: 'Synthetic follow-up', every_days: 3, name: 'Synthetic acquisition' }));
  const db = new FakeDb({ leads, claims, statuses: DEFAULT_STATUSES, drips_due: due, drip_rules: [], notes: [],
    drip_enrollments: due.map(d => ({ id: d.enrollment_id, active: true, next_due: '2026-01-01', last_sent: null })),
    lead_activity: [{ lead_id: 'held', firm_id: 'firm', created_at: '2026-09-29T00:00:00Z', meta: { source: 'lawruler', event: 'mva_status_reconciliation', claim_id: 'held-claim', campaign_id: 'inno', acquisition_hold: true, outcome: 'review_required', reason: 'Standard DQ reason required.' } }],
  });
  (db as any).auth = { getUser: async () => ({ data: { user: { id: 'operator' } } }) };
  return db;
}
function harness(db: FakeDb, cron: boolean, enabled = true, authorized = true) {
  const fetches: any[] = [];
  const mods: Record<string, any> = {
    'next/server': { NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/supabase-server': { supabaseServer: async () => db, supabaseAdmin: () => db },
    '@/lib/gate': { gateUser: async () => authorized ? { id: 'operator', role: 'manager', can: () => true } : null },
    '@/lib/drip-rules': rules, '@/lib/lawruler-mva-status': acquisition,
    '@/lib/drip-dispatch': { ...dispatch, dripDispatchEnabled: () => dispatch.dripDispatchEnabled(enabled ? { DRIP_DISPATCH_ENABLED: 'on' } : {}) },
  };
  const source = fs.readFileSync(path.resolve(__dirname, cron ? '../app/api/cron/drips/route.ts' : '../app/api/drip/route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {}; new Function('require', 'exports', 'process', 'fetch', code)((name: string) => { assert.ok(name in mods, `Unexpected module ${name}`); return mods[name]; }, exp,
    { env: { CRON_SECRET: 'offline-secret' } }, async (url: string, options: any) => { assert.equal(url, 'https://synthetic.invalid/api/justcall'); fetches.push(JSON.parse(options.body)); return { ok: true, status: 200 }; });
  return { ...exp, fetches };
}
const request = (secret = 'offline-secret') => new Request('https://synthetic.invalid/api/cron/drips', { headers: { 'x-cron-secret': secret } });
const processRequest = () => ({ url: 'https://synthetic.invalid/api/drip', json: async () => ({ op: 'process' }) });
let count = 0; const test = async (name: string, fn: () => any) => { await fn(); count++; console.log('ok', name); };
(async () => {
  await test('manual and cron hold unwired SMS as well as ineligible MVA without false notes or cadence advance', async () => {
    for (const cron of [false, true]) {
      const db = fixture(), h = harness(db, cron); const result = cron ? await h.GET(request()) : await h.POST(processRequest());
      assert.equal(result.status, 200); assert.equal(result.body.fired, 0); assert.equal(result.body.held.length, 6); assert.equal(h.fetches.length, 0);
      assert.equal(db.tables.notes.length, 0);
      for (const row of db.tables.drip_enrollments) assert.equal(row.last_sent, null);
    }
  });
  await test('dispatch rechecks canonical status at execution, not earlier due-list snapshot', async () => {
    const db = fixture(); db.tables.drips_due = [db.tables.drips_due[0]]; db.tables.claims[0].status = 'signed_grievous';
    const h = harness(db, true), result = await h.GET(request());
    assert.equal(result.body.fired, 0); assert.equal(result.body.held.length, 1); assert.equal(h.fetches.length, 0); assert.equal(db.tables.notes.length, 0);
  });
  await test('dispatch fail-closes on unreadable MVA holds or statuses', async () => {
    for (const table of ['lead_activity', 'statuses']) {
      const db = fixture(); db.tables.drips_due = [db.tables.drips_due[0]]; db.failOn = op => op.table === table ? 'offline' : null;
      const h = harness(db, true), result = await h.GET(request());
      assert.equal(result.body.fired, 0); assert.equal(result.body.held.length, 1); assert.equal(h.fetches.length, 0); assert.equal(db.tables.notes.length, 0);
    }
  });
  await test('existing kill switch prevents eligibility reads, sends, notes and schedule advancement', async () => {
    for (const cron of [false, true]) {
      const db = fixture(), h = harness(db, cron, false); const result = cron ? await h.GET(request()) : await h.POST(processRequest());
      assert.equal(result.status, cron ? 200 : 409); assert.equal(result.body.sending, 'off'); assert.equal(h.fetches.length, 0); assert.equal(db.ops.length, 0);
    }
  });
  await test('cron secret and manual active-account gate remain before any privileged work', async () => {
    const db = fixture(), cron = harness(db, true), manual = harness(db, false, true, false);
    assert.equal((await cron.GET(request('wrong'))).status, 403); assert.equal((await manual.POST(processRequest())).status, 401); assert.equal(db.ops.length, 0);
  });
  await test('exact eligible MVA sibling is held for unwired SMS while note-only reminders still work', async () => {
    const db = fixture(); db.tables.drips_due = [{ ...db.tables.drips_due.find(d => d.lead_id === 'ambiguous')!, claim_id: 'second-claim' }];
    db.tables.claims.find(c => c.id === 'ambiguous-claim')!.status = 'dq';
    const h = harness(db, true), result = await h.GET(request()); assert.equal(result.body.fired, 0); assert.equal(result.body.held.length, 1);
    const old = fixture(); old.tables.drips_due = [{ ...old.tables.drips_due[0], channel: 'call_reminder' }]; old.tables.leads[0].case_type = 'motel_trafficking'; old.tables.claims[0].claim_type = 'motel_trafficking'; old.tables.claims[0].status = 'retained';
    assert.equal((await harness(old, true).GET(request())).body.fired, 1);
  });
  await test('actual due-list GET hides held acquisition work and reports reasons without writes', async () => {
    const db = fixture(), h = harness(db, false), result = await h.GET(new Request('https://synthetic.invalid/api/drip'));
    assert.equal(result.status, 200); assert.deepEqual(result.body.due.map((d: any) => d.lead_id), ['open']); assert.equal(result.body.held.length, 5);
    assert.ok(db.ops.every(op => op.kind === 'select')); assert.equal(h.fetches.length, 0);
  });
  console.log(`${count} actual LawRuler acquisition drip route tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
