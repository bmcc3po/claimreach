import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {FakeDb} from '@/lib/test-fake-db';
import {payrollPeriod,defaultPayrollEnd,validDay} from '@/lib/payroll';
import {pacificDay} from '@/lib/packet-worklist';
import {uuid} from '@/lib/firm-review-access';
const claim='00000000-0000-4000-8000-000000000001',agent='00000000-0000-4000-8000-000000000002';
function harness(owner=true){
  const db=new FakeDb({claims:[{id:claim,lead_id:'l',firm_id:'f',campaign_id:'c',claim_type:'mva'}],app_users:[{id:agent,full_name:'Agent',role:'agent',active:true}],cr_payroll_notes:[]});
  let fail=false,loaded=0,rpc=0;
  (db as any).rpc=async()=>{rpc++;return fail?{error:{message:'conflict'}}:{data:1};};
  const modules:any={
    'next/server':{NextResponse:{json:(body:any,init:any={})=>({body,status:init.status||200})}},
    '@/lib/supabase-server':{supabaseServer:async()=>db},
    '@/lib/payroll-server':{payrollOwner:async()=>owner?{id:'owner'}:null,loadPayroll:async()=>{loaded++;return{};},payrollToken:async()=> 'current',
      payrollView:()=>({sections:[]}),payrollClosePayload:()=>({p_runs:[{snapshot:{undated:[],unresolved:[]}}],p_lines:[]})},
    '@/lib/payroll':{payrollPeriod,defaultPayrollEnd,validDay},'@/lib/packet-worklist':{pacificDay},'@/lib/firm-review-access':{uuid},
  };
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'route.ts'),'utf8'),{compilerOptions:{target:99,module:1}}).outputText;
  const out:any={};new Function('require','exports',code)((id:string)=>{assert.ok(id in modules,id);return modules[id];},out);
  const request=(body:any,origin='https://claimreach.com')=>({nextUrl:new URL('https://claimreach.com/api/payroll'),headers:new Headers({'origin':origin,'content-type':'application/json'}),text:async()=>JSON.stringify(body)});
  return {db,get:()=>out.GET(request({})),post:(body:any,origin?:string)=>out.POST(request(body,origin)),stats:()=>({loaded,rpc}),fail:()=>{fail=true;}};
}
async function main(){
  const denied=harness(false);assert.equal((await denied.get()).status,403);assert.equal((await denied.post({op:'close'})).status,403);assert.deepEqual(denied.stats(),{loaded:0,rpc:0});
  const h=harness();assert.equal((await h.post({op:'attorney_hold',claim,reason:'Ask attorney'},'https://other.test')).status,403);
  assert.equal((await h.post({op:'attorney_hold',claim,reason:'Ask attorney'})).status,200);
  assert.equal(h.db.tables.cr_payroll_notes[0].firm_id,'f');assert.equal(h.db.tables.cr_payroll_notes[0].data.reason,'Ask attorney');
  assert.equal((await h.post({op:'signature_date',claim,reason:'PDF',day:'2026-02-31'})).status,400);
  assert.equal((await h.post({op:'agent_credit',claim,reason:'Intake agent',agent})).status,200);
  assert.equal((await h.post({op:'reconcile',claim,reason:'Not paid',line:agent,processed:false})).status,404);
  const body={op:'close',end:'2025-09-28',confirmProcessed:true,token:'old'};
  assert.equal((await h.post(body)).status,409);assert.equal(h.stats().rpc,0,'stale preview never finalizes');
  assert.equal((await h.post({...body,token:'current',confirmProcessed:false})).status,400);
  h.fail();assert.equal((await h.post({...body,token:'current'})).status,409,'RPC failure must not show saved');
  const good=harness();assert.equal((await good.post({...body,token:'current'})).status,200);assert.equal(good.stats().rpc,1);
  assert.equal((await good.post({op:'close',end:'2099-01-04',confirmProcessed:true,token:'current'})).status,409);
  console.log('PASS payroll API: owner gate, CSRF, exact matter, input validation, stale preview, acknowledgement, future cutoff and transaction failure.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
