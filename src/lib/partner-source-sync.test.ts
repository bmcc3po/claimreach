import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeDb } from './test-fake-db';
import { syncPrDigitalSource } from './partner-source-sync';
const scope = { firmId: 'firm', campaignId: 'campaign', leadId: 'lead', claimId: 'claim', vendorId: '100' };
const fields = { LeadID: '100', CaseType: 'INNO MVA', ContactMethod: 'PR DIGITAL' };
function world() { return new FakeDb({
  partner_report_access: [{ report_key: 'pr-digital', firm_id: 'firm', campaign_id: 'campaign', scope: 'approved_sources', active: true }],
  leads: [{ id: 'lead', firm_id: 'firm', source_system: 'lawruler', lawruler_ref_no: '100' }],
  claims: [{ id: 'claim', lead_id: 'lead', firm_id: 'firm', campaign_id: 'campaign', claim_type: 'mva' }],
  lead_activity: [], partner_source_leads: [],
}); }
test('authenticated source creates one exact binding and audit; repeated events never duplicate or alter cases', async () => {
  const db = world();
  assert.equal(await syncPrDigitalSource(db, scope, fields), 'linked');
  assert.equal(await syncPrDigitalSource(db, scope, fields), 'already_linked');
  assert.equal(db.tables.partner_source_leads.length, 1); assert.equal(db.tables.lead_activity.length, 1);
  assert.equal(db.tables.partner_source_leads[0].source_lead_id, '100');
  assert.ok(db.ops.filter(o => o.kind !== 'select').every(o => ['partner_source_leads','lead_activity'].includes(o.table)));
});
test('marketing label alone, other case types, disabled reports and foreign scopes cannot grant access', async () => {
  for (const f of [{ ...fields, ContactMethod: undefined, Source: 'PR Digital' }, { ...fields, ContactMethod: 'Other partner' }, { ...fields, CaseType: 'NETFLY ONTAKE' }]) {
    const db = world(); assert.equal(await syncPrDigitalSource(db, scope, f), 'not_applicable'); assert.equal(db.tables.partner_source_leads.length, 0);
  }
  for (const patch of [{ active: false }, { firm_id: 'foreign' }, { campaign_id: 'foreign' }, { scope: 'campaign' }]) {
    const db = world(); Object.assign(db.tables.partner_report_access[0],patch);
    assert.equal(await syncPrDigitalSource(db,scope,fields),'not_applicable'); assert.equal(db.tables.partner_source_leads.length,0);
  }
});
test('payload, lead, claim and existing approval identities must all agree', async () => {
  const mismatch = world(); await assert.rejects(syncPrDigitalSource(mismatch,scope,{...fields,LeadID:'101'}));
  for (const [table,patch] of [['leads',{lawruler_ref_no:'101'}],['leads',{source_system:'marketer'}],['leads',{firm_id:'foreign'}],['claims',{lead_id:'other'}],['claims',{campaign_id:'other'}],['claims',{claim_type:'motel_trafficking'}]] as const) {
    const db=world(); Object.assign(db.tables[table][0],patch); await assert.rejects(syncPrDigitalSource(db,scope,fields)); assert.equal(db.tables.partner_source_leads.length,0);
  }
  const db=world(); db.tables.partner_source_leads=[{partner_key:'pr-digital',source_system:'lawruler',source_lead_id:'100',firm_id:'foreign'}];
  await assert.rejects(syncPrDigitalSource(db,scope,fields)); assert.equal(db.tables.lead_activity.length,0);
});
test('audit and approval failures are surfaced; retry safely completes a partial attempt', async () => {
  const db=world(); db.failOn=o=>o.table==='lead_activity'&&o.kind==='insert'?'audit unavailable':null;
  await assert.rejects(syncPrDigitalSource(db,scope,fields)); assert.equal(db.tables.partner_source_leads.length,0);
  db.failOn=o=>o.table==='partner_source_leads'&&o.kind==='insert'?'write unavailable':null;
  await assert.rejects(syncPrDigitalSource(db,scope,fields)); assert.equal(db.tables.lead_activity.length,1); assert.equal(db.tables.partner_source_leads.length,0);
  db.failOn=()=>null; assert.equal(await syncPrDigitalSource(db,scope,fields),'linked'); assert.equal(db.tables.lead_activity.length,1);
});
