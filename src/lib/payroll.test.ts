import assert from 'node:assert/strict';
import {test} from 'node:test';
import {payrollReport,payrollTotals,payrollCsv,payrollPeriod,defaultPayrollEnd,validDay,processedLine,type PayrollFile,type PayrollNote,type PayrollLine} from './payroll';
import {payrollClosePayload,payrollView,type PayrollData} from './payroll-server';
const now='2026-10-07T18:00:00.000Z',end='2026-10-04';
function file(id='c',patch:Partial<PayrollFile>={}):PayrollFile{return{claimId:id,leadId:'l'+id,firmId:'f',campaignId:'inno',campaign:'INNO MVA',firm:'Firm',leadNo:'TMP-'+id,name:id,href:'/file/'+id,state:'signed',detail:'Verified',signedAt:'2026-10-02T18:00:00Z',deliveredAt:null,returnEndsAt:null,packet:'complete',status:'Signed',agent:'Agent A',agentId:'a',archived:false,test:false,ownerSent:false,...patch};}
const note=(kind:PayrollNote['kind'],data:any,claim='c',id='n'):PayrollNote=>({id,kind,data,claim_id:claim,firm_id:'f',created_at:'2026-10-06T18:00:00Z'});
const line=(kind:PayrollLine['kind'],id='positive',claim='c',patch:Partial<PayrollLine>={}):PayrollLine=>({id,kind,claim_id:claim,firm_id:'f',campaign_id:'inno',period_start:'2026-09-21',source_line_id:null,run_id:'prior',data:{name:'Original name',leadNo:'TMP-'+claim,href:'/file/'+claim,agent:'Originally paid A',agentId:'a',signedDay:'2026-09-25'},...patch});
test('Monday–Sunday Pacific cohort and Wednesday cutoff; no seven-day billing delay',()=>{
  assert.deepEqual(payrollPeriod(end),{start:'2026-09-28',end,cutoff:'2026-10-07'});
  assert.equal(defaultPayrollEnd(now),end);assert.equal(defaultPayrollEnd('2026-10-05T06:30:00Z'),'2026-09-27');
  assert.equal(validDay('2026-02-31'),false);assert.throws(()=>payrollPeriod('2026-10-05'));
  const r=payrollReport([file('s',{signedAt:'2026-10-05T06:59:59Z',deliveredAt:'2026-10-07T16:00:00Z',returnEndsAt:'2026-10-14T16:00:00Z'}),file('outside',{signedAt:'2026-10-05T07:00:00Z'})],[],[],end,now);
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].bill,true);assert.equal(r.rows[0].pay,true);
});
test('five exclusive groups; signed DQ or attorney hold earns nothing',()=>{
  const r=payrollReport([file('waiting'),file('sent',{ownerSent:true}),file('hold'),file('dq',{disqualified:true}),file('reject',{ownerSent:true,decisionKey:'turned_down',decisionAt:now})],[note('attorney_hold',{reason:'Ask attorney'},'hold')],[],end,now);
  assert.deepEqual(payrollTotals(r).groups,{waiting:1,sent:1,hold:1,dq:1,rejected:1});
  assert.deepEqual(r.rows.filter(r=>r.bill).map(r=>r.claimId),['sent']);assert.equal(r.adjustments.length,0);
});
test('commission names the credited agent, not the combined intake, signing and assignment display',()=>{
  const r=payrollReport([file('c',{ownerSent:true,agent:'Intake: Agent A · Agreement: Agent B · Assigned: Agent C',agentName:'Agent A'})],[],[],end,now);
  assert.equal(r.rows[0].creditedAgent,'Agent A');assert.equal(r.rows[0].creditedAgentId,'a');
});
test('older hold release carries separately and cannot bill twice',()=>{
  const f=file('c',{signedAt:'2026-09-25T12:00:00Z',ownerSent:true});
  const held=note('attorney_hold',{reason:'Unusual facts'}),release={...note('attorney_release',{reason:'Attorney agreed'},'c','new'),created_at:'2026-10-07T12:00:00Z'};
  assert.equal(payrollReport([f],[held],[],end,now).carried.length,0);
  const r=payrollReport([f],[held,release],[],end,now);assert.equal(r.rows.length,0);assert.equal(r.carried.length,1);
  assert.equal(payrollReport([f],[held,release],[line('billing'),line('commission','pay')],end,now).carried.length,0);
});
test('prior-period rejection credits only billed side, and clawback keeps originally paid agent',()=>{
  const f=file('c',{signedAt:'2026-09-25T12:00:00Z',ownerSent:true,decisionKey:'turned_down',decisionAt:'2026-10-06T12:00:00Z',firmReason:'Treatment gap',agent:'New agent',agentId:'b'});
  assert.equal(payrollReport([f],[],[],end,now).adjustments.length,0);
  assert.equal(payrollReport([f],[],[],end,now).rejectionReview.length,1);
  assert.deepEqual(payrollReport([f],[],[line('billing')],end,now).adjustments.map(a=>a.kind),['firm_credit']);
  const r=payrollReport([f],[],[line('commission')],end,now);assert.equal(r.adjustments[0].kind,'clawback');assert.equal(r.adjustments[0].agent,'Originally paid A');
  assert.equal(payrollReport([f],[],[line('billing'),line('commission','pay')],end,now).adjustments.length,2);
});
test('before-cutoff rejection is excluded; recorded reversal cannot repeat; unpaid correction suppresses clawback',()=>{
  const f=file('c',{ownerSent:true,decisionKey:'turned_down',decisionAt:'2026-10-07T12:00:00Z'});
  assert.equal(payrollTotals(payrollReport([f],[],[],end,now)).pay,0);
  const l=line('commission');const n=note('reconcile',{line_id:l.id,processed:false,reason:'Wave mismatch'});
  assert.equal(processedLine(l,[n]),false);assert.equal(payrollReport([f],[n],[l],end,now).adjustments.length,0);
  assert.equal(payrollReport([f],[],[l,line('clawback','undo','c',{source_line_id:l.id})],end,now).adjustments.length,0);
  assert.equal(payrollReport([{...f,decisionAt:'2026-10-08T12:00:00Z'}],[],[l],end,now).adjustments.length,0);
});
test('firm and sibling evidence cannot credit another matter',()=>{
  const f=file('c',{ownerSent:true,decisionKey:'turned_down',decisionAt:now});
  assert.equal(payrollReport([f],[],[line('commission','wrong','c',{firm_id:'other'}),line('billing','sibling','other')],end,now).adjustments.length,0);
  const r=payrollReport([file('c',{ownerSent:true})],[{...note('attorney_hold',{reason:'Other firm'}),firm_id:'other'},note('attorney_hold',{reason:'Other file'},'other')],[],end,now);
  assert.equal(r.rows[0].bill,true);
});
test('archived/tests stay out; archive cannot hide an existing clawback',()=>{
  const r=payrollReport([file('test',{test:true}),file('archive',{archived:true}),file('real')],[],[],end,now);assert.equal(r.rows.length,1);
  const f=file('c',{archived:true,ownerSent:true,decisionKey:'turned_down',decisionAt:now});
  assert.equal(payrollReport([f],[],[line('commission')],end,now).adjustments.length,1);
});
test('unknown signature date is never import date; owner date is separate and cannot replace provider date',()=>{
  const f=file('c',{signedAt:null,ownerSent:true});assert.equal(payrollReport([f],[],[],end,now).undated.length,1);
  const n=note('signature_date',{day:'2026-10-02'});assert.equal(payrollReport([f],[n],[],end,now).rows[0].bill,true);
  assert.equal(payrollReport([file('c',{signedAt:'2026-10-05T12:00:00Z'})],[n],[],end,now).rows.length,0);
});
test('unknown agent blocks commission only; current assignment does not receive old clawback',()=>{
  const f=file('c',{ownerSent:true,agentId:null});let r=payrollReport([f],[],[],end,now);assert.equal(r.rows[0].bill,true);assert.equal(r.rows[0].pay,false);
  r=payrollReport([f],[note('agent_credit',{agent_id:'a',agent_name:'Agent A'})],[],end,now);assert.equal(r.rows[0].pay,true);
});
test('closing snapshots remain unchanged after later file decisions and payments are generated once',()=>{
  const data:PayrollData={files:[file('c',{ownerSent:true})],notes:[],lines:[],runs:[],firms:[{id:'f',name:'Firm'}],agents:[]};
  const payload=payrollClosePayload(data,end,now);assert.equal(payload.p_runs.length,1);assert.equal(payload.p_lines.length,2);
  data.runs=[{...payload.p_runs[0],closed_at:now}];data.files[0].decisionKey='turned_down';data.files[0].decisionAt='2026-10-08T12:00:00Z';
  assert.equal(payrollView(data,end,'2026-10-09T12:00:00Z').sections[0].report.rows[0].group,'sent');
  assert.equal(payrollClosePayload(data,end,now).p_runs.length,0);
});
test('CSV includes prior-period source and prevents spreadsheet formula injection',()=>{
  const f=file('c',{name:'=HYPERLINK("evil")',ownerSent:true});const csv=payrollCsv(payrollReport([f],[],[],end,now));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('2026-09-28'));
});
