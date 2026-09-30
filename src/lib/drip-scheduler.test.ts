import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import * as scheduler from './drip-scheduler';
import * as dispatch from './drip-dispatch';
import * as rules from './drip-rules';

const now=new Date('2026-09-29T12:00:00Z');
function fixture(){
 const db=new FakeDb({drip_rules:[{id:'rule',campaign:null,active:true,channel:'call_reminder',every_days:3}],
  drip_enrollments:[{id:'enrollment',rule_id:'rule',lead_id:'lead',firm_id:'firm',active:true,next_due:'2026-01-01'}],
  leads:[{id:'lead',firm_id:'firm',claimant_name:'Synthetic'}]});
 const rpcs:any[]=[];
 const rpc=async(name:string,args:any)=>{rpcs.push({name,args});return {data:name==='cr_check_drip_enrollment'?{allowed:true,claim_id:'claim'}:{fired:true},error:null};};
 return Object.assign(db,{rpc,rpcs});
}
function route(db:any,cron:boolean,enabled=true,user:any={role:'owner',can:()=>true}){
 const modules:Record<string,any>={
  'next/server':{NextResponse:{json:(body:any,opts:any={})=>({body,status:opts.status??200})}},
  '@/lib/supabase-server':{supabaseServer:async()=>db,supabaseAdmin:()=>db},
  '@/lib/drip-scheduler':scheduler,'@/lib/drip-rules':rules,
  '@/lib/gate':{gateUser:async()=>user},
  '@/lib/drip-dispatch':{...dispatch,dripDispatchEnabled:()=>enabled},
 };
 const file=cron?'src/app/api/cron/drips/route.ts':'src/app/api/drip/route.ts';
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};new Function('require','exports','process',code)((name:string)=>{assert.ok(name in modules,name);return modules[name];},exports,{env:{CRON_SECRET:'synthetic'}});return exports;
}
const request=(cron:boolean)=>cron?new Request('https://example.invalid/api/cron/drips',{headers:{'x-cron-secret':'synthetic'}}):{url:'https://example.invalid/api/drip',json:async()=>({op:'process'})};
let count=0;const test=async(name:string,fn:()=>any)=>{await fn();count++;console.log('ok',name);};
(async()=>{
 await test('due listing uses RLS base tables, active generic rules, due date and visible firm',async()=>{
  const db=fixture();db.tables.drip_rules.push({id:'m6',campaign:'motel6',active:true},{id:'off',campaign:null,active:false});
  db.tables.drip_enrollments.push(...['m6','off'].map(rule_id=>({id:rule_id,rule_id,lead_id:'lead',firm_id:'firm',active:true,next_due:'2020-01-01'})),
   {id:'future',rule_id:'rule',lead_id:'lead',firm_id:'firm',active:true,next_due:'2027-01-01'},
   {id:'hidden',rule_id:'rule',lead_id:'hidden',firm_id:'firm',active:true,next_due:'2020-01-01'},
   {id:'wrong-firm',rule_id:'rule',lead_id:'lead',firm_id:'other',active:true,next_due:'2020-01-01'});
  assert.deepEqual((await scheduler.loadDueDrips(db,200,now)).map(x=>x.enrollment_id),['enrollment']);
  assert.ok(db.ops.every(op=>op.table!=='drips_due'&&op.kind==='select'));
 });
 for(const table of ['drip_rules','drip_enrollments','leads'])await test(`${table} read error is not an empty successful run`,async()=>{
  for(const cron of [true,false]){const db=fixture();db.failOn=op=>op.table===table?'offline':null;const r=route(db,cron);const result=cron?await r.GET(request(true)):await r.POST(request(false));assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.equal(db.rpcs.length,0);}
 });
 await test('inspection error prevents mutation and returns an unsuccessful run',async()=>{
  const db=fixture();db.rpc=async(name,args)=>{db.rpcs.push({name,args});return {data:null,error:{message:'offline'}} as any;};
  const result=await scheduler.processDueDrips(db,await scheduler.loadDueDrips(db,200,now));assert.equal(result.ok,false);assert.equal(result.fired,0);assert.equal(result.errors.length,1);assert.equal(db.rpcs.length,1);
 });
 await test('uncertain reminder commit is never counted as fired or blindly retried',async()=>{
  const db=fixture();db.rpc=async(name,args)=>{db.rpcs.push({name,args});return name==='cr_check_drip_enrollment'?{data:{allowed:true},error:null}:{data:null,error:{message:'connection lost'}} as any;};
  const result=await scheduler.processDueDrips(db,await scheduler.loadDueDrips(db,200,now));assert.equal(result.ok,false);assert.equal(result.fired,0);assert.equal(db.rpcs.length,2);
 });
 await test('held or already processed reminder remains uncounted; no direct note/date writes',async()=>{
  const db=fixture();db.rpc=async(name,args)=>{db.rpcs.push({name,args});return {data:name==='cr_check_drip_enrollment'?{allowed:true}:{fired:false,reason:'already processed'},error:null} as any;};
  const result=await scheduler.processDueDrips(db,await scheduler.loadDueDrips(db,200,now));assert.equal(result.ok,true);assert.equal(result.fired,0);assert.equal(result.held.length,1);assert.ok(db.ops.every(op=>op.kind==='select'));
 });
 await test('SMS and email never reach reminder RPC or any transport even if eligibility stub allows',async()=>{
  for(const channel of ['sms','email']){const db=fixture();db.tables.drip_rules[0].channel=channel;const result=await scheduler.processDueDrips(db,await scheduler.loadDueDrips(db,200,now));assert.equal(result.fired,0);assert.equal(result.held.length,1);assert.equal(db.rpcs.length,1);}
 });
 await test('manual and cron use same atomic reminder operation with expected date',async()=>{
  for(const cron of [true,false]){const db=fixture(),r=route(db,cron);const result=cron?await r.GET(request(true)):await r.POST(request(false));assert.equal(result.body.fired,1);assert.equal(db.rpcs[1].name,'cr_fire_drip_reminder');assert.deepEqual(db.rpcs[1].args,{p_enrollment:'enrollment',p_expected_due:'2026-01-01'});}
 });
 await test('permanently held SMS backlog cannot starve later call reminders in either processor',async()=>{
  for(const cron of [true,false]){const db=fixture();db.tables.drip_rules.push({id:'sms',campaign:null,active:true,channel:'sms'});
   db.tables.drip_enrollments.push(...Array.from({length:600},(_,i)=>({id:`sms-${i}`,rule_id:'sms',lead_id:'lead',firm_id:'firm',active:true,next_due:'2020-01-01'})));
   const r=route(db,cron),result=cron?await r.GET(request(true)):await r.POST(request(false));
   assert.equal(result.body.fired,1);assert.equal(db.rpcs.length,2);assert.equal(result.body.batch.truncated,false);
   assert.ok(db.ops.some(op=>op.table==='drip_rules'&&op.filters.some(f=>f[1]==='channel'&&f[2]==='call_reminder')));
  }
 });
 await test('preview reports its cap instead of implying the entire queue was inspected',async()=>{
  const db=fixture();db.tables.drip_enrollments.push(...Array.from({length:201},(_,i)=>({...db.tables.drip_enrollments[0],id:`extra-${i}`})));
  const page=await scheduler.loadDueDripPage(db,2,now);assert.equal(page.rows.length,2);assert.equal(page.truncated,true);
  const result=await route(db,false).GET(new Request('https://example.invalid/api/drip'));assert.deepEqual(result.body.preview,{limit:200,truncated:true});assert.equal(result.body.due.length,200);
 });
 await test('editing an existing global rule preserves its firm and campaign scope',async()=>{
  const db=fixture();Object.assign(db.tables.drip_rules[0],{firm_id:null,campaign:'motel6',step_key:'original'});
  const result=await route(db,false,true,{role:'owner',firmId:'different',can:()=>true}).POST({json:async()=>({op:'save_rule',id:'rule',name:'Edited',channel:'call_reminder',every_days:3,campaign:'different'})});
  assert.equal(result.status,200);assert.equal(db.tables.drip_rules[0].firm_id,null);assert.equal(db.tables.drip_rules[0].campaign,'motel6');assert.equal(db.tables.drip_rules[0].step_key,'original');
 });
 await test('manual preview is gated and reports sender readiness without writes',async()=>{
  for(const user of [null,{role:'agent',can:()=>false},{role:'firm',can:()=>true}]){const db=fixture();const result=await route(db,false,true,user).GET(new Request('https://example.invalid/api/drip'));assert.ok([401,403].includes(result.status));assert.equal(db.ops.length,0);assert.equal(db.rpcs.length,0);}
  const db=fixture(),result=await route(db,false).GET(new Request('https://example.invalid/api/drip'));assert.equal(result.status,200);assert.equal(result.body.sending,'reminders_only');assert.equal(result.body.sms_ready,false);assert.ok(db.ops.every(op=>op.kind==='select'));assert.ok(db.rpcs.every(x=>x.name==='cr_check_drip_enrollment'));
 });
 await test('kill switch remains before all reads and writes in both dispatchers',async()=>{
  for(const cron of [true,false]){const db=fixture(),r=route(db,cron,false);const result=cron?await r.GET(request(true)):await r.POST(request(false));assert.equal(result.body.sending,'off');assert.equal(db.ops.length+db.rpcs.length,0);}
 });
 console.log(`${count} drip scheduler and real-route checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
