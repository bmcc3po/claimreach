import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
import {FakeDb} from './test-fake-db';import * as registry from './current-status';import {ownerConfirmedDelivery} from './owner-file-confirmation';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function compile(file:string,deps:any){const out:any={};const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)((key:string)=>{assert.ok(deps[key],key);return deps[key];},out);return out;}
function harness(){
 const claim={id:id(1),lead_id:id(2),firm_id:id(3),campaign_id:id(4),status:'contacting',updated_at:'2026-10-22T12:00:00Z'};
 const session=new FakeDb({claims:[{...claim}]}),db:any=new FakeDb({claims:[{...claim}],leads:[{id:id(2),firm_id:id(3)}],esign_submissions:[]});
 const state={signedIn:true,view:true,edit:true,scope:true,netfly:false,role:'agent',rpc:0,race:false};
 const actor={id:id(5),get role(){return state.role;},can:(perm:string)=>perm==='leads.view'?state.view:state.edit};
 db.rpc=async(_name:string,args:any)=>{state.rpc++;if(state.race)return {error:{message:'stale claim'}};Object.assign(db.tables.claims[0],{status:args.p_status,status_note:args.p_note,updated_at:'2026-10-22T12:01:00Z'});return {data:db.tables.claims[0]};};
 const server=compile('current-status-server.ts',{
 './supabase-server':{supabaseServer:async()=>session,supabaseAdmin:()=>db},'./mva-call/server':{requireStaff:async()=>state.signedIn?actor:null},
 './netfly-server':{netflyContext:async()=>state.netfly?{actor}:null,netflyMatter:async()=>({lead:db.tables.leads[0],claim})},
 './intake-firm-scope':{intakeFirmScope:async()=>state.scope?{ok:true}:{ok:false,status:403,error:'Denied'}},'./current-status':registry,'./owner-file-confirmation':{ownerConfirmedDelivery}});
 const route=compile('../app/api/current-status/route.ts',{'next/server':{NextResponse:{json:(body:any,opts:any={})=>({body,status:opts.status||200})}},'@/lib/current-status':registry,'@/lib/current-status-server':server});
 const body={lead_id:claim.lead_id,claim_id:claim.id,expected_updated_at:claim.updated_at,status:'dq',category:'contact',descriptor:'wrong_number',note:'The caller confirmed the wrong number.'};
 return {state,session,db,body,post:(patch:any={})=>route.POST({json:async()=>({...body,...patch})})};
}
(async()=>{
 let h=harness();assert.equal((await h.post()).status,200);assert.equal(h.state.rpc,1);assert.equal(h.db.tables.claims[0].status,'dq');
 for(const flag of ['signedIn','view','edit','scope'] as const){h=harness();h.state[flag]=false;assert.ok([401,403].includes((await h.post()).status),flag);assert.equal(h.state.rpc,0);}
 h=harness();h.session.tables.claims=[];assert.equal((await h.post()).status,404);assert.equal(h.db.ops.length,0,'invisible matter never reaches privileged read');
 h.state.netfly=true;assert.equal((await h.post()).status,200,'separately authorized NETFLY scope');
 h=harness();h.db.tables.claims[0].firm_id=id(99);assert.equal((await h.post()).status,409);assert.equal(h.state.rpc,0,'assignment changes fail closed');
 h=harness();assert.equal((await h.post({expected_updated_at:'old'})).status,409);assert.equal(h.state.rpc,0);
 h=harness();h.state.race=true;assert.equal((await h.post()).status,409,'database catches race after evidence read');
 for(const patch of [{note:''},{note:'First sentence. Second sentence.'},{descriptor:'unknown'},{status:'signed_grievous',category:null,descriptor:null},{status:'delivered',category:null,descriptor:null},{status:'bmc_rejected',category:'decision',descriptor:'other'}]){h=harness();assert.ok([400,403,409].includes((await h.post(patch)).status));assert.equal(h.state.rpc,0);}
 console.log('Current Status API: permissions, RLS-before-service, exact NETFLY scope, assignment race, stale save, reasons/notes and signature/delivery evidence checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
