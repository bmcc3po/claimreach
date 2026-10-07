import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeDb } from './test-fake-db';
import { setClaimStatusForLeads } from './claim-status';
import { DEFAULT_STATUSES, resolveStatus } from './statuses';
import { notifySignedDecline } from './signed-decline-notification';
import { dropLetterMessage, type SignedDecline } from './signed-decline';
import { packetWorklist } from './packet-worklist';

const d: SignedDecline = { id: 'drop-id', at: '2026-10-07T15:00:00Z', reason: 'Treatment gap greater than 30 days.',
  actorId: 'owner', actorName: 'Owner', agentId: 'agent', agentName: 'Test Agent', previousStatus: 'signed_approved' };
function fixture() {
  const claim = { id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'inno', campaign: 'INNO MVA', claim_type: 'mva',
    status: 'signed_approved', updated_at: '2026-10-01T12:00:00Z', answers: { mva_call: { story: 'Original notes' } }, firm_sent_at: '2026-10-02', firm_send_result: 'sent' };
  const db = new FakeDb({ claims: [claim, { ...claim, id: 'sibling', status: 'signed_qa' }],
    leads: [{ id: 'lead', firm_id: 'firm', claimant_name: 'Fictional Client', signed_at: '2026-10-01' }], statuses: DEFAULT_STATUSES, lead_activity: [] });
  return { db, claim, lead: db.tables.leads[0], to: 'firm@example.test', decline: d };
}
test('atomic decline preserves answers/signature/delivery and sibling QA; stale update does nothing; cannot reopen', async () => {
  const { db, claim } = fixture();
  const deps = { db, audit: async () => {}, automation: async () => {}, webhook: async () => {} };
  const opts = { leadIds: ['lead'], claimIds: ['claim'], status: 'signed_dropped', dqReasonKey: 'criteria', dqNote: d.reason,
    signedDecline: d, expectedStatus: 'signed_approved', expectedUpdatedAt: claim.updated_at, suppressAutoDelivery: true };
  assert.equal((await setClaimStatusForLeads({ ...opts, expectedUpdatedAt: 'stale' }, deps)).ok, false);
  assert.equal(claim.status, 'signed_approved');
  assert.equal((await setClaimStatusForLeads({ ...opts, signedDecline: undefined }, deps)).ok, false);
  assert.equal((await setClaimStatusForLeads(opts, deps)).ok, true);
  assert.deepEqual(claim.answers.mva_call, { story: 'Original notes' });
  assert.equal(db.tables.claims[0].answers.signed_decline.id, d.id);
  assert.equal(claim.firm_sent_at, '2026-10-02'); assert.equal(db.tables.leads[0].signed_at, '2026-10-01');
  assert.equal(db.tables.claims[1].status, 'signed_qa'); assert.equal(db.tables.leads[0].qa_pending, true);
  assert.equal((await setClaimStatusForLeads({ leadIds: ['lead'], claimIds: ['claim'], status: 'signed_approved' }, deps)).ok, false);
});
test('old catalog cannot make signed disqualifications billable', () => {
  assert.equal(resolveStatus('signed_dropped', DEFAULT_STATUSES.map(s => ({ ...s, billable: true }))).billable, false);
});
test('concurrent drop requests and later retries send exactly once; no packet receipt or clock is written', async () => {
  const c = fixture(); let sends = 0;
  const send = async (mail: any) => { sends++; assert.deepEqual(mail.to, 'firm@example.test'); assert.equal(mail.attachments, undefined); return { ok: true, providerId: 'provider-1' }; };
  await Promise.all([notifySignedDecline(c, false, send), notifySignedDecline(c, false, send)]);
  await notifySignedDecline(c, true, send);
  assert.equal(sends, 1); assert.equal(c.db.tables.lead_activity.length, 1);
  assert.equal(c.db.tables.lead_activity[0].meta.provider_id, 'provider-1');
  assert.ok(c.db.ops.every(o => o.table === 'lead_activity'));
});
test('only definite failures retry, with frozen recipient and payload; uncertain/crashed send never silently retries', async () => {
  for (const uncertain of [false, true]) {
    const c = fixture(); let sends = 0;
    await notifySignedDecline(c, false, async () => { sends++; return { ok: false, error: 'Synthetic failure', uncertain }; });
    c.to = 'changed@example.test'; c.lead.claimant_name = 'Changed name';
    await notifySignedDecline(c, true, async mail => { sends++; assert.equal(mail.to, 'firm@example.test'); assert.match(mail.subject, /Fictional Client/); return { ok: true }; });
    assert.equal(sends, uncertain ? 1 : 2);
  }
  const c = fixture(); let sends = 0;
  c.db.failOn = o => o.kind === 'update' ? 'receipt failed' : null;
  await assert.rejects(notifySignedDecline(c, false, async () => { sends++; return { ok: true }; }), /could not be saved/);
  c.db.failOn = () => null;
  await notifySignedDecline(c, true, async () => { sends++; return { ok: true }; });
  assert.equal(sends, 1); assert.equal(c.db.tables.lead_activity[0].meta.state, 'sending');
});
test('failed reservation sends nothing; escaped content; declined packets leave the operator work list', async () => {
  const c = fixture(); c.db.failOn = () => 'database unavailable';
  await assert.rejects(notifySignedDecline(c, false, async () => { throw new Error('must not send'); }));
  assert.ok(!dropLetterMessage('<script>', 'TMP-1', '<img>\nReason').html.includes('<img>'));
  const rows = packetWorklist({ submissions: [{ id:'s', lead_id:'lead', claim_id:'claim', signed_at:d.at, created_at:d.at, status:'signed' }],
    leads:[c.lead], claims:[{ ...c.claim, status:'signed_dropped' }], calls:[], users:[], firms:[], deliveries:[] });
  assert.equal(rows.length, 0);
});
