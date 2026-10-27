import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partnerReportHarness, REPORT_FIRM } from './partner-report-test-harness';
import { partnerReportData } from './partner-report';
import { datePreset, groupPartnerRows, inReportRange, partnerCsv, reportDay, sortPartnerRows, summarizePartnerRows } from './partner-report-view';

test('Pacific receipt cohorts honor inclusive boundaries, DST, unknowns and calendar-only source dates', async()=>{
  const h=await partnerReportHarness(), row=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[]).rows[0];
  assert.equal(reportDay('2026-10-01T01:00:00Z'),'2026-09-30');
  assert.equal(reportDay('2026-10-01'),'2026-10-01');
  assert.deepEqual(datePreset('Last 7 days','2026-11-03T13:00:00Z'),{from:'2026-10-28',to:'2026-11-03'});
  assert.deepEqual(datePreset('This month','2026-10-01T01:00:00Z'),{from:'2026-09-01',to:'2026-09-30'});
  assert.equal(inReportRange({...row,receivedAt:'2026-10-01T06:59:59Z'},'2026-09-30','2026-09-30'),true);
  assert.equal(inReportRange({...row,receivedAt:'2026-10-01T07:00:00Z'},'2026-09-30','2026-09-30'),false);
  assert.equal(inReportRange({...row,receivedAt:null},'2026-09-30',''),false);
  assert.equal(inReportRange({...row,receivedAt:null},'',''),true);
  assert.equal(inReportRange(row,'2026-10-02','2026-10-02','signedAt'),true);
});

test('declined delivery partition and weekly/state totals reconcile with filtered Signed',async()=>{
  const h=await partnerReportHarness(), r=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[]).rows[0];
  const rows=[{...r,name:'Awaiting',state:'AL',deliveryGroup:'awaiting' as const},{...r,name:'Sent',state:'AL'},
    {...r,name:'Declined',state:'NV',deliveryGroup:'declined' as const},
    {...r,name:'Lost',signed:'No' as const,statusKey:'dq',deliveryGroup:null},
    {...r,name:'Open',signed:'No' as const,statusKey:'esign_sent',deliveryGroup:null}];
  const s=summarizePartnerRows(rows);
  assert.equal(s.signed,3); assert.equal(s.awaitingDelivery+s.sentToFirm+s.declined,s.signed);
  assert.equal(s.inProgress,1);assert.equal(s.lost,1);assert.equal(s.signRate,3/5);
  assert.equal(groupPartnerRows(rows,'state').reduce((n,g)=>n+g.total,0),rows.length);
  assert.equal(groupPartnerRows(rows,'week')[0].key,'2026-09-28');
  assert.equal(groupPartnerRows(rows,'week')[0].signed,3);
});

test('evidence is firm/matter scoped; latest agent note and recorded durations never include sibling or foreign evidence',async()=>{
  const h=await partnerReportHarness(); h.lead.first_dialed_at=null;h.lead.mail_state='al';h.signature.state='unsigned';h.signature.statusKey='new';h.signature.status='New';h.claim.status='new';
  const c={id:'call1',firm_id:REPORT_FIRM,lead_id:h.lead.id,channel:'call',occurred_at:'2026-09-30T12:02:00Z',duration_sec:120};
  const n={firm_id:REPORT_FIRM,lead_id:h.lead.id,claim_id:h.claim.id,scope:'file',body:'Agent follow-up',created_at:'2026-10-03T12:00:00Z'};
  const evidence={calls:[c,{...c,id:'foreign',firm_id:'foreign',duration_sec:999}],notes:[n,{...n,claim_id:'sibling',body:'secret',created_at:'2026-10-04T12:00:00Z'}]};
  const row=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0];
  assert.equal(row.speedMinutes,2);assert.equal(row.callDurationSeconds,120);assert.equal(row.notes,'Agent follow-up');assert.equal(row.lastActivityAt,'2026-10-03T12:00:00Z');
  assert.equal(row.status,'New lead');assert.equal(row.state,'AL');
  const sibling={...h.claim,id:'other',campaign_id:'other'};
  const ambiguous=partnerReportData(h.config,[h.lead],[h.claim,sibling],h.signatures,[],evidence).rows[0];
  assert.equal(ambiguous.speedMinutes,null);assert.equal(ambiguous.callDurationSeconds,null);assert.equal(ambiguous.called,false);assert.equal(ambiguous.notes,n.body);
  h.lead.lawruler_created_at=null;h.lead.vendor_fields={sources:{lawruler:{LeadID:'100',CaseType:'INNO MVA',LeadCreated:'9/30/2026'}}};
  assert.equal(partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[],evidence).rows[0].speedMinutes,null);
});

test('all sort types keep unknowns last and export preserves exactly supplied filtered rows with safe multiline cells',async()=>{
  const h=await partnerReportHarness(),row=partnerReportData(h.config,[h.lead],[h.claim],h.signatures,[]).rows[0];
  const rows=[{...row,name:'First',speedMinutes:2},{...row,name:'Second',speedMinutes:10},{...row,name:'Unknown',speedMinutes:null}];
  assert.deepEqual(sortPartnerRows(rows,'speedMinutes','desc').map(r=>r.name),['Second','First','Unknown']);
  assert.deepEqual(sortPartnerRows(rows,'speedMinutes','asc').map(r=>r.name),['First','Second','Unknown']);
  const csv=partnerCsv([{...row,name:'=SUM(A1)',notes:'First line\n"quoted", next line'}]);
  assert.match(csv,/"'=SUM\(A1\)"/);assert.match(csv,/First line\n""quoted"", next line/);assert.ok(!csv.includes('Unknown'));
});

test('additional evidence failures fail the complete report, and queries remain scoped to authorized source leads',async()=>{
  const h=await partnerReportHarness();h.db.failOn=op=>op.table==='notes'?'read failed':null;
  await assert.rejects(()=>h.server.loadPartnerReport(h.db,h.config));
  for(const op of h.db.ops.filter(op=>['notes','communications','lead_activity','call_logs'].includes(op.table))){
    assert.ok(op.filters.some(([kind,col,value])=>kind==='eq'&&col==='firm_id'&&value===REPORT_FIRM));
    assert.ok(op.filters.some(([kind,col,value])=>kind==='in'&&col==='lead_id'&&value.includes(h.lead.id)));
  }
});
