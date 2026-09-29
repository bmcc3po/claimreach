import assert from 'node:assert/strict';
import { FakeDb } from './test-fake-db';
import { DEFAULT_STATUSES } from './statuses';
import { lrSigningEvidence, planLawRulerRecovery, previewLawRulerRecovery, loadLawRulerProvenance } from './lawruler-recovery';
import { applyLawRulerRecovery } from './lawruler-recovery-apply';
import { resolveLawRulerMatter, storeLawRulerOriginals, validateLawRulerOriginal, type LrOriginal } from './lawruler-documents';
import { setClaimStatusForLeads } from './claim-status';
const F = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444';
const scope = { firmId: F, leadId: L, claimId: C, vendorId: '264972' };
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const pdf: LrOriginal = { name: '264972-Tester-Retainer.pdf', contentType: 'application/pdf', bytes: bytes('%PDF-1.4\nSynthetic original\n%%EOF') };
const fields = { Status: 'Legacy signed', 'Signed Contracts Received': 'Yes', signed_at: '2025-03-04' };
const lead = () => ({ id: L, firm_id: F, lead_no: 'TEST-1', source_system: 'lawruler', archived_at: null, external_id: '264972', vendor_fields: { lawruler_status: 'Legacy signed', sources: { lawruler: { ...fields, _at: '2025-03-05T00:00:00Z' } } }, signed_at: '2025-03-04T00:00:00Z', qa_entered_at: '2025-03-05T00:00:00Z' });
const claim = () => ({ id: C, firm_id: F, lead_id: L, campaign_id: 'mva', campaign: 'MVA', claim_type: 'mva', status: 'new' });
function db() { return new FakeDb({ leads: [lead()], claims: [claim()], lead_activity: [], case_documents: [], statuses: DEFAULT_STATUSES.map(s => ({ ...s })), dq_reasons: [{ key: 'other', active: true }] }); }
function storage(database: FakeDb) {
  const objects = new Map<string, ArrayBuffer>();
  (database as any).storage = { from: (bucket: string) => {
    assert.equal(bucket, 'case-docs');
    return { upload: async (path: string, data: ArrayBuffer, opts: any) => {
      assert.equal(opts.upsert, false);
      if (objects.has(path)) return { error: { statusCode: '409', message: 'exists' } };
      objects.set(path, data.slice(0)); return { error: null };
    }, download: async (path: string) => ({ data: objects.has(path) ? new Blob([objects.get(path)!]) : null, error: objects.has(path) ? null : { message: 'missing' } }) };
  } }; return objects;
}
const selection = () => ({ lead_id: L, claim_id: C, source_status: 'Legacy signed', expected_status: 'new', status: 'signed_grievous', mapping_approved: true, mapping_note: 'Synthetic owner reviewed source label' });
let count = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => { await fn(); count++; console.log('ok', name); };
(async () => {
  await t('signed flag stays separate from original/date verification; invalid date never fabricated', () => {
    assert.equal(lrSigningEvidence({ 'Signed Contracts Received': 'Yes' }).source_signed_at, null);
    assert.equal(lrSigningEvidence({ signed_at: '2025-02-30' }).source_signed_at, null);
    assert.equal(lrSigningEvidence(fields).source_signed_at, '2025-03-04T00:00:00.000Z');
    const plan = planLawRulerRecovery(lead(), [claim()], [], []);
    assert.equal(plan.mapping_known, false); assert.equal(plan.source_signed_reported, true); assert.equal(plan.original_retainer_stored, false);
  });
  await t('ambiguous/unbound source never chooses a sibling; cross-firm claim excluded', () => {
    const plan = planLawRulerRecovery(lead(), [claim(), { ...claim(), id: OTHER }], [], []);
    assert.equal(plan.claim_id, null); assert.match(plan.errors.join(' '), /Ambiguous/);
    assert.equal(planLawRulerRecovery(lead(), [{ ...claim(), firm_id: OTHER }], [], []).claim_id, null);
  });
  await t('preview is read-only and firm-scoped', async () => {
    const database = db(); assert.equal((await previewLawRulerRecovery(database, { firmId: OTHER })).results.length, 0);
    const p = await previewLawRulerRecovery(database, { firmId: F }); assert.equal(p.results.length, 1);
    assert.ok(database.ops.every(o => o.kind === 'select'));
  });
  await t('provenance on multi-matter file excludes sibling and unbound metadata', async () => {
    const database = db(); database.tables.claims.push({ ...claim(), id: OTHER });
    database.tables.lead_activity.push({ firm_id: F, lead_id: L, meta: { source: 'lawruler', event: 'source_snapshot', claim_id: OTHER, status: 'Sibling signed', source_fields: fields } });
    assert.equal(await loadLawRulerProvenance(database, L, C), null);
  });
  await t('later status-only snapshot preserves earlier exact-matter signing evidence', async () => {
    const database = db();
    database.tables.lead_activity.push({ firm_id: F, lead_id: L, created_at: '2026-01-01T00:00:00Z', meta: { source: 'lawruler', event: 'source_snapshot', claim_id: C, status: 'Working', source_fields: { Status: 'Working' } } });
    const p = await loadLawRulerProvenance(database, L, C);
    assert.equal(p?.sourceStatus, 'Working'); assert.equal(p?.sourceSignedReported, true); assert.equal(p?.sourceSignedAt, '2025-03-04T00:00:00.000Z');
  });
  await t('unknown label requires explicit approval and stale source/current status both refuse', async () => {
    for (const edit of [{ mapping_approved: false }, { source_status: 'different' }, { expected_status: 'contacting' }]) {
      const database = db(); const result = await applyLawRulerRecovery(database, F, [{ ...selection(), ...edit }], { id: OTHER });
      assert.equal(result.changed, 0); assert.ok(result.results[0].error); assert.equal(database.tables.claims[0].status, 'new');
    }
  });
  await t('approved mapping changes exactly one matter, retains original signed/QA dates and adds provenance', async () => {
    const database = db(); const result = await applyLawRulerRecovery(database, F, [selection()], { id: OTHER });
    assert.equal(result.changed, 1); assert.equal(database.tables.claims[0].status, 'signed_grievous');
    assert.equal(database.tables.leads[0].signed_at, '2025-03-04T00:00:00Z'); assert.equal(database.tables.leads[0].qa_entered_at, '2025-03-05T00:00:00Z');
    assert.equal(database.tables.lead_activity[0].meta.original_status, 'Legacy signed');
    assert.equal(database.tables.esign_agreements, undefined); assert.equal(result.communications_triggered, false);
  });
  await t('database compare-and-set loses a race without overwriting newer disposition', async () => {
    const database = db(); database.failOn = op => { if (op.table === 'claims' && op.kind === 'update') database.tables.claims[0].status = 'dnc'; return null; };
    const result = await applyLawRulerRecovery(database, F, [selection()], { id: OTHER });
    assert.equal(result.changed, 0); assert.ok(result.results[0].error); assert.equal(database.tables.claims[0].status, 'dnc');
  });
  await t('historical setter calls no automation/webhook/delivery even for unlocking status', async () => {
    const database = db(); let triggers = 0;
    const result = await setClaimStatusForLeads({ leadIds: [L], claimIds: [C], status: 'signed_approved', expectedStatus: 'new', historical: true, statuses: DEFAULT_STATUSES }, { db: database, audit: async () => {}, automation: async () => { triggers++; }, webhook: async () => { triggers++; }, deliver: async () => { triggers++; } });
    assert.equal(result.ok, true); assert.equal(triggers, 0);
  });
  await t('unknown/inactive target and missing DQ reason fail closed', async () => {
    for (const edit of [{ status: 'invented' }, { status: 'dq', dq_reason_key: 'missing' }]) {
      const database = db(); const result = await applyLawRulerRecovery(database, F, [{ ...selection(), ...edit }], { id: OTHER });
      assert.equal(result.changed, 0); assert.ok(result.results[0].error);
    }
  });
  await t('audit failure is partial failure instead of full success', async () => {
    const database = db(); database.failOn = op => op.kind === 'insert' && op.table === 'lead_activity' ? 'audit offline' : null;
    const result = await applyLawRulerRecovery(database, F, [selection()], { id: OTHER }); assert.equal(result.changed, 1); assert.match(result.results[0].error, /audit failed/);
  });
  await t('matter resolution rejects cross-firm, campaign conflict and ambiguous siblings', async () => {
    for (const edit of [{ firmId: OTHER }, { campaignId: 'other' }]) assert.equal((await resolveLawRulerMatter(db(), { firmId: F, leadId: L, campaignId: 'mva', ...edit })).ok, false);
    const database = db(); database.tables.claims.push({ ...claim(), id: OTHER });
    assert.equal((await resolveLawRulerMatter(database, { firmId: F, leadId: L, campaignId: 'mva' })).ok, false);
  });
  await t('mismatched filename, manifest, CSV embedded lead, broken PDF rejected before storage', () => {
    assert.throws(() => validateLawRulerOriginal({ ...pdf, name: '999-Retainer.pdf' }, scope, fields), /different/);
    assert.throws(() => validateLawRulerOriginal({ ...pdf, name: 'Retainer.pdf' }, scope, fields), /manifest/);
    assert.throws(() => validateLawRulerOriginal(pdf, scope, { attachment_manifest: [{ name: pdf.name, lead_id: scope.vendorId, claim_id: OTHER }] }), /different/);
    assert.throws(() => validateLawRulerOriginal({ ...pdf, bytes: bytes('%PDF-broken') }, scope, fields), /complete/);
    assert.throws(() => validateLawRulerOriginal({ ...pdf, name: '264972-Intake.csv', bytes: bytes('Lead Number,Status\n999,Signed') }, scope, fields), /CSV content/);
    assert.equal(validateLawRulerOriginal({ ...pdf, name: '264972-Intake.csv', bytes: bytes('Lead Number,Status\n264972,Signed') }, scope, fields).docType, 'intake');
  });
  await t('original bytes are immutable, exact-claim bound and idempotent', async () => {
    const database = db(); const objects = storage(database);
    const first = await storeLawRulerOriginals(database, scope, [pdf], fields); const next = await storeLawRulerOriginals(database, scope, [pdf], fields);
    assert.equal(objects.size, 1); assert.equal(database.tables.case_documents.length, 1); assert.equal(database.tables.lead_activity.length, 1);
    assert.equal(next[0].duplicate, true); assert.equal(first[0].sha256, next[0].sha256); assert.equal(database.tables.case_documents[0].claim_id, C);
    assert.equal(database.tables.lead_activity[0].meta.signature_validation, 'not_performed');
  });
  await t('index failure after upload recovers exactly on retry', async () => {
    const database = db(); const objects = storage(database); let fail = true;
    database.failOn = op => op.table === 'case_documents' && op.kind === 'insert' && fail ? 'index unavailable' : null;
    await assert.rejects(storeLawRulerOriginals(database, scope, [pdf], fields), /index failed/);
    assert.equal(objects.size, 1); assert.equal(database.tables.case_documents.length, 0);
    fail = false; await storeLawRulerOriginals(database, scope, [pdf], fields);
    assert.equal(objects.size, 1); assert.equal(database.tables.case_documents.length, 1); assert.equal(database.tables.lead_activity.length, 1);
  });
  await t('provenance failure recovers without duplicate originals', async () => {
    const database = db(); const objects = storage(database); let fail = true;
    database.failOn = op => op.table === 'lead_activity' && op.kind === 'insert' && fail ? 'audit unavailable' : null;
    await assert.rejects(storeLawRulerOriginals(database, scope, [pdf], fields), /provenance failed/);
    fail = false; await storeLawRulerOriginals(database, scope, [pdf], fields);
    assert.equal(objects.size, 1); assert.equal(database.tables.case_documents.length, 1); assert.equal(database.tables.lead_activity.length, 1);
  });
  await t('object byte collision and wrong document metadata both stop filing', async () => {
    const database = db(); const objects = storage(database); await storeLawRulerOriginals(database, scope, [pdf], fields);
    const key = [...objects.keys()][0]; objects.set(key, bytes('other bytes'));
    await assert.rejects(storeLawRulerOriginals(database, scope, [pdf], fields), /could not be verified/);
    objects.set(key, pdf.bytes); database.tables.case_documents[0].claim_id = OTHER;
    await assert.rejects(storeLawRulerOriginals(database, scope, [pdf], fields), /conflicting matter/);
  });
  await t('source-only signed flag does not invent missing retainer; uploaded original becomes visible', async () => {
    const database = db(); storage(database);
    assert.ok((await loadLawRulerProvenance(database, L, C))?.pendingMissing.some(x => /retainer/.test(x)));
    await storeLawRulerOriginals(database, scope, [pdf], fields);
    const p = await loadLawRulerProvenance(database, L, C); assert.equal(p?.originalRetainerStored, true); assert.equal(p?.signatureValidation, 'not_performed'); assert.equal(p?.originals.length, 1);
  });
  console.log(`${count} LawRuler recovery tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
