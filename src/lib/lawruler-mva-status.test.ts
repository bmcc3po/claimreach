import assert from 'node:assert/strict';
import { FakeDb } from './test-fake-db';
import { DEFAULT_STATUSES, isSignedKey } from './statuses';
import { acquisitionClaimForRow, EXTERNAL_DQ_REVIEW, EXTERNAL_SIGNED_REVIEW, isAcquisitionEligible, loadMvaAcquisitionHolds, mayDispatchMvaAcquisition, reconcileLawRulerMvaStatus } from './lawruler-mva-status';
import { loadLawRulerProvenance } from './lawruler-recovery';

const F = 'firm-one', L = 'lead-one', C = 'claim-one', P = 'campaign-one';
const input = { firmId: F, leadId: L, claimId: C, campaignId: P, sourceStatus: 'Signed e-Sign' };
function fixture() {
  const db = new FakeDb({
    leads: [{ id: L, firm_id: F, case_type: 'mva', archived_at: null, signed_at: '2025-01-01T00:00:00Z', qa_entered_at: '2025-01-02T00:00:00Z' }],
    claims: [{ id: C, lead_id: L, firm_id: F, campaign_id: P, claim_type: 'mva', status: 'new' }],
    campaigns: [{ id: P, firm_id: F, active: true, name: 'INNO MVA', case_type: 'mva' }],
    statuses: DEFAULT_STATUSES.map(s => ({ ...s })), dq_reasons: [{ key: 'criteria', active: true }, { key: 'already_rep', active: true }, { key: 'wrong_number', active: true }, { key: 'retired', active: false }],
    lawruler_aliases: [
      { alias: 'Signed e-Sign (Default)', status_key: 'signed_grievous' }, { alias: 'Disqualified (Default)', status_key: 'dq' },
      { alias: 'New Lead (Default)', status_key: 'new' }, { alias: 'Contact Attempted (Default)', status_key: 'contacting' },
      { alias: 'Sent e-Sign (Default)', status_key: 'esign_sent' }, { alias: 'DO NOT CALL REQUEST', status_key: 'dnc' },
      { alias: 'Signed ESign Sent To Firm', status_key: 'delivered' },
      { alias: 'Already Represented', status_key: 'dq' }, { alias: 'Wrong Number', status_key: 'dq' },
      { alias: 'Secondary Intake OK COMPLETE', status_key: 'approved' },
    ], lead_activity: [], case_documents: [],
  });
  let tick = 0;
  db.failOn = op => { if (op.table === 'lead_activity' && op.kind === 'insert') op.patch!.created_at = new Date(Date.UTC(2026, 8, 29, 0, 0, ++tick)).toISOString(); return null; };
  return db;
}
const eligible = async (db: FakeDb, claim = db.tables.claims[0]) => isAcquisitionEligible(db.tables.leads[0], claim, { statuses: db.tables.statuses as any, holds: await loadMvaAcquisitionHolds(db, [L], { firmId: F }) });
let count = 0;
const test = async (name: string, fn: () => any) => { await fn(); count++; console.log('ok', name); };
(async () => {
  await test('known signed source enters evidence review without inventing a ClaimReach signature', async () => {
    const db = fixture(); db.tables.claims.push({ ...db.tables.claims[0], id: 'sibling', campaign_id: 'other-campaign' });
    const result = await reconcileLawRulerMvaStatus(db, input);
    assert.equal(result.outcome, 'review_required'); assert.equal(result.communications_triggered, false);
    assert.equal(db.tables.claims[0].status, EXTERNAL_SIGNED_REVIEW); assert.equal(db.tables.claims[1].status, 'new');
    assert.equal(isSignedKey(db.tables.claims[0].status, DEFAULT_STATUSES), false);
    assert.equal(db.tables.leads[0].signed_at, '2025-01-01T00:00:00Z'); assert.equal(db.tables.leads[0].qa_entered_at, '2025-01-02T00:00:00Z');
    assert.ok(db.ops.every(op => !['esign_submissions', 'retainers', 'communications', 'firm_delivery_dispatches', 'automation_runs'].includes(op.table)));
    assert.equal(await eligible(db), false); assert.equal(await eligible(db, db.tables.claims[1]), true);
    const provenance = await loadLawRulerProvenance(db, L, C);
    assert.equal(provenance?.sourceSignedReported, true); assert.equal(provenance?.sourceSignedAt, null); assert.equal(provenance?.originalRetainerStored, false);
  });
  await test('LawRuler delivered report cannot count as signed or deliver to the firm without its packet', async () => {
    const db = fixture();
    const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Signed ESign Sent To Firm' });
    assert.equal(result.outcome, 'review_required'); assert.equal(result.acquisition_hold, true);
    assert.equal(db.tables.claims[0].status, EXTERNAL_SIGNED_REVIEW);
    assert.equal(isSignedKey(db.tables.claims[0].status, DEFAULT_STATUSES), false);
    assert.equal(db.tables.leads[0].qa_pending, true);
    assert.ok(db.ops.every(op => !['esign_submissions', 'firm_delivery_dispatches'].includes(op.table)));
  });
  await test('Default suffix differences map correctly but conflicting normalized aliases require review', async () => {
    for (const sourceStatus of ['Contact Attempted', ' Contact   Attempted (Default) ']) {
      const db = fixture(); const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus });
      assert.equal(result.outcome, 'applied'); assert.equal(db.tables.claims[0].status, 'contacting');
    }
    const db = fixture(); db.tables.lawruler_aliases.push({ alias: 'Signed e-Sign', status_key: 'contacting' });
    const result = await reconcileLawRulerMvaStatus(db, input); assert.equal(result.outcome, 'review_required'); assert.equal(result.acquisition_hold, false); assert.equal(db.tables.claims[0].status, 'new');
  });
  await test('DQ requires real active configured reason; missing or inactive reason still holds this matter', async () => {
    for (const dqReasonKey of [undefined, 'missing', 'retired']) {
      const db = fixture(); const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified', dqReasonKey });
      assert.equal(result.outcome, 'review_required'); assert.equal(result.acquisition_hold, true); assert.equal(db.tables.claims[0].status, EXTERNAL_DQ_REVIEW); assert.equal(await eligible(db), false);
      assert.equal(db.tables.claims[0].dq_reason_key, undefined);
    }
    const db = fixture(); const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified', dqReasonKey: 'criteria' });
    assert.equal(result.outcome, 'applied'); assert.equal(db.tables.claims[0].dq_reason_key, 'criteria'); assert.equal(db.tables.claims[0].qualification, 'dq');
  });
  await test('pending DQ can complete with reviewed standard reason without clearing its hold', async () => {
    const db = fixture(); await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified' });
    const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified', dqReasonKey: 'criteria' });
    assert.equal(result.outcome, 'applied'); assert.equal(db.tables.claims[0].status, 'dq'); assert.equal(await eligible(db), false);
  });
  await test('unambiguous source DQ labels use active standard reasons, including held imports', async () => {
    for (const [sourceStatus, key] of [['Already Represented', 'already_rep'], ['Wrong Number', 'wrong_number']]) {
      const db = fixture();
      const first = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus });
      assert.equal(first.outcome, 'applied');
      assert.equal(db.tables.claims[0].status, 'dq');
      assert.equal(db.tables.claims[0].dq_reason_key, key);
      assert.equal(await eligible(db), false);
      const held = fixture(); held.tables.claims[0].status = EXTERNAL_DQ_REVIEW;
      const recovered = await reconcileLawRulerMvaStatus(held, { ...input, sourceStatus });
      assert.equal(recovered.outcome, 'applied');
      assert.equal(held.tables.claims[0].status, 'dq');
      assert.equal(held.tables.claims[0].dq_reason_key, key);
    }
    const fromGeneric = fixture();
    await reconcileLawRulerMvaStatus(fromGeneric, { ...input, sourceStatus: 'Disqualified' });
    assert.equal(fromGeneric.tables.claims[0].status, EXTERNAL_DQ_REVIEW);
    const clarified = await reconcileLawRulerMvaStatus(fromGeneric, { ...input, sourceStatus: 'Already Represented' });
    assert.equal(clarified.outcome, 'applied');
    assert.equal(fromGeneric.tables.claims[0].dq_reason_key, 'already_rep');
  });
  await test('unknown terminal-sounding text and inactive/non-MVA aliases never invent a status or hold', async () => {
    for (const sourceStatus of ['Totally DQ signed', 'Secondary Intake OK COMPLETE', 'Signed e-Sign']) {
      const db = fixture(); if (sourceStatus === 'Signed e-Sign') db.tables.statuses.find(s => s.key === 'signed_grievous')!.active = false;
      const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus }); assert.equal(result.outcome, 'review_required'); assert.equal(result.acquisition_hold, false); assert.equal(db.tables.claims[0].status, 'new');
    }
  });
  await test('historical mode does not read or write live reconciliation state', async () => {
    const db = fixture(); const result = await reconcileLawRulerMvaStatus(db, { ...input, historical: true });
    assert.equal(result.outcome, 'review_required'); assert.equal(db.ops.length, 0);
  });
  await test('other campaigns and inactive scope stay outside automatic reconciliation', async () => {
    for (const edit of [{ name: 'Other MVA' }, { active: false }, { case_type: 'motel_trafficking' }, { firm_id: 'other-firm' }]) {
      const db = fixture(); Object.assign(db.tables.campaigns[0], edit);
      assert.equal((await reconcileLawRulerMvaStatus(db, input)).outcome, 'out_of_scope'); assert.ok(db.ops.every(op => op.kind === 'select'));
    }
  });
  await test('wrong firm, lead, campaign or claim type never touches the named matter', async () => {
    for (const edit of [{ firm_id: 'other' }, { lead_id: 'other' }, { campaign_id: 'other' }, { claim_type: 'motel_trafficking' }]) {
      const db = fixture(); Object.assign(db.tables.claims[0], edit);
      await assert.rejects(reconcileLawRulerMvaStatus(db, input), /exact/); assert.ok(db.ops.every(op => op.kind === 'select'));
    }
  });
  await test('archived files are never reopened by incoming status', async () => {
    const db = fixture(); db.tables.leads[0].archived_at = '2026-09-01';
    assert.equal((await reconcileLawRulerMvaStatus(db, input)).outcome, 'review_required'); assert.ok(db.ops.every(op => op.kind === 'select')); assert.equal(await eligible(db), false);
  });
  await test('signed, DQ and DNC reject stale reopening and conflicting terminal outcomes', async () => {
    for (const prior of ['signed_grievous', 'dq', 'dnc', 'delivered']) for (const sourceStatus of ['New Lead', 'Contact Attempted', 'Disqualified', 'Signed e-Sign']) {
      const db = fixture(); db.tables.claims[0].status = prior;
      const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus, dqReasonKey: 'criteria' });
      assert.equal(db.tables.claims[0].status, prior); assert.equal(result.applied, false); assert.equal(await eligible(db), false);
    }
  });
  await test('pending external hold survives unsequenced open and unknown messages plus answer updated_at changes', async () => {
    const db = fixture(); await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified' });
    for (const sourceStatus of ['New Lead', 'Unknown status']) {
      db.tables.claims[0].updated_at = '2030-01-01T00:00:00Z';
      const result = await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus });
      assert.equal(result.acquisition_hold, true); assert.equal(await eligible(db), false); assert.equal(db.tables.claims[0].status, EXTERNAL_DQ_REVIEW);
    }
  });
  await test('repeated source does not repeat canonical status writes or endlessly add reconciliation events', async () => {
    const db = fixture(); await reconcileLawRulerMvaStatus(db, input); await reconcileLawRulerMvaStatus(db, input);
    const size = db.tables.lead_activity.length; await reconcileLawRulerMvaStatus(db, input);
    assert.equal(db.tables.lead_activity.length, size); assert.equal(db.ops.filter(o => o.table === 'claims' && o.kind === 'update').length, 1);
  });
  await test('CAS race cannot replace newer DNC; external source hold and review remain visible', async () => {
    const db = fixture(), original = db.failOn;
    db.failOn = op => { if (op.table === 'claims' && op.kind === 'update') db.tables.claims[0].status = 'dnc'; return original(op); };
    const result = await reconcileLawRulerMvaStatus(db, input);
    assert.equal(result.outcome, 'review_required'); assert.equal(result.applied, false); assert.equal(db.tables.claims[0].status, 'dnc'); assert.equal(result.acquisition_hold, true);
  });
  await test('failed hold/audit or catalog access is surfaced instead of success', async () => {
    for (const table of ['lawruler_aliases', 'statuses', 'lead_activity']) {
      const db = fixture(); db.failOn = op => op.table === table ? 'offline' : null;
      await assert.rejects(reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified' }), /offline/);
    }
    const db = fixture(); db.failOn = op => op.table === 'lead_activity' && op.kind === 'insert' ? 'audit offline' : null;
    await assert.rejects(reconcileLawRulerMvaStatus(db, input), /Status changed.*audit offline/); assert.equal(db.tables.claims[0].status, EXTERNAL_SIGNED_REVIEW);
  });
  await test('callback binding uses exact claim or sole compatible legacy matter, never a sibling guess', () => {
    const db = fixture(), lead = { ...db.tables.leads[0], claims: db.tables.claims };
    assert.equal(acquisitionClaimForRow(lead, {})?.id, C);
    assert.equal(acquisitionClaimForRow(lead, { campaign_id: 'other' }), null);
    lead.claims.push({ ...lead.claims[0], id: 'sibling' });
    assert.equal(acquisitionClaimForRow(lead, {}), null); assert.equal(acquisitionClaimForRow(lead, { claim_id: C })?.id, C);
    assert.equal(acquisitionClaimForRow(lead, { claim_id: 'foreign' }), null);
  });
  await test('dispatch rechecks held/signed/archived and ambiguous multi-matter jobs but preserves exact eligible sibling', async () => {
    const db = fixture(); assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L })).allowed, true);
    db.tables.claims.push({ ...db.tables.claims[0], id: 'sibling' });
    await reconcileLawRulerMvaStatus(db, { ...input, sourceStatus: 'Disqualified' });
    assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L })).allowed, false);
    assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L, claimId: C })).allowed, false);
    assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L, claimId: 'sibling' })).allowed, true);
    assert.equal((await mayDispatchMvaAcquisition(db, { firmId: 'wrong-firm', leadId: L, claimId: 'sibling' })).allowed, false);
    db.tables.leads[0].archived_at = '2026-09-01'; assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L, claimId: 'sibling' })).allowed, false);
  });
  await test('non-MVA dispatch remains under existing workflow; uncertain catalog or holds block MVA', async () => {
    const db = fixture(); db.tables.leads[0].case_type = 'motel_trafficking'; db.tables.claims[0].claim_type = 'motel_trafficking'; db.tables.claims[0].status = 'retained';
    assert.equal((await mayDispatchMvaAcquisition(db, { firmId: F, leadId: L })).outOfScope, true);
    for (const table of ['statuses', 'lead_activity']) {
      const bad = fixture(); bad.failOn = op => op.table === table ? 'offline' : null;
      assert.equal((await mayDispatchMvaAcquisition(bad, { firmId: F, leadId: L })).allowed, false);
    }
  });
  console.log(`${count} LawRuler MVA reconciliation and eligibility tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
