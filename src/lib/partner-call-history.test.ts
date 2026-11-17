import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partnerCallHistory } from './partner-call-history';
import { partnerReportData } from './partner-report';
import { partnerReportHarness, REPORT_FIRM } from './partner-report-test-harness';

test('attempts deduplicate provider identity, keep same-time distinct calls, and separate inbound/manual evidence',()=>{
  const c={id:'a',provider:'justcall',call_sid:'one',direction:'outbound',occurred_at:'2026-11-01T12:00:00Z',provider_call_result:'busy',duration_sec:0};
  const r=partnerCallHistory([c,{...c,id:'duplicate'},{...c,id:'b',call_sid:'two'},{...c,id:'c',call_sid:'three',direction:'inbound'},
    {...c,id:'d',call_sid:'four',direction:null,occurred_at:null}], [{direction:'outbound',created_at:c.occurred_at,outcome:'answered',duration_min:3}]);
  assert.equal(r.attemptCount,2);assert.equal(r.inboundCount,1);assert.equal(r.manualLogCount,1);assert.equal(r.history.length,5);
  assert.equal(r.history.at(-1)?.at,null);assert.equal(r.history[0].result,'Busy');
  assert.ok(!JSON.stringify(r).includes('call_sid'));assert.ok(!JSON.stringify(r).includes('justcall'));
});

test('inbound calls and manual-log creation cannot become a verified response time',async()=>{
  const h=await partnerReportHarness();h.lead.first_dialed_at=null;
  const c={id:'a',firm_id:REPORT_FIRM,lead_id:h.lead.id,channel:'call',direction:'inbound',occurred_at:'2026-09-30T12:01:00Z'};
  const evidence={calls:[c],callLogs:[{firm_id:REPORT_FIRM,lead_id:h.lead.id,claim_id:h.claim.id,direction:'outbound',created_at:'2026-09-30T12:02:00Z'}]};
  let r=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0];
  assert.equal(r.speedMinutes,null);assert.equal(r.attemptCount,0);assert.equal(r.manualLogCount,1);assert.equal(r.called,true);
  evidence.calls.push({...c,id:'b',direction:'outbound',occurred_at:'2026-09-30T12:03:00Z'});
  r=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0];assert.equal(r.speedMinutes,3);
  h.lead.lawruler_created_at=null;
  r=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0];assert.equal(r.speedMinutes,null);assert.equal(r.responseTimeReason,'Original receipt time missing');
});

test('foreign and sibling histories are withheld, including raw call payloads',async()=>{
  const h=await partnerReportHarness();const c={id:'a',firm_id:REPORT_FIRM,lead_id:h.lead.id,channel:'call',direction:'outbound',occurred_at:'2026-10-01T12:00:00Z',recording_url:'SECRET',body:'SECRET',transcript:'SECRET',outcome:'SECRET'};
  const project=(claims:any[])=>partnerReportData(h.config,[h.lead],claims,h.signatures,[],{calls:[c,{...c,id:'foreign',firm_id:'foreign'}]}).rows[0];
  assert.equal(project([h.claim]).attemptCount,1);assert.ok(!JSON.stringify(project([h.claim])).includes('SECRET'));
  const r=project([h.claim,{...h.claim,id:'sibling',campaign_id:'other'}]);assert.equal(r.attemptCount,0);assert.deepEqual(r.callHistory,[]);
});
