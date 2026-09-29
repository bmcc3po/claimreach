import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { FakeDb } from './test-fake-db';
import { DEFAULT_STATUSES } from './statuses';
import * as acquisition from './lawruler-mva-status';

const now = new Date().toISOString();
const lead = (id: string, statuses: string[], kind = 'mva') => ({
  id, firm_id: 'firm', campaign_id: 'campaign', case_type: kind, campaign: 'INNO MVA', archived_at: null, assigned_agent: 'operator',
  claimant_name: `Synthetic ${id}`, lead_no: `TEST-${id}`, phone: '2025550100', stage: 'referral_received', created_at: now, updated_at: now,
  claims: statuses.map((status, i) => ({ id: `${id}-claim${i}`, lead_id: id, firm_id: 'firm', campaign_id: 'campaign', campaign: 'INNO MVA', claim_type: kind, status, created_at: now })),
});
function fixture(leads: any[]) {
  const db = new FakeDb({ leads, claims: leads.flatMap(l => l.claims), statuses: DEFAULT_STATUSES, campaigns: [{ id: 'campaign', name: 'INNO MVA', firm_id: 'firm', case_type: 'mva', active: true }],
    firms: [{ id: 'firm', slug: 'firm', name: 'Synthetic firm' }], app_users: [{ id: 'operator', role: 'agent', full_name: 'Synthetic operator' }], intake_calls: [], lead_activity: [], communications: [], esign_submissions: [], esign_templates: [] });
  const from = db.from.bind(db);
  db.from = ((table: string) => { const query: any = from(table); query.not = (column: string, op: string, value: any) => { assert.equal(op, 'is'); assert.equal(value, null); return query.neq(column, value); }; return query; }) as any;
  return db;
}
function callback(db: FakeDb, file: any, claim: any, stamp = now) {
  db.tables.intake_calls.push({ id: `call-${db.tables.intake_calls.length}`, lead_id: file.id, claim_id: claim?.id || null, campaign_id: 'campaign', disposition: 'callback', callback_at: now, status: 'ended', ended_at: now, created_at: stamp, leads: file });
}
const hold = (db: FakeDb, file: any, claim: any) => db.tables.lead_activity.push({ firm_id: 'firm', lead_id: file.id, created_at: now, meta: { source: 'lawruler', event: 'mva_status_reconciliation', claim_id: claim.id, campaign_id: 'campaign', acquisition_hold: true, outcome: 'review_required', source_status: 'Disqualified', mapped_status: 'dq', reason: 'Select the standardized DQ reason.' } });
function page(file: string, db: FakeDb) {
  const source = fs.readFileSync(path.resolve(__dirname, '../app', file, 'page.tsx'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mods: Record<string, any> = {
    'react/jsx-runtime': jsx, 'next/navigation': { redirect: (where: string) => { throw new Error(`Unexpected redirect ${where}`); } },
    'next/link': { __esModule: true, default: (props: any) => jsx.jsx('a', props) },
    '@/lib/supabase-server': { supabaseServer: async () => db }, '@/lib/auth-user': { authUser: async () => ({ data: { user: { id: 'operator' } } }) },
    '@/lib/mva-call/esign': { packetsFor: () => null }, '@/lib/docuseal': { docusealConfigured: () => false }, '@/lib/mva-call/dispo': { DISPO_LABEL: { callback: 'Call back' } },
    '@/lib/mva-call/links': { APP_CASE_TYPES: ['mva'] }, '@/lib/questionnaire': { STAGE_LABELS: { referral_received: 'Referral received' } },
    '@/lib/lawruler-mva-status': acquisition, '@/components/calls/CallsHome': { __esModule: true, default: 'calls-home' },
  };
  const exp: any = {}; new Function('require', 'exports', js)((name: string) => { assert.ok(name in mods, `Unexpected import ${name}`); return mods[name]; }, exp);
  return exp.default;
}
function findHome(node: any): any {
  if (!node) return null;
  if (node.type === 'calls-home') return node.props.data;
  for (const child of [node.props?.children].flat(Infinity)) { const hit = findHome(child); if (hit) return hit; }
  return null;
}
let count = 0; const test = async (name: string, fn: () => any) => { await fn(); count++; console.log('ok', name); };
(async () => {
  await test('actual App page excludes signed/DQ callbacks but leaves completion history', async () => {
    const signed = lead('signed', ['signed_grievous']), dq = lead('dq', ['dq']), open = lead('open', ['new']), db = fixture([signed, dq, open]);
    for (const file of [signed, dq, open]) callback(db, file, file.claims[0]);
    const data = findHome(await page('(calls)/app', db)());
    assert.deepEqual(data.callbacks.map((r: any) => r.id), ['open']); assert.deepEqual(data.open.map((r: any) => r.id), ['open']); assert.equal(data.done.length, 3);
  });
  await test('actual App page retains exact eligible sibling callback despite later closed sibling call', async () => {
    const file = lead('siblings', ['dq', 'contacting']), db = fixture([file]);
    callback(db, file, file.claims[1], new Date(Date.now() - 1000).toISOString()); callback(db, file, file.claims[0]);
    const data = findHome(await page('(calls)/app', db)());
    assert.equal(data.callbacks.length, 1); assert.equal(data.callbacks[0].href, '/app/siblings?claim=siblings-claim1'); assert.equal(data.open[0].href, '/app/siblings?claim=siblings-claim1');
  });
  await test('actual App page exposes pending hold reason while omitting held and ambiguous callback work', async () => {
    const held = lead('held', ['new']), ambiguous = lead('ambiguous', ['new', 'new']), db = fixture([held, ambiguous]);
    hold(db, held, held.claims[0]); callback(db, held, held.claims[0]); callback(db, ambiguous, null);
    const tree = await page('(calls)/app', db)(), data = findHome(tree), html = renderToStaticMarkup(tree);
    assert.equal(data.callbacks.length, 0); assert.ok(data.open.every((r: any) => r.id !== 'held'));
    assert.match(html, /LawRuler status needs review/); assert.match(html, /standardized DQ reason/); assert.match(html, /\/leads\/held\?claim=held-claim0/);
  });
  await test('actual App page pauses acquisition lists on failed hold lookup or current call read', async () => {
    const file = lead('open', ['new']);
    for (const table of ['lead_activity', 'statuses']) {
      const db = fixture([file]); callback(db, file, file.claims[0]); db.failOn = op => op.table === table ? 'offline' : null;
      const data = findHome(await page('(calls)/app', db)()); assert.equal(data.open.length, 0); assert.equal(data.callbacks.length, 0); assert.ok(data.notes.length > 0);
    }
  });
  await test('actual Dial Queue removes closed MVA and holds, retains eligible sibling and Motel retention', async () => {
    const signed = lead('signed', ['signed_grievous']), mixed = lead('mixed', ['dq', 'new']), held = lead('held', ['new']), motel = lead('motel', ['retained'], 'motel_trafficking');
    const db = fixture([signed, mixed, held, motel]); hold(db, held, held.claims[0]);
    const html = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'dial' }) }));
    assert.doesNotMatch(html, /TEST-signed/); assert.doesNotMatch(html, /TEST-held/); assert.match(html, /TEST-mixed/); assert.match(html, /\/leads\/mixed\?claim=mixed-claim1/); assert.match(html, /TEST-motel/); assert.match(html, /LawRuler status needs review/);
  });
  await test('actual My Work keeps assigned signed records visible and both queue modes exclude archives', async () => {
    const signed = lead('signed', ['signed_grievous']), archived = lead('archived', ['new']); archived.archived_at = now as any;
    const db = fixture([signed, archived]);
    const html = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'mine' }) }));
    assert.match(html, /TEST-signed/); assert.doesNotMatch(html, /TEST-archived/);
  });
  console.log(`${count} actual acquisition queue page tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
