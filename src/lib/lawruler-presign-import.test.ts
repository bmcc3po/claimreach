// Actual importer + mapper + merge helper. Synthetic database executes scope
// filters/CAS and scheduled races; no production DB, providers or network.
import assert from 'node:assert/strict';
import { FakeDb } from './test-fake-db';
import { importLawRulerPresign } from './lawruler-presign-import';
import { CallEngine } from './mva-call/engine';

globalThis.fetch = async () => { throw Error('Network forbidden'); };
const F = '10000000-0000-4000-8000-000000000001', L = '20000000-0000-4000-8000-000000000001';
const C = '30000000-0000-4000-8000-000000000001', P = '40000000-0000-4000-8000-000000000001';
const scope = { firmId: F, leadId: L, claimId: C, campaignId: P, vendorId: '987654321', caseType: 'mva' };
const NOW = '2026-09-28T12:00:00Z';
const opts = { now: NOW };
function world(mva: any = {}, extra: any = {}) {
  return new FakeDb({
    campaigns: [{ id: P, firm_id: F, name: 'INNO MVA', case_type: 'mva', active: true }],
    leads: [{ id: L, firm_id: F, lawruler_ref_no: scope.vendorId, external_id: null, archived_at: null, claimant_name: 'Synthetic Caller' }],
    claims: [{ id: C, firm_id: F, lead_id: L, campaign_id: P, claim_type: 'mva', status: 'contacting', updated_at: '2026-09-28T00:00:00Z', answers: { mva_call: mva, another_form: { safe: true }, ...extra } }],
  });
}
const saved = (db: FakeDb) => db.tables.claims[0].answers;
const writes = (db: FakeDb) => db.ops.filter(o => o.kind !== 'select');
let count = 0, failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); count++; console.log('ok', name); }
  catch (e) { failed++; console.error('FAIL', name, '\n', e); }
}
async function main() {
  await check('exact-matter import persists canonical fields, nested confirmation and provenance together', async () => {
    const db = world();
    const r = await importLawRulerPresign(db, scope, { Custom4121: 'Passenger', Custom4125: 'Austin', Custom4126: 'Texas', Custom4131: 'Chiropractor', Custom4140: 'No' }, opts);
    assert.equal(r.outcome, 'imported'); assert.equal(r.filled, 5);
    assert.deepEqual(saved(db).mva_call, { story: { city: 'Austin, TX', seat: 'Passenger' }, body: { seen: ['Chiropractor'], done: { seen: true }, check: 'No' } });
    assert.deepEqual(saved(db).another_form, { safe: true });
    assert.equal(saved(db).lawruler_presign.provenance['body.done.seen'].vendor_id, scope.vendorId);
    assert.equal(db.tables.claims[0].status, 'contacting');
    assert.ok(writes(db).every(o => o.table === 'claims'));
    const noop = () => {};
    const engine = new CallEngine({ callerName: 'Synthetic Caller', callerPhone: '', callerEmail: '', agentName: 'Synthetic Agent', firmSpoken: 'Synthetic Firm', textFrom: '', startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: false, status: 'ready', pax: {} }, saved: saved(db).mva_call }, { sendAgreement: noop, sendPax: noop, completeAgreement: noop, resendLink: noop, sendText: noop, saveDispo: noop, home: noop, ask: noop });
    for (const view of ['guided', 'full', 'chore', 'form']) { engine.setView(view); assert.equal(engine.state.body.done.seen, true); assert.equal(engine.state.story.city, 'Austin, TX'); engine.renderVals(); }
  });
  await check('populated answers and explicit empty/null/false/array leaves are preserved', async () => {
    const original = { story: { text: '', seat: null, fault: 'Other driver' }, body: { uim: false, seen: [], done: { seen: false } } };
    const db = world(original);
    const r = await importLawRulerPresign(db, scope, { Custom4141: 'Old narrative', Custom4121: 'Driver', Custom4127: 'Caller at fault (DQ)', Custom4137: 'Yes', Custom4131: 'Chiropractor' }, opts);
    assert.equal(r.filled, 0); assert.ok(r.review > 0); assert.equal(r.outcome, 'imported_with_review');
    assert.deepEqual(saved(db).mva_call, original);
  });
  await check('cleared/nonobject root stays intact and source is retained for review', async () => {
    for (const empty of [null, false, '', []]) {
      const db = world(empty), r = await importLawRulerPresign(db, scope, { Custom4137: 'Yes' }, opts);
      assert.equal(r.filled, 0); assert.deepEqual(saved(db).mva_call, empty); assert.ok(r.review > 0);
      assert.equal(saved(db).lawruler_presign.evidence.Custom4137.raw, 'Yes');
    }
  });
  await check('same source replay does not change answers or duplicate provenance', async () => {
    const db = world(), fields = { Custom4124: '09/14/2026', Custom4137: 'Yes' };
    const first = await importLawRulerPresign(db, scope, fields, opts), before = JSON.stringify(saved(db).mva_call);
    const second = await importLawRulerPresign(db, scope, fields, { now: '2026-09-28T13:00:00Z' });
    assert.equal(first.filled, 3); assert.equal(second.filled, 0); assert.equal(JSON.stringify(saved(db).mva_call), before);
    assert.equal(Object.keys(saved(db).lawruler_presign.provenance).length, 3);
    assert.equal(saved(db).lawruler_presign.provenance['story.date'].received_at, NOW);
    assert.equal(saved(db).lawruler_presign.evidence.Custom4124.received_at, '2026-09-28T13:00:00Z');
  });
  await check('historical recovery stages evidence without filling intake or changing workflow', async () => {
    const db = world(), r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver', Custom4143: 'Signed!' }, { ...opts, historical: true });
    assert.equal(r.outcome, 'review_required'); assert.equal(r.filled, 0); assert.deepEqual(saved(db).mva_call, {});
    assert.equal(saved(db).lawruler_presign.evidence.Custom4121.raw, 'Driver');
    assert.equal(db.tables.claims[0].status, 'contacting'); assert.ok(writes(db).every(o => o.table === 'claims'));
  });
  await check('archived lead stages evidence without adding structured answers', async () => {
    const db = world(); db.tables.leads[0].archived_at = NOW;
    const r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts);
    assert.equal(r.outcome, 'review_required'); assert.equal(r.filled, 0); assert.deepEqual(saved(db).mva_call, {});
  });
  await check('source identity, firm, lead, claim and exact active campaign are verified before writes', async () => {
    const mutations: ((db: FakeDb) => void)[] = [
      db => { db.tables.leads[0].lawruler_ref_no = '111'; },
      db => { db.tables.leads[0].firm_id = 'wrong'; },
      db => { db.tables.campaigns[0].firm_id = 'wrong'; },
      db => { db.tables.campaigns[0].name = 'Another MVA'; },
      db => { db.tables.campaigns[0].case_type = 'motel_trafficking'; },
      db => { db.tables.campaigns[0].active = false; },
      db => { db.tables.claims[0].lead_id = 'other'; },
      db => { db.tables.claims[0].firm_id = 'other'; },
      db => { db.tables.claims[0].campaign_id = 'other'; },
      db => { db.tables.claims[0].claim_type = 'motel_trafficking'; },
    ];
    for (const mutate of mutations) {
      const db = world(); mutate(db);
      await assert.rejects(importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts), /scope|exact|match/i);
      assert.equal(writes(db).length, 0);
    }
  });
  await check('a matching external source ID is accepted without changing lead identity', async () => {
    const db = world(); db.tables.leads[0].lawruler_ref_no = null; db.tables.leads[0].external_id = scope.vendorId;
    assert.equal((await importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts)).filled, 1);
    assert.equal(db.tables.leads[0].external_id, scope.vendorId);
  });
  await check('CAS collision recomputes against concurrent agent edits and preserves unrelated fresh metadata', async () => {
    const db = world(); let raced = false;
    db.failOn = op => {
      if (op.table === 'claims' && op.kind === 'update' && !raced) {
        raced = true;
        db.tables.claims[0].updated_at = '2026-09-28T00:00:01Z';
        db.tables.claims[0].answers = { ...saved(db), another_form: { safe: 'Fresh' }, mva_call: { story: { seat: 'Passenger', text: 'Agent typed this' } } };
      }
      return null;
    };
    const r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver', Custom4137: 'Yes' }, opts);
    assert.equal(r.filled, 1); assert.ok(r.review > 0);
    assert.deepEqual(saved(db).mva_call, { story: { seat: 'Passenger', text: 'Agent typed this' }, body: { uim: 'Yes' } });
    assert.deepEqual(saved(db).another_form, { safe: 'Fresh' });
    assert.equal(writes(db).length, 2);
  });
  await check('repeated CAS collisions exhaust safely rather than reporting success', async () => {
    const db = world(); let i = 0;
    db.failOn = op => { if (op.table === 'claims' && op.kind === 'update') db.tables.claims[0].updated_at = `2026-09-28T00:00:0${++i}Z`; return null; };
    await assert.rejects(importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts), /changed during PRESIGN/);
    assert.equal(i, 4); assert.deepEqual(saved(db).mva_call, {}); assert.equal(saved(db).lawruler_presign, undefined);
  });
  await check('partial payload retains prior evidence, provenance, decisions and unrelated warnings', async () => {
    const db = world();
    await importLawRulerPresign(db, scope, { Custom4121: 'Driver', Custom4120: 'No' }, opts);
    const old = JSON.parse(JSON.stringify(saved(db).lawruler_presign));
    await importLawRulerPresign(db, scope, { Custom4137: 'Yes' }, { now: '2026-09-28T13:00:00Z' });
    const next = saved(db).lawruler_presign;
    assert.deepEqual(next.evidence.Custom4121, old.evidence.Custom4121);
    assert.deepEqual(next.provenance['story.seat'], old.provenance['story.seat']);
    assert.ok(next.decisions.some((d: any) => d.id === 'seat'));
    assert.ok(next.decisions.some((d: any) => d.id === 'uim'));
    assert.deepEqual(next.warnings, old.warnings);
    assert.equal(next.evidence.Custom4137.raw, 'Yes');
  });
  await check('conflicting aliases retain both raw values for review and do not fill an answer', async () => {
    const db = world(), r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver', '<<Custom4121>>': 'Passenger' }, opts);
    assert.equal(r.filled, 0); assert.ok(r.review > 0);
    const evidence = JSON.stringify(saved(db).lawruler_presign.evidence);
    assert.ok(evidence.includes('Driver') && evidence.includes('Passenger'), 'Persist both conflicting originals, not only the last alias');
    assert.equal(saved(db).mva_call.story, undefined);
  });
  await check('legacy exact/unbound call stages import without hiding the existing call baseline', async () => {
    for (const claimId of [C, null]) {
      const db = world(); delete saved(db).mva_call;
      db.tables.intake_calls = [{ id: 'legacy', firm_id: F, lead_id: L, claim_id: claimId, answers: { story: { text: 'Existing call narrative' } } }];
      const r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts);
      assert.equal(r.outcome, 'review_required'); assert.equal(r.filled, 0);
      assert.ok(!Object.prototype.hasOwnProperty.call(saved(db), 'mva_call'));
      assert.equal(db.tables.intake_calls[0].answers.story.text, 'Existing call narrative');
      assert.ok(saved(db).lawruler_presign.warnings.some((w: any) => w.code === 'legacy_call_baseline'));
    }
  });
  await check('unrelated firm/lead/sibling call cannot block a new exact-matter import', async () => {
    const db = world(); delete saved(db).mva_call;
    db.tables.intake_calls = [
      { id: 'foreign', firm_id: 'other', lead_id: L, claim_id: C },
      { id: 'other-lead', firm_id: F, lead_id: 'other', claim_id: C },
      { id: 'sibling', firm_id: F, lead_id: L, claim_id: 'other' },
    ];
    const r = await importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts);
    assert.equal(r.filled, 1); assert.equal(saved(db).mva_call.story.seat, 'Driver');
  });
  await check('zero-fill and historical imports do not manufacture an empty canonical document', async () => {
    for (const [fields, options] of [[{ Custom4120: 'No' }, opts], [{ Custom4121: 'Driver' }, { ...opts, historical: true }]] as const) {
      const db = world(); delete saved(db).mva_call;
      const r = await importLawRulerPresign(db, scope, fields, options);
      assert.equal(r.filled, 0); assert.ok(!Object.prototype.hasOwnProperty.call(saved(db), 'mva_call'));
      assert.ok(saved(db).lawruler_presign);
    }
  });
  await check('malformed top-level answer document refuses instead of discarding its content', async () => {
    for (const malformed of ['Legacy text', [], false]) {
      const db = world(); db.tables.claims[0].answers = malformed;
      await assert.rejects(importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts), /existing answer document/);
      assert.deepEqual(db.tables.claims[0].answers, malformed); assert.equal(writes(db).length, 0);
    }
  });
  await check('later changed source preserves applied original provenance and current agent answer', async () => {
    const db = world();
    await importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts);
    const original = JSON.parse(JSON.stringify(saved(db).lawruler_presign.provenance['story.seat']));
    assert.equal(original.originals[0].raw, 'Driver');
    const r = await importLawRulerPresign(db, scope, { Custom4121: 'Passenger' }, { now: '2026-09-28T13:00:00Z' });
    assert.equal(r.filled, 0); assert.ok(r.review > 0);
    assert.equal(saved(db).mva_call.story.seat, 'Driver');
    assert.deepEqual(saved(db).lawruler_presign.provenance['story.seat'], original);
    assert.equal(saved(db).lawruler_presign.evidence.Custom4121.raw, 'Passenger');
  });
  await check('unreadable legacy baseline refuses before any new canonical document', async () => {
    const db = world(); delete saved(db).mva_call;
    db.failOn = op => op.table === 'intake_calls' ? 'Synthetic call read failure' : null;
    await assert.rejects(importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts), /older call answers/);
    assert.equal(writes(db).length, 0); assert.ok(!Object.prototype.hasOwnProperty.call(saved(db), 'mva_call'));
  });
  await check('scope/read/write failures propagate and cannot claim successful persistence', async () => {
    for (const [table, kind] of [['campaigns', 'select'], ['leads', 'select'], ['claims', 'select'], ['claims', 'update']]) {
      const db = world(); db.failOn = op => op.table === table && op.kind === kind ? 'Synthetic DB failure' : null;
      await assert.rejects(importLawRulerPresign(db, scope, { Custom4121: 'Driver' }, opts), /Could not|not saved/);
      assert.deepEqual(saved(db).mva_call, {}); assert.equal(saved(db).lawruler_presign, undefined);
    }
  });
  await check('oversized sources refuse before DB queries and absent/blank sources are honest no-ops', async () => {
    const large = world();
    await assert.rejects(importLawRulerPresign(large, scope, { Custom4141: 'x'.repeat(100001) }, opts), /100 KB/); assert.equal(large.ops.length, 0);
    for (const fields of [{}, { Custom4121: '' }, { PostSign: { Custom4121: 'Driver' } }, { Custom9999: 'Driver' }]) {
      const db = world(), r = await importLawRulerPresign(db, scope, fields, opts);
      assert.equal(r.outcome, 'not_supplied'); assert.equal(db.ops.length, 0);
    }
  });
  console.log(`${count} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
