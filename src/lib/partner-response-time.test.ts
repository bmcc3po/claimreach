import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessResponseMinutes as minutes, federalHolidays, responseTimestamp } from './partner-response-time';
import { partnerReportHarness, REPORT_FIRM } from './partner-report-test-harness';
import { partnerReportData } from './partner-report';
import { inReportRange, partnerCsv } from './partner-report-view';
import { validReportAccess } from './partner-report-access';

test('business clock counts only overlap with 08:00–17:30 Pacific, including seconds', () => {
  assert.equal(minutes('2026-11-17T16:00:00Z','2026-11-17T16:02:30Z'),2.5);
  assert.equal(minutes('2026-11-17T12:46:00Z','2026-11-17T15:17:00Z'),0);
  assert.equal(minutes('2026-11-17T12:46:00Z','2026-11-17T16:17:00Z'),17);
  assert.equal(minutes('2026-11-17T16:00:00Z','2026-11-18T02:30:00Z'),570);
  assert.equal(minutes('2026-11-18T01:20:00Z','2026-11-18T16:15:00Z'),25);
  assert.equal(minutes('2026-11-18T01:30:00Z','2026-11-18T16:00:00Z'),0);
});
test('weekends, observed holidays and year-boundary observations do not consume the clock', () => {
  assert.equal(minutes('2026-11-21T02:00:00Z','2026-11-23T16:10:00Z'),10);
  assert.equal(minutes('2026-11-26T01:00:00Z','2026-11-27T16:15:00Z'),45);
  assert.equal(minutes('2026-07-03T00:00:00Z','2026-07-06T15:15:00Z'),45);
  assert.equal(minutes('2021-12-31T01:00:00Z','2022-01-03T16:15:00Z'),45);
  assert.deepEqual([...federalHolidays(2026)].sort(), ['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25']);
  assert.ok(federalHolidays(2027).has('2027-12-31'));
  assert.ok(!federalHolidays(2026).has('2026-11-27')); // Black Friday is not a federal holiday.
});
test('both DST transitions preserve Pacific opening and closing boundaries', () => {
  assert.equal(minutes('2026-03-07T01:20:00Z','2026-03-09T15:10:00Z'),20);
  assert.equal(minutes('2026-10-31T00:20:00Z','2026-11-02T16:10:00Z'),20);
});
test('missing, date-only, timezone-less and reversed timestamps never become zero', () => {
  for (const invalid of [null, '', '2026-11-17', '2026-11-17T08:00:00', 'invalid']) {
    assert.equal(responseTimestamp(invalid),null);
    assert.equal(minutes(invalid,'2026-11-17T17:00:00Z'),null);
  }
  assert.equal(minutes('2026-11-17T17:00:00Z','2026-11-17T16:00:00Z'),null);
});
test('CRM receipt drives business response; source date/filter and first-ever history remain unchanged', async () => {
  const h=await partnerReportHarness();
  h.lead.created_at='2026-11-17T16:00:00Z';h.lead.lawruler_created_at=null;
  h.lead.vendor_fields={sources:{lawruler:{LeadID:'100',CaseType:'INNO MVA',LeadCreated:'11/10/2026'}}};
  h.lead.first_dialed_at='2026-11-10T16:00:00Z';
  const call=(id:string,at:string)=>({id,firm_id:REPORT_FIRM,lead_id:h.lead.id,channel:'call',provider:'justcall',direction:'outbound',occurred_at:at});
  const calls=[call('old','2026-11-10T16:00:00Z'),call('late','2026-11-17T16:07:00Z'),call('first','2026-11-17T16:03:00Z')];
  const result=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,h.refs,{calls});const row=result.rows[0];
  assert.equal(row.speedMinutes,3);assert.equal(row.receivedAt,'2026-11-10');
  assert.equal(row.claimReachReceivedAt,h.lead.created_at);assert.equal(row.firstResponseOutboundAt,'2026-11-17T16:03:00Z');
  assert.equal(row.firstOutboundAt,'2026-11-10T16:00:00Z');assert.equal(row.attemptCount,3);
  assert.equal(inReportRange(row,'2026-11-10','2026-11-10'),true);assert.equal(inReportRange(row,'2026-11-17','2026-11-17'),false);
  assert.equal(result.summary.speedSamples,1);assert.match(partnerCsv([row]),/Received in ClaimReach/);
  const old=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,h.refs,{calls:[calls[0]]});
  assert.equal(old.rows[0].speedMinutes,null);assert.equal(old.rows[0].responseTimeReason,'No recorded outbound after ClaimReach receipt');
  assert.equal(old.summary.speedSamples,0);assert.equal(old.summary.averageSpeedMinutes,null);
});
test('after-hours early response is a valid zero; manual or inbound evidence cannot qualify', async () => {
  const h=await partnerReportHarness();h.lead.created_at='2026-11-17T12:46:00Z';
  const c={id:'c',firm_id:REPORT_FIRM,lead_id:h.lead.id,channel:'call',provider:'justcall',direction:'outbound',occurred_at:'2026-11-17T15:17:00Z'};
  const report=(e:any)=>partnerReportData(h.config,[h.lead],[h.claim],h.signatures,h.refs,e);
  assert.equal(report({calls:[c]}).summary.averageSpeedMinutes,0);assert.equal(report({calls:[c]}).summary.speedSamples,1);
  assert.equal(report({calls:[{...c,direction:'inbound'}],callLogs:[{...c,created_at:c.occurred_at}]}).rows[0].speedMinutes,null);
  for(const changed of [{...c,logged_manually:true},{...c,provider:null}]) assert.equal(report({calls:[changed]}).rows[0].speedMinutes,null);
  assert.equal(report({calls:[{...c,channel:'voicemail'}]}).rows[0].speedMinutes,0);
});
test('PR Digital campaign-wide misconfiguration fails closed on both validation and loader', async () => {
  const h=await partnerReportHarness(); const wrong={...h.config,scope:'campaign' as const};
  assert.equal(validReportAccess(wrong),false);
  await assert.rejects(()=>h.server.loadPartnerReport(h.db,wrong),/source approvals required/);
  assert.equal(h.db.ops.length,0);
});
test('response metric, history and CSV exclude NETFLY, foreign firms and unapproved leads', async () => {
  const h=await partnerReportHarness();
  const foreignLead={...h.lead,id:'foreign',lawruler_ref_no:'999',claimant_name:'Foreign canary'};
  const foreignClaim={...h.claim,id:'fc',lead_id:'foreign'};
  const sig={...h.signature,claimId:'fc'};
  const result=partnerReportData(h.config,[h.lead,foreignLead],[h.claim,foreignClaim],[h.signature,sig],h.refs);
  assert.equal(result.rows.length,1);assert.ok(!partnerCsv(result.rows).includes('Foreign canary'));
  for(const changes of [{campaign_id:'netfly'},{firm_id:'another-firm'}]) {
    assert.equal(partnerReportData(h.config,[h.lead],[{...h.claim,...changes}],h.signatures,h.refs).rows.length,0);
  }
  assert.equal(partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[]).rows.length,0);
});
