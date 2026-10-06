import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import { outboundContact } from './outbound-contact';
import { normPhone } from './comms';
import type { GatedUser } from './gate';

const actor = { id:'agent', name:'TEST Agent', firmId:null, can:()=>true } as unknown as GatedUser;
function db() { return new FakeDb({leads:[{id:'own',firm_id:'firm',phone:'2025550101',perm_text:true,perm_call:true}],contact_points:[],justcall_accounts:[{firm_id:'foreign',api_key:'wrong',api_secret:'wrong',justcall_number:'+12025550103'}, {firm_id:'firm',api_key:'synthetic',api_secret:'synthetic',justcall_number:'+12025550102'}],communications:[],lead_activity:[]}); }
function route(file:string, database:FakeDb, denied=false) {
  let sends=0;
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../app/api',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mods:any={
    'next/server':{NextResponse:{json:(body:any,opts:any={})=>({body,status:opts.status||200})}},
    '@/lib/supabase-server':{supabaseServer:async()=>database,supabaseAdmin:()=>database},
    '@/lib/mva-call/server':{requireStaff:async()=>denied?null:actor,LEAD_CALL_COLS:'id',fmtPhone:(v:string)=>v},
    '@/lib/outbound-contact':{outboundContact}, '@/lib/comms':{normPhone}, '@/lib/audit':{recordAudit:async()=>{}},
    '@/lib/justcall-send':{toE164:(v:string)=>'+1'+v,sendJustCallSms:async()=>{sends++;return {ok:true,data:{id:'fake'}}}},
  };
  const m:any={}; new Function('require','exports','fetch','process',code)((id:string)=>{if(!mods[id])throw Error(id);return mods[id]},m,async(_url:string,opts:any)=>{sends++;const body=JSON.parse(opts.body);assert.equal(body.contact_number,'+12025550101');assert.equal(opts.headers.Authorization,'synthetic:synthetic');return {ok:true,json:async()=>({id:'fake'})}},{env:{JUSTCALL_API_KEY:'synthetic',JUSTCALL_API_SECRET:'synthetic',JUSTCALL_DEFAULT_FROM:'+12025550102'}});
  return {sends:()=>sends,post:(body:any,origin='https://claimreach.test')=>m.POST({url:'https://claimreach.test/api/'+file,headers:new Headers({origin}),json:async()=>body})};
}
async function main(){
  let d=db(); assert.equal((await outboundContact(d,{...actor,can:()=>false},'own',null,'Text')).status,403);assert.equal(d.ops.length,0);
  assert.equal((await outboundContact(d,actor,'foreign',null,'Text')).status,404);
  d=db();d.failOn=o=>o.table==='leads'?'read error':null; assert.equal((await outboundContact(d,actor,'own',null,'Text')).status,503);
  for(const mutation of [{archived_at:'2026-10-06'}, {perm_text:false}, {comms_monitored:true,comms_safe_channels:['Call']}]) {d=db();Object.assign(d.tables.leads[0],mutation);assert.equal((await outboundContact(d,actor,'own',null,'Text')).status,409)}
  d=db(); assert.equal((await outboundContact(d,actor,'own','2025550199','Text')).status,409);
  d.tables.contact_points.push({lead_id:'own',kind:'mobile',status:'opted_out',value:'+1 (202) 555-0101'});assert.equal((await outboundContact(d,actor,'own',null,'Text')).status,409);
  d.failOn=o=>o.table==='contact_points'?'read error':null;assert.equal((await outboundContact(d,actor,'own',null,'Text')).status,503);
  d=db(); assert.equal((await outboundContact(d,actor,'own','(202) 555-0101','Text')).to,'+12025550101');
  for(const [file,op] of [['justcall/route.ts',{action:'text'}],['justcall/action/route.ts',{op:'sms'}]] as const){
    const body={...op,lead_id:'own',to:'2025550101',body:'Synthetic offline test'};
    let f=route(file,db(),true);assert.ok((await f.post(body)).status>=400);assert.equal(f.sends(),0);
    f=route(file,db());assert.equal((await f.post(body,'https://foreign.test')).status,403);assert.equal(f.sends(),0);
    assert.equal((await f.post({...body,lead_id:'foreign'})).status,404);assert.equal(f.sends(),0);
    assert.equal((await f.post({...body,to:'2025550199'})).status,409);assert.equal(f.sends(),0);
    d=db();d.tables.leads[0].perm_text=false;f=route(file,d);assert.equal((await f.post(body)).status,409);assert.equal(f.sends(),0);
    d=db();f=route(file,d);assert.equal((await f.post(body)).status,200);assert.equal(f.sends(),1);
    const written=[...d.tables.communications,...d.tables.lead_activity];assert.equal(written.length,1);assert.equal(written[0].lead_id,'own');assert.equal(written[0].firm_id,'firm');
    d=db();d.failOn=o=>['communications','lead_activity'].includes(o.table)?'history unavailable':null;f=route(file,d);
    assert.equal((await f.post(body)).status,503);assert.equal(f.sends(),1,'history failure must never retry the provider');
  }
  const f=route('calls/text/route.ts',db(),true);assert.equal((await f.post({lead_id:'own',body:'test'})).status,401);assert.equal(f.sends(),0);
  d=db();const current=route('calls/text/route.ts',d);assert.equal((await current.post({lead_id:'own',body:'Synthetic current intake'})).status,200);
  assert.equal(current.sends(),1);assert.equal(d.tables.communications[0].lead_id,'own');
  d=db();d.tables.leads[0].archived_at='2026-10-06';const archived=route('calls/text/route.ts',d);
  assert.equal((await archived.post({lead_id:'own',body:'Never sent'})).status,409);assert.equal(archived.sends(),0);
  console.log('Outbound contact and legacy routes: scope, permission, opt-out, destination, failure, single-send and exact-file history passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
