import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { FakeDb, type Op } from './test-fake-db';
import { DEFAULT_STATUSES, manualIntakeStatusAllowed, isSignedKey } from './statuses';
import * as transitionGuard from './intake-status-guard';

const NOW = '2026-09-29T18:00:00.000Z';
class ClockDate extends Date { constructor(value?: any) { super(value === undefined ? NOW : value); } static now() { return Date.parse(NOW); } }
class Db extends FakeDb {
  responseFault: (op: Op, result: any) => any = (_op, result) => result;
  from(table: string) {
    const q = super.from(table), then = q.then.bind(q);
    q.then = (resolve, reject) => then(result => {
      if (result.error?.message === 'duplicate run primary key') result.error.code = '23505';
      return resolve(this.responseFault((q as any).op, result));
    }, reject);
    return q;
  }
}
const compile = (file: string) => ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const engineCode = compile('automation-engine.ts'), executorCode = compile('automation-exec.ts');
function load(db: Db) {
  const effects: any[] = [], engine: any = {}, executor: any = {};
  const mods: Record<string, any> = {
    '@/lib/supabase-server': { supabaseAdmin: () => db },
    '@/lib/automation-engine': engine,
    '@/lib/claim-status': { setClaimStatusForLeads: async (arg: any) => { effects.push({ kind: 'status', ...arg }); return { ok: true }; } },
    '@/lib/firm-delivery': { deliverLeadToFirm: async (arg: any) => { effects.push({ kind: 'delivery', ...arg }); return { ok: true }; } },
    '@/lib/statuses': { manualIntakeStatusAllowed, isSignedKey },
    '@/lib/intake-status-guard': transitionGuard,
  };
  const requireStub = (name: string) => { assert.ok(name in mods, `Unexpected module: ${name}`); return mods[name]; };
  new Function('require', 'exports', 'Date', 'crypto', engineCode)(requireStub, engine, ClockDate, webcrypto);
  new Function('require', 'exports', 'Date', executorCode)(requireStub, executor, ClockDate);
  return { engine, executor, effects };
}
function fixture(type = 'create_task', stops: string[] = []) {
  const q = { id: 'q', state: 'pending', run_at: '2026-09-28T10:00:00Z', run_id: 'run', automation_id: 'a', lead_id: 'lead', firm_id: 'firm', step_index: 0,
    payload: { claim_id: 'claim', campaign_id: 'campaign', start_status: 'contacting' } };
  return new Db({
    automations: [{ id: 'a', firm_id: 'firm', active: true, name: 'Synthetic', trigger_type: 'lead_created', trigger_config: {}, conditions: {},
      steps: [{ type, config: {} }], stop_conditions: stops, send_window: {}, retrigger: false }],
    automation_runs: [{ id: 'run', automation_id: 'a', lead_id: 'lead', firm_id: 'firm', state: 'active', current_step: 0, started_at: '2026-09-28T00:00:00Z' }],
    automation_queue: [{ ...q }], automation_queue_due: [{ ...q }], automation_events: [],
    leads: [{ id: 'lead', firm_id: 'firm', archived_at: null, mail_state: 'IL', client_time_zone: 'America/Chicago' }],
    claims: [{ id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'campaign', status: 'contacting', claim_type: 'mva' }],
    statuses: [...DEFAULT_STATUSES.map(s => ({ ...s })), { key: 'test', qualify: 'undetermined', phase: 'terminal' }, { key: 'custom_dq', qualify: 'disqualify', phase: 'terminal' }],
    communications: [], esign_submissions: [], signable_documents: [], notes: [], audit_log: [],
  });
}
let checks = 0;
async function test(name: string, fn: () => any) { await fn(); checks++; console.log(`ok ${checks} ${name}`); }
async function main() {
  const { engine } = load(fixture());
  const w = { mode: 'fixed', tz: 'America/Chicago', start: '08:00', end: '21:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] };
  await test('minute precision, exclusive close, weekends and DST', () => {
    const clamp = (iso: string) => engine.clampToWindow(new Date(iso), w).toISOString();
    assert.equal(clamp('2026-09-29T12:59:37Z'), '2026-09-29T13:00:00.000Z');
    assert.equal(clamp('2026-09-30T02:00:00Z'), '2026-09-30T13:00:00.000Z');
    assert.equal(clamp('2026-10-03T02:00:00Z'), '2026-10-05T13:00:00.000Z');
    assert.equal(clamp('2026-10-31T02:00:00Z'), '2026-11-02T14:00:00.000Z');
    assert.equal(clamp('2026-09-29T14:07:41Z'), '2026-09-29T14:07:41.000Z');
  });
  await test('invalid window, missing zone and ambiguous state never send as-is', () => {
    for (const bad of [{ ...w, start: 'oops' }, { ...w, end: '08:00' }, { ...w, days: [] }, { ...w, days: ['noday'] }, { ...w, tz: 'bad zone' }, { ...w, mode: 'anything' }, { start: '08:00' }])
      assert.throws(() => engine.clampToWindow(new Date(NOW), bad));
    assert.throws(() => engine.clampToWindow(new Date(NOW), { ...w, mode: 'lead_tz' }, 'TX'));
    assert.throws(() => engine.clampToWindow(new Date(NOW), { ...w, mode: 'lead_tz' }, null));
    assert.equal(engine.clampToWindow(new Date(NOW), { ...w, mode: 'lead_tz' }, 'TX', 'America/Chicago').toISOString(), NOW);
  });
  await test('overlapping drains execute a queue row once and stale reads cannot repeat it', async () => {
    const db = fixture(); const { executor } = load(db);
    const results = await Promise.all([executor.drainQueue('https://offline.invalid'), executor.drainQueue('https://offline.invalid')]);
    assert.equal(results.reduce((n, r) => n + r.ran, 0), 1); assert.equal(db.tables.notes.length, 1);
    assert.equal(db.tables.notes[0].claim_id, 'claim');
    await executor.drainQueue('https://offline.invalid'); assert.equal(db.tables.notes.length, 1);
  });
  await test('a late cron defers to next permitted window before action', async () => {
    const db = fixture(); db.tables.automations[0].send_window = { ...w, end: '12:00' };
    const { executor } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 0 });
    assert.equal(db.tables.notes.length, 0); assert.equal(db.tables.automation_queue[0].state, 'pending');
    assert.equal(db.tables.automation_queue[0].run_at, '2026-09-30T13:00:00.000Z');
  });
  for (const [name, change] of [
    ['foreign automation firm', (db: Db) => { db.tables.automations[0].firm_id = 'foreign'; }],
    ['lead moved to another firm', (db: Db) => { db.tables.leads[0].firm_id = 'foreign'; }],
    ['claim changed campaign', (db: Db) => { db.tables.claims[0].campaign_id = 'other'; }],
    ['unbound legacy multi-matter file', (db: Db) => { db.tables.automation_queue[0].payload = {}; db.tables.claims.push({ ...db.tables.claims[0], id: 'sibling' }); }],
    ['missing status definition', (db: Db) => { db.tables.statuses = []; }],
  ] as const) await test(`${name} holds before effects`, async () => {
    const db = fixture(); change(db); const { executor } = load(db);
    assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(db.tables.notes.length, 0);
    assert.equal(db.tables.automation_queue[0].state, 'failed');
  });
  for (const [name, change] of [
    ['archived', (db: Db) => { db.tables.leads[0].archived_at = NOW; }],
    ['test', (db: Db) => { db.tables.claims[0].status = 'test'; }],
    ['DQ', (db: Db) => { db.tables.claims[0].status = 'dq'; }],
    ['custom DQ', (db: Db) => { db.tables.claims[0].status = 'custom_dq'; }],
    ['signed status', (db: Db) => { db.tables.claims[0].status = 'signed_qa'; }],
    ['provider signature before status sync', (db: Db) => { db.tables.esign_submissions.push({ id: 's', lead_id: 'lead', claim_id: 'claim', signed_at: NOW }); }],
    ['client reply', (db: Db) => { db.tables.communications.push({ id: 'm', lead_id: 'lead', direction: 'inbound', occurred_at: NOW }); }],
  ] as const) await test(`${name} stops acquisition follow-up`, async () => {
    const db = fixture('place_call', ['on_reply', 'on_sign', 'on_dq']); change(db);
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 0, stopped: 1 });
    assert.equal(db.tables.notes.length, 0); assert.equal(db.tables.automation_queue[0].state, 'skipped');
  });
  await test('post-sign delivery remains exact-matter and cannot force duplicates', async () => {
    const db = fixture('send_to_firm'); db.tables.claims[0].status = 'signed_qa'; db.tables.automations[0].steps[0].config.force = true;
    const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 1, stopped: 0 });
    assert.equal(effects[0].claimId, 'claim'); assert.equal(effects[0].force, false);
  });
  await test('canonical custom signed status stops follow-up, while no-sign approval is not a signature', async () => {
    const db = fixture('place_call', ['on_sign']);
    db.tables.statuses.push({ key: 'custom_retained', requires_esign: true, phase: 'post_qa', qualify: 'qualify' });
    db.tables.claims[0].status = 'custom_retained';
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(db.tables.notes.length, 0);
    const noSignature = fixture('create_task', ['on_sign']); noSignature.tables.claims[0].status = 'approved';
    assert.deepEqual(await load(noSignature).executor.drainQueue('x'), { ran: 1, stopped: 0 });
  });
  await test('unrelated sibling changes do not drive status stops or writes', async () => {
    const db = fixture('change_status', ['on_status_change']); db.tables.claims.push({ ...db.tables.claims[0], id: 'sibling', status: 'signed_qa', updated_at: NOW });
    db.tables.automations[0].steps[0].config.status = 'new';
    const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 1, stopped: 0 });
    assert.deepEqual(effects[0].claimIds, ['claim']); assert.equal(effects[0].expectedStatus, 'contacting');
    assert.equal(effects[0].status, 'new'); assert.ok(effects[0].statuses.some((s: any) => s.key === 'new'));
  });
  for (const status of ['signed_qa', 'signed_grievous', 'signed_approved', 'delivered', 'retained', 'approved', 'qa', 'esign_sent', 'not_in_catalog'])
    await test(`generic status action cannot fabricate ${status}`, async () => {
      const db = fixture('change_status'); db.tables.automations[0].steps[0].config.status = status;
      const { executor, effects } = load(db);
      assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(effects.length, 0);
    });
  await test('inactive status or catalog query failure cannot reach the status writer', async () => {
    for (const fail of [false, true]) {
      const db = fixture('change_status'); db.tables.automations[0].steps[0].config.status = 'new';
      if (fail) db.failOn = op => op.table === 'statuses' && op.kind === 'select' && op.filters.length === 0 ? 'unavailable' : null;
      else db.tables.statuses.find(s => s.key === 'new')!.active = false;
      const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(effects.length, 0);
    }
  });
  await test('audit acknowledgement binds the queue, run and exact matter', async () => {
    const db = fixture(); assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 1, stopped: 0 });
    assert.equal(db.tables.audit_log.length, 1); const audit = db.tables.audit_log[0];
    assert.equal(audit.claim_id, 'claim'); assert.equal(audit.meta.run_id, 'run'); assert.equal(audit.meta.queue_id, 'q');
  });
  await test('audit error or lost acknowledgement holds an already completed effect without repeating it', async () => {
    for (const mode of ['error', 'lost_response', 'missing_id']) {
      const db = fixture(); db.tables.automations[0].steps.push({ type: 'create_task', config: {} });
      if (mode === 'error') db.failOn = op => op.table === 'audit_log' && op.kind === 'insert' ? 'unavailable' : null;
      else db.responseFault = (op, result) => op.table === 'audit_log' && op.kind === 'insert'
        ? { data: null, error: mode === 'lost_response' ? { message: 'lost response' } : null } : result;
      const { executor } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 });
      assert.equal(db.tables.notes.length, 1); assert.equal(db.tables.automation_queue.length, 1);
      assert.equal(db.tables.automation_queue[0].state, 'failed'); assert.match(db.tables.automation_queue[0].result.error, /may have completed.*audit/);
      await executor.drainQueue('x'); assert.equal(db.tables.notes.length, 1);
    }
  });
  for (const table of ['leads', 'claims', 'statuses', 'communications', 'esign_submissions', 'automations', 'automation_runs']) await test(`${table} read errors hold instead of implying no stop`, async () => {
    const db = fixture('place_call', ['on_reply', 'on_sign']);
    db.failOn = op => op.kind === 'select' && op.table === table ? 'unavailable' : null;
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(db.tables.notes.length, 0);
  });
  await test('due-query or atomic-claim failure is visible, not empty success', async () => {
    for (const claim of [false, true]) {
      const db = fixture(); db.failOn = op => claim ? op.table === 'automation_queue' && op.kind === 'update' && op.patch?.state === 'processing' ? 'unavailable' : null : op.table === 'automation_queue_due' ? 'unavailable' : null;
      await assert.rejects(load(db).executor.drainQueue('x')); assert.equal(db.tables.notes.length, 0);
    }
  });
  await test('uncertain result persistence never repeats a completed side effect', async () => {
    const db = fixture(); db.failOn = op => op.table === 'automation_queue' && op.kind === 'update' && op.patch?.state === 'done' ? 'lost response' : null;
    const { executor } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 });
    assert.equal(db.tables.notes.length, 1); await executor.drainQueue('x'); assert.equal(db.tables.notes.length, 1);
    assert.equal(db.tables.automation_queue[0].state, 'failed');
  });
  await test('processing work left by an interrupted worker never expires into a retry', async () => {
    const db = fixture(); db.tables.automation_queue[0].state = 'processing';
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 0, stopped: 0 }); assert.equal(db.tables.notes.length, 0);
  });
  await test('negative waits hold before the preceding effect', async () => {
    const db = fixture(); db.tables.automations[0].steps.push({ type: 'wait', config: { minutes: -1 } });
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 0, stopped: 1 }); assert.equal(db.tables.notes.length, 0);
  });
  await test('a branch evaluates its condition and preserves exact scope for continuation', async () => {
    const db = fixture('branch'); db.tables.automations[0].steps = [
      { type: 'branch', config: { if: { field: 'status', op: 'is', value: 'signed_qa' }, then_index: 1, else_index: 2 } },
      { type: 'create_task' }, { type: 'place_call' },
    ];
    assert.deepEqual(await load(db).executor.drainQueue('x'), { ran: 1, stopped: 0 });
    assert.equal(db.tables.automation_queue[1].step_index, 2); assert.equal(db.tables.automation_queue[1].payload.claim_id, 'claim');
  });
  const fresh = () => { const db = fixture(); db.tables.automation_queue = []; db.tables.automation_queue_due = []; db.tables.automation_runs = []; return db; };
  await test('first-step wait delays the initial queue and invalid first waits reserve nothing', async () => {
    const db = fresh(); db.tables.automations[0].steps = [{ type: 'wait', config: { minutes: 45 } }, { type: 'create_task' }];
    assert.deepEqual(await load(db).engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }), { started: 1 });
    assert.equal(db.tables.automation_queue[0].run_at, '2026-09-29T18:45:00.000Z');
    for (const value of [-5, '30', Infinity]) {
      const bad = fresh(); bad.tables.automations[0].steps = [{ type: 'wait', config: { minutes: value } }];
      await assert.rejects(load(bad).engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }));
      assert.equal(bad.tables.automation_runs.length, 0); assert.equal(bad.tables.automation_queue.length, 0);
    }
  });
  for (const prior of ['signed_qa', 'signed_wip', 'signed_approved', 'delivered', 'retained', 'qa', 'wip', 'approved', 'external_signed_review'])
    await test(`${prior} cannot be downgraded by a generic status action without on_sign`, async () => {
      for (const destination of ['new', 'contacting', 'dq']) {
        const db = fixture('change_status'); db.tables.claims[0].status = prior;
        db.tables.automations[0].steps[0].config = { status: destination, dq_reason_key: 'synthetic_reason' };
        const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 });
        assert.equal(effects.length, 0); assert.equal(db.tables.claims[0].status, prior);
      }
    });
  await test('signed provider or emergency evidence blocks downgrade even before status sync', async () => {
    for (const emergency of [false, true]) {
      const db = fixture('change_status'); db.tables.automations[0].steps[0].config.status = 'new';
      if (emergency) db.tables.signable_documents.push({ id: 'e', lead_id: 'lead', status: 'signed', signed_at: NOW, audit: { emergency: { claim_id: 'claim' } } });
      else db.tables.esign_submissions.push({ id: 's', lead_id: 'lead', claim_id: 'claim', status: 'signed', signed_at: NOW });
      const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 });
      assert.equal(effects.length, 0); assert.match(db.tables.automation_queue[0].result.error, /signed agreement evidence/);
    }
  });
  await test('uncertain or ambiguous signature evidence prevents generic downgrade', async () => {
    for (const evidence of ['esign_submissions', 'signable_documents', 'ambiguous']) {
      const db = fixture('change_status'); db.tables.automations[0].steps[0].config.status = 'new';
      if (evidence === 'ambiguous') {
        db.tables.claims.push({ ...db.tables.claims[0], id: 'sibling' });
        db.tables.esign_submissions.push({ id: 's', lead_id: 'lead', claim_id: null, status: 'signed' });
      } else db.failOn = op => op.table === evidence && op.kind === 'select' ? 'unavailable' : null;
      const { executor, effects } = load(db); assert.deepEqual(await executor.drainQueue('x'), { ran: 0, stopped: 1 });
      assert.equal(effects.length, 0);
    }
  });
  await test('foreign-firm automation cannot enroll a lead', async () => {
    const db = fresh(); db.tables.automations[0].firm_id = 'foreign';
    assert.deepEqual(await load(db).engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }), { started: 0 });
    assert.equal(db.tables.automation_runs.length, 0);
  });
  await test('a delayed status event cannot start a run for a status that has already changed', async () => {
    const db = fresh(); db.tables.automations[0].trigger_type = 'status_changed';
    assert.deepEqual(await load(db).engine.matchAndStart({ type: 'status_changed', lead_id: 'lead', toStatus: 'signed_qa' }), { started: 0 });
    assert.equal(db.tables.automation_runs.length, 0);
  });
  await test('concurrent once-only starts share a PK and only the successful insert queues', async () => {
    const db = fresh(); db.failOn = op => op.table === 'automation_runs' && op.kind === 'insert' && db.tables.automation_runs.some(r => r.id === op.patch?.id) ? 'duplicate run primary key' : null;
    const { engine } = load(db); const event = { type: 'lead_created', lead_id: 'lead' };
    const result = await Promise.all([engine.matchAndStart(event), engine.matchAndStart(event)]);
    assert.equal(result.reduce((n, r) => n + r.started, 0), 1);
    assert.equal(db.tables.automation_runs.length, 1); assert.equal(db.tables.automation_queue.length, 1);
    assert.equal(db.tables.automation_queue[0].state, 'pending'); assert.equal(db.tables.automation_queue[0].payload.claim_id, 'claim');
    assert.deepEqual(await engine.matchAndStart(event), { started: 0 });
    // The actual database invariant relied on by the code is the existing
    // PostgreSQL UUID primary key; exercise it as well as the query fake.
    const { PGlite } = require('@electric-sql/pglite'); const pg = new PGlite();
    try { await pg.exec('create table run_test(id uuid primary key)');
      await pg.query('insert into run_test values ($1)', [db.tables.automation_runs[0].id]);
      await assert.rejects(pg.query('insert into run_test values ($1)', [db.tables.automation_runs[0].id]), (e: any) => e.code === '23505');
    } finally { await pg.close(); }
  });
  await test('retrigger allows a later legitimate run, and historical IDs remain once-only', async () => {
    const db = fresh(); db.tables.automations[0].retrigger = true; const { engine } = load(db);
    for (let i = 0; i < 2; i++) assert.deepEqual(await engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }), { started: 1 });
    assert.notEqual(db.tables.automation_runs[0].id, db.tables.automation_runs[1].id);
    db.tables.automations[0].retrigger = false; assert.deepEqual(await engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }), { started: 0 });
  });
  for (const table of ['automations', 'claims', 'statuses', 'automation_runs']) await test(`start ${table} read failure creates no work`, async () => {
    const db = fresh(); db.failOn = op => op.table === table && op.kind === 'select' ? 'unavailable' : null;
    await assert.rejects(load(db).engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' })); assert.equal(db.tables.automation_queue.length, 0);
  });
  await test('committed enqueue with lost response remains held even when stopping also fails', async () => {
    const db = fresh(); db.responseFault = (op, result) => op.table === 'automation_queue' && op.kind === 'insert' ? { data: null, error: { message: 'lost response' } } : result;
    db.failOn = op => op.table === 'automation_runs' && op.kind === 'update' ? 'unavailable' : null;
    const { engine } = load(db); await assert.rejects(engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }));
    assert.equal(db.tables.automation_runs[0].state, 'preparing'); assert.equal(db.tables.automation_queue[0].state, 'held');
    assert.deepEqual(await engine.matchAndStart({ type: 'lead_created', lead_id: 'lead' }), { started: 0 }); assert.equal(db.tables.automation_queue.length, 1);
  });
  console.log(`${checks} automation safety checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
