import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { FakeDb } from '../test-fake-db';
import { confirmedFirmDeliveryAt } from '../firm-delivery-state';
import { ownerConfirmedDelivery } from '../owner-file-confirmation';
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ denied = false, netfly = false } = {}) {
  const lead = { id: 'lead', firm_id: 'firm', phone: '2025550100', campaign_id: 'campaign' };
  const claim = { id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'campaign', claim_type: 'mva', answers: { mva_call: { story: { text: 'Synthetic crash' } }, netfly_secondary: { fields: { incident_story: 'Synthetic NETFLY crash' } } }, firm_sent_at: '2026-10-01' };
  const db = new FakeDb({
    claims: [claim],
    campaigns: [{ id: 'campaign', firm_id: 'firm', name: netfly ? 'NETFLY ONTAKE' : 'INNO MVA', firm_email: 'bcurry@turnbullfirm.com' }],
    firm_deliveries: [
      { lead_id: 'lead', claim_id: 'sibling', ok: true, to_email: 'bcurry@turnbullfirm.com', created_at: '2026-10-01' },
      { lead_id: 'lead', claim_id: 'claim', ok: true, to_email: 'bmc@innovativeintake.com', created_at: '2026-10-01' },
    ],
    intake_calls: [{ id: 'call', lead_id: 'lead', claim_id: 'sibling', disposition: 'signed', ended_at: '2026-10-01' }],
  });
  const from = db.from.bind(db); (db as any).from = (table: string) => { const q: any = from(table); q.not = (col: string, _op: string, value: any) => q.neq(col, value); return q; };
  let dispatch: any = null;
  const mods: Record<string, any> = {
    '../mva-call/signing-matter': { resolveSigningMatter: async (_db: any, id: string, opts: any) => {
      assert.equal(id, 'lead'); assert.equal(opts.claimId, 'claim'); assert.equal(opts.authoritativeDb, db);
      return denied ? { ok: false, error: 'Matter access denied' } : { ok: true, lead, matter: { claim, sole: false }, campaignId: 'campaign' };
    }, getMatterAgreement: async () => ({ ok: true, row: { id: 'agreement', status: 'completed', agent_reviewed_at: '2026-10-01' } }) },
    '../mva-call/esign': { packetShort: async () => false },
    '../forms': { resolveFormKey: async (_db: any, id: string, cid: string) => { assert.equal(id, 'lead'); assert.equal(cid, 'claim'); return netfly ? 'netfly_secondary' : 'mva'; } },
    '../netfly-ontake': { NETFLY_CAMPAIGN: 'NETFLY ONTAKE' },
    '../netfly-packet': { netflyPacketReview: async (_db: any, l: any, c: any) => { assert.equal(l.id, 'lead'); assert.equal(c.id, 'claim'); return { errors: ['Synthetic missing original'], snapshot: 'packet' }; } },
    '../firm-delivery-dispatch': { readFirmDispatch: async (_db: any, id: string, cid: string) => { assert.equal(id, 'lead'); assert.equal(cid, 'claim'); return { row: dispatch, error: null }; } },
    '../owner-file-confirmation': { ownerConfirmedDelivery }, '../firm-delivery-state': { confirmedFirmDeliveryAt },
    '../matter': { matterRowsFilter: () => 'claim_id.eq.claim' },
    '../resend-inbound': { contentHash: async (data: Uint8Array) => createHash('sha256').update(data).digest('hex') },
    './report': { QA_RULE_VERSION: 'test' },
  };
  const mod: any = {}; new Function('require', 'exports', code)((id: string) => { if (!(id in mods)) throw Error(id); return mods[id]; }, mod);
  return { db, claim, dispatch: (value: any) => { dispatch = value; }, load: () => mod.loadQaSnapshot(db, db, 'lead', 'claim') };
}
async function main() {
  const denied = fixture({ denied: true }); await assert.rejects(denied.load, /access denied/); assert.equal(denied.db.ops.length, 0);
  const f = fixture(), first = await f.load();
  assert.equal(first.input.sent, false, 'Sibling receipt, old timestamp and owner-only email must not mean firm sent');
  assert.ok(first.input.packetErrors.some((e: string) => /Save the signed call/.test(e)), 'Sibling call is not this matter’s disposition');
  f.db.tables.intake_calls.push({ id: 'own-call', lead_id: 'lead', claim_id: 'claim', disposition: 'signed', ended_at: '2026-10-01' });
  const second = await f.load(); assert.equal(second.input.packetErrors.length, 0); assert.notEqual(second.fingerprint, first.fingerprint);
  f.db.tables.firm_deliveries.push({ lead_id: 'lead', claim_id: 'claim', ok: true, to_email: 'bcurry@turnbullfirm.com', created_at: '2026-10-02' });
  assert.equal((await f.load()).input.sent, true);
  f.db.tables.firm_deliveries = []; (f.claim as any).firm_send_result = 'owner confirmed sent; original delivery date unknown';
  assert.equal((await f.load()).input.sent, true);
  (f.claim as any).firm_send_result = null; f.dispatch({ state: 'uncertain' });
  assert.ok((await f.load()).input.packetErrors.some((e: string) => /uncertain/.test(e)));
  f.db.failOn = op => op.table === 'firm_deliveries' ? 'receipt read failed' : null; await assert.rejects(f.load, /receipts/);
  const nf = fixture({ netfly: true }); const n = await nf.load(); assert.equal(n.input.flow, 'netfly'); assert.deepEqual(n.input.packetErrors, ['Synthetic missing original']);
  assert.ok(f.db.ops.every(op => op.kind === 'select'), 'Snapshot loader must never mutate the file');
  console.log('File QA snapshot: authorization, matter receipts/calls, legacy sends, NETFLY rules, fingerprints and read failures passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
