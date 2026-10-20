import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validDqExplanation } from './dq-explanation';
import { validateDispo } from './mva-call/dispo';
import { setClaimStatusForLeads } from './claim-status';
import { DEFAULT_STATUSES } from './statuses';
import { FakeDb } from './test-fake-db';
import { partnerReportHarness, REPORT_FIRM } from './partner-report-test-harness';
import { partnerReportData } from './partner-report';
import { datePreset, inReportRange } from './partner-report-view';

test('API bypass: DQ explanations reject absent, whitespace, short, non-text and punctuation-only payloads',()=>{
  for(const note of [undefined,null,'',' \n\t\u00a0 ','..........','short',{},'x'.repeat(2001)]) {
    assert.equal(validDqExplanation(note),false);
    for(const dispo of ['dq','ni','dnc']) assert.equal(validateDispo({dispo,reasons:['other'],note}).ok,false);
  }
  assert.equal(validateDispo({dispo:'dq',reasons:['other'],note:'Client is already represented.'}).ok,true);
  assert.equal(validateDispo({dispo:'dq',reasons:[],note:'Client is already represented.'}).ok,false);
});
function world(){return new FakeDb({claims:[{id:'c',lead_id:'l',firm_id:'f',status:'new'}],leads:[{id:'l',firm_id:'f'}],dq_reasons:[{key:'other',label:'Other'}]});}
const effects={audit:async()=>{},automation:async()=>{},webhook:async()=>{}};
const options={leadIds:['l'],claimIds:['c'],status:'dq',dqReasonKey:'other',manualDq:true,statuses:DEFAULT_STATUSES};
test('manual setter rejects bypasses before writes; failed claim write preserves both status and explanation',async()=>{
  for(const note of [undefined,'  ','short']){const db=world();assert.equal((await setClaimStatusForLeads({...options,dqExplanation:note},{db,...effects})).ok,false);assert.equal(db.ops.filter(o=>o.kind!=='select').length,0);}
  const db=world();db.failOn=o=>o.table==='claims'&&o.kind==='update'?'synthetic failure':null;
  assert.equal((await setClaimStatusForLeads({...options,dqExplanation:'Client is already represented.'},{db,...effects})).ok,false);
  assert.equal(db.tables.claims[0].status,'new');assert.equal(db.tables.claims[0].dq_explanation,undefined);
});
test('manual claim status and dedicated explanation save together; imported missing explanations stay private and import succeeds',async()=>{
  const db=world();assert.equal((await setClaimStatusForLeads({...options,dqExplanation:'Client is already represented.'},{db,...effects})).ok,true);
  assert.equal(db.tables.claims[0].dq_explanation,'Client is already represented.');
  assert.equal((await setClaimStatusForLeads({...options,manualDq:false,historical:true,status:'external_dq_review',dqReasonKey:null,dqNote:'PRIVATE imported narrative'},{db,...effects})).ok,true);
  assert.equal(db.tables.claims[0].dq_explanation,null);assert.equal(db.tables.claims[0].status,'external_dq_review');
});
test('DQ transaction failure has no fallback status or call writes',async()=>{
  const db=world();let called=false;(db as any).rpc=async()=>{called=true;return {data:null,error:{message:'synthetic rollback'}};};
  const r=await setClaimStatusForLeads({...options,dqExplanation:'Client is already represented.',dqCall:{id:'call',row:{}}},{db,...effects});
  assert.equal(r.ok,false);assert.equal(called,true);assert.equal(db.ops.filter(o=>o.kind!=='select').length,0);assert.equal(db.tables.claims[0].status,'new');
});
test('report separates current DQ, historical DQ and firm turn-down; only dedicated explanation is exposed',async()=>{
  const h=await partnerReportHarness();h.signature.state='unsigned';h.signature.statusKey='dq';h.claim.status='dq';h.claim.dq_reason_key='other';h.claim.dq_reason='PRIVATE internal reason';
  const evidence={reasons:[{key:'other',label:'Other'}],notes:[{firm_id:REPORT_FIRM,lead_id:h.lead.id,claim_id:h.claim.id,scope:'file',body:'PRIVATE narrative',created_at:'2026-10-10T12:00:00Z'}]};
  const get=()=>partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0];
  assert.equal(get().dqKind,'Current intake DQ');assert.equal(get().notes,null);assert.match(get().dqReview!,/explanation missing/);assert.ok(!JSON.stringify(get()).includes('PRIVATE'));
  h.claim.dq_explanation='Client is already represented.';assert.equal(get().notes,h.claim.dq_explanation);
  h.signature.statusKey='contacting';assert.equal(get().dqKind,'Historical DQ');
  h.signature.statusKey='signed_dropped';assert.equal(get().dqKind,'Firm turn-down');
  h.claim.dq_reason_key=null;h.claim.dq_explanation=null;assert.match(get().dqReview!,/reason and explanation missing/);
});
test('last 14 days includes exactly 14 Pacific receipt days across DST',()=>{
  const range=datePreset('Last 14 days','2026-11-03T13:00:00Z');assert.deepEqual(range,{from:'2026-10-21',to:'2026-11-03'});
  assert.equal(inReportRange({receivedAt:'2026-10-21T07:00:00Z'} as any,range.from,range.to),true);
  assert.equal(inReportRange({receivedAt:'2026-10-21T06:59:59Z'} as any,range.from,range.to),false);
  assert.equal(inReportRange({receivedAt:'2026-11-04T08:00:00Z'} as any,range.from,range.to),false);
});
