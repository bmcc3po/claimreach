import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { FakeDb } from './test-fake-db';
import { DEFAULT_STATUSES } from './statuses';
import * as statusModel from './statuses';
import * as acquisition from './lawruler-mva-status';
import * as signedReview from './mva-call/review-queue';
import * as deskQueue from './mva-call/desk-queue';
import * as deskLinks from './mva-call/links';
import * as followup from './mva-call/outreach-followup';
import * as mailZone from './mail-time-zone';

const now = new Date().toISOString();
const lead = (id: string, statuses: string[], kind = 'mva') => ({
  id, firm_id: 'firm', campaign_id: 'campaign', case_type: kind, campaign: 'INNO MVA', archived_at: null, wip_pending: false, assigned_agent: 'operator',
  claimant_name: `Synthetic ${id}`, lead_no: `TEST-${id}`, phone: '2025550100', stage: 'referral_received', created_at: now, updated_at: now,
  signed_at: statuses.some(status => status.startsWith('signed_')) ? now : null,
  claims: statuses.map((status, i) => ({ id: `${id}-claim${i}`, lead_id: id, firm_id: 'firm', campaign_id: 'campaign', campaign: 'INNO MVA', claim_type: kind, status, created_at: now })),
});
function fixture(leads: any[]) {
  const db = new FakeDb({ leads, claims: leads.flatMap(l => l.claims.map((c: any) => ({ ...c, leads: l, 'leads.campaign_id': l.campaign_id, 'leads.archived_at': l.archived_at }))), statuses: DEFAULT_STATUSES, campaigns: [{ id: 'campaign', name: 'INNO MVA', firm_id: 'firm', firms: { slug: 'tmp' }, case_type: 'mva', active: true }],
    firms: [{ id: 'firm', slug: 'tmp', name: 'Synthetic firm' }], app_users: [{ id: 'operator', role: 'agent', firm_id: 'firm', active: true, full_name: 'Synthetic operator' }], intake_calls: [], lead_activity: [], communications: [], esign_submissions: [], esign_templates: [] });
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
    '@/lib/mva-call/links': deskLinks, '@/lib/questionnaire': { STAGE_LABELS: { referral_received: 'Referral received' } },
    '@/lib/lawruler-mva-status': acquisition, '@/lib/mva-call/review-queue': signedReview, '@/lib/mva-call/desk-queue': deskQueue, '@/components/calls/CallsHome': { __esModule: true, default: 'calls-home' },
    '@/lib/statuses': statusModel, '@/lib/netfly-server': { netflyContext: async () => null },
    '@/lib/mva-call/outreach-followup': followup, '@/lib/mail-time-zone': mailZone,
    '@/components/ui/StatusBadge': { __esModule: true, default: (props: any) => jsx.jsx('span', { children: props.status }) },
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
  await test('actual QA queue omits DQ with stale qa_pending but preserves a genuine QA sibling', async () => {
    const dq = lead('dq-stale-flag', ['external_dq_review']), closed = lead('closed-stale-flag', ['dq']), mixed = lead('mixed-review', ['external_dq_review', 'signed_qa']);
    for (const file of [dq, closed, mixed]) Object.assign(file, { qa_pending: true });
    const db = fixture([dq, closed, mixed]); db.tables.app_users[0].role = 'owner';
    db.tables.statuses = DEFAULT_STATUSES.map(s => s.key === 'external_dq_review' ? { ...s, phase: 'in_qa', qualify: 'undetermined', track: 'intake' } : s);
    const html = renderToStaticMarkup(await page('(internal)/qa', db)());
    assert.doesNotMatch(html, /TEST-dq-stale-flag/);
    assert.doesNotMatch(html, /TEST-closed-stale-flag/);
    assert.match(html, /TEST-mixed-review/);
    assert.match(html, /signed_qa/);
    assert.doesNotMatch(html, /external_dq_review/);
  });
  await test('actual App page keeps signed work separate and excludes DQ from every active queue', async () => {
    const signed = lead('signed', ['signed_grievous']), dq = lead('dq', ['dq']), open = lead('open', ['new']), db = fixture([signed, dq, open]);
    for (const file of [signed, dq, open]) callback(db, file, file.claims[0]);
    const data = findHome(await page('(calls)/app', db)());
    assert.deepEqual(data.queues.callbacks.map((r: any) => r.id), ['open']); assert.equal(data.queues.due.length, 0);
    assert.deepEqual(data.queues.signed.map((r: any) => r.id), ['signed']); assert.equal(Object.values(data.queues).flat().length, 2);
  });
  await test('actual App page retains exact eligible sibling callback despite later closed sibling call', async () => {
    const file = lead('siblings', ['dq', 'contacting']), db = fixture([file]);
    callback(db, file, file.claims[1], new Date(Date.now() - 1000).toISOString()); callback(db, file, file.claims[0]);
    const data = findHome(await page('(calls)/app', db)());
    assert.equal(data.queues.callbacks.length, 1); assert.equal(data.queues.callbacks[0].href, '/app/siblings?claim=siblings-claim1'); assert.equal(data.queues.due.length, 0);
  });
  await test('actual App page exposes pending hold reason while omitting held and ambiguous callback work', async () => {
    const held = lead('held', ['new']), ambiguous = lead('ambiguous', ['new', 'new']), db = fixture([held, ambiguous]);
    hold(db, held, held.claims[0]); callback(db, held, held.claims[0]); callback(db, ambiguous, null);
    const tree = await page('(calls)/app', db)(), data = findHome(tree), html = renderToStaticMarkup(tree);
    assert.equal(data.queues.callbacks.length, 0); assert.ok(Object.values(data.queues).flat().every((r: any) => r.id !== 'held'));
    assert.match(html, /LawRuler status needs review/); assert.match(html, /standardized DQ reason/); assert.match(html, /\/app\/held\?claim=held-claim0/);
  });
  await test('actual App page pauses acquisition lists on failed hold lookup or current call read', async () => {
    const file = lead('open', ['new']);
    for (const table of ['lead_activity', 'statuses', 'intake_calls', 'esign_submissions']) {
      const db = fixture([file]); callback(db, file, file.claims[0]); db.failOn = op => op.table === table ? 'offline' : null;
      const data = findHome(await page('(calls)/app', db)()); assert.equal(data.queues.due.length, 0); assert.equal(data.queues.wait.length, 0); assert.equal(data.queues.callbacks.length, 0); assert.ok(data.notes.length > 0);
    }
  });
  await test('actual App page keeps an old reviewed client signature through office completion', async () => {
    const file = lead('old-signature', ['esign_sent']), db = fixture([file]);
    db.tables.esign_submissions.push({ id: 'signed-agreement', lead_id: file.id, claim_id: file.claims[0].id, firm_id: 'firm', campaign_id: 'campaign', status: 'signed',
      created_at: '2026-01-01T10:00:00Z', sent_at: '2026-01-01T10:00:00Z', signed_at: '2026-01-01T11:00:00Z', agent_reviewed_at: '2026-01-01T12:00:00Z', template_key: 'NV_FLAT' });
    const data = findHome(await page('(calls)/app', db)());
    assert.equal(data.queues.sent.length, 0); assert.equal(data.queues.signed.length, 1);
    assert.equal(data.queues.signed[0].tag, 'Office step pending');
    assert.equal(data.queues.signed[0].href, '/app/old-signature?claim=old-signature-claim0&review=signed-agreement');
  });
  await test('actual agent Dial Queue removes closed MVA, holds, and non-MVA siblings', async () => {
    const signed = lead('signed', ['signed_grievous']), mixed = lead('mixed', ['dq', 'new']), held = lead('held', ['new']), motel = lead('motel', ['retained'], 'motel_trafficking');
    const db = fixture([signed, mixed, held, motel]); hold(db, held, held.claims[0]);
    const html = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'dial' }) }));
    assert.doesNotMatch(html, /TEST-signed/); assert.doesNotMatch(html, /TEST-held/); assert.match(html, /TEST-mixed/); assert.match(html, /\/app\/mixed\?claim=mixed-claim1/); assert.doesNotMatch(html, /TEST-motel/); assert.match(html, /LawRuler status needs review/);
  });
  await test('actual agent work queue excludes non-MVA sibling while owner retains it', async () => {
    const mixed = lead('mixed-sibling', ['new', 'retained']); mixed.claims[1].claim_type = 'motel_trafficking';
    const motel = lead('motel', ['retained'], 'motel_trafficking');
    mixed.wip_pending = true; motel.wip_pending = true;
    const db = fixture([mixed, motel]);
    for (const view of ['dial', 'mine']) {
      const pilotHtml = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view }) }));
      assert.match(pilotHtml, /\/app\/mixed-sibling\?claim=mixed-sibling-claim0/);
      assert.doesNotMatch(pilotHtml, /mixed-sibling-claim1/);
      assert.doesNotMatch(pilotHtml, /TEST-motel/);
    }
    db.tables.app_users[0].role = 'owner';
    const ownerHtml = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'dial' }) }));
    assert.match(ownerHtml, /TEST-motel/);
  });
  await test('Pending my fix uses signed QA-returned claim status, not stale lead flags or sibling state', async () => {
    const unsigned = lead('unsigned-wip', ['wip']), stale = lead('stale-flag', ['new']), mixed = lead('mixed-fix', ['new', 'signed_wip']);
    const outside = lead('outside-fix', ['new', 'signed_wip']), archived = lead('archived-fix', ['signed_wip']);
    unsigned.wip_pending = true; stale.wip_pending = true;
    mixed.wip_pending = false; outside.wip_pending = true;
    outside.claims[1].campaign_id = 'other'; outside.claims[1].claim_type = 'motel_trafficking';
    archived.archived_at = now as any;
    const db = fixture([unsigned, stale, mixed, outside, archived]);
    const html = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'fix' }) }));
    assert.match(html, /TEST-mixed-fix/); assert.match(html, /\/app\/mixed-fix\?claim=mixed-fix-claim1&amp;review=1/);
    assert.match(html, /Signed: WIP/); assert.match(html, /Pending my fix<span>1<\/span>/);
    assert.doesNotMatch(html, /TEST-unsigned-wip|TEST-stale-flag|TEST-outside-fix|TEST-archived-fix|mixed-fix-claim0/);
  });
  await test('actual My Work keeps assigned signed records visible and both queue modes exclude archives', async () => {
    const signed = lead('signed', ['signed_grievous']), archived = lead('archived', ['new']); archived.archived_at = now as any;
    const db = fixture([signed, archived]);
    const html = renderToStaticMarkup(await page('(internal)/queue', db)({ searchParams: Promise.resolve({ view: 'mine' }) }));
    assert.match(html, /TEST-signed/); assert.doesNotMatch(html, /TEST-archived/);
    assert.match(html, /Signed: Finish intake/); assert.doesNotMatch(html, /Referral received/);
    assert.match(html, /\/app\/signed\?claim=signed-claim0&amp;review=1/);
  });
  console.log(`${count} actual acquisition queue page tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

