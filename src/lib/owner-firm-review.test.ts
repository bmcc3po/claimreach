import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import ts from 'typescript';
import { NextRequest } from 'next/server';
import { FakeDb } from './test-fake-db';
import * as access from './firm-review-access';
const claimId='33333333-3333-4333-8333-333333333333', firmId='11111111-1111-4111-8111-111111111111', campaignId='22222222-2222-4222-8222-222222222222';
const claim={id:claimId,lead_id:'lead',firm_id:firmId,campaign_id:campaignId,status:'delivered',firm_sent_at:'2026-10-01',firm_send_result:'saved receipt'};
const lead={id:'lead',firm_id:firmId,claimant_name:'Fictional person',archived_at:null};
const db=new FakeDb({claims:[claim],leads:[lead],campaigns:[{id:campaignId,firm_id:firmId,name:'Other campaign'}],lead_activity:[]});
let role:string|null='owner';
function compile(file:string,mods:Record<string,any>){const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{target:9,module:1}}).outputText;const out:any={};new Function('require','exports',code)((k:string)=>{assert.ok(k in mods,k);return mods[k]},out);return out;}
const server=compile('firm-review-server.ts',{'@/lib/supabase-server':{},'./firm-review-access':access,'./intake-render':{},'./imported-packet':{},'./matter':{},'./mva-call/signing-matter':{},'./mva-call/esign':{},'./signed-docs':{},'./mva-call/client-signed':{},'./signature-report-loader':{loadSignatureReport:async()=>[{claimId,state:'signed'}]}});
const route=compile('../app/api/owner-firm-review/route.ts',{'next/server':require('next/server'),'next/cache':{revalidatePath(){}},'@/lib/supabase-server':{supabaseServer:async()=>db},'@/lib/gate':{gateUser:async()=>role?{id:'owner',role,name:'Owner'}:null},'@/lib/firm-review-access':access,'@/lib/firm-review-server':server,'@/lib/signed-decline-workflow':{DeclineError:class extends Error{}},'@/lib/signed-decline':require('./signed-decline'),'@/lib/alerts':{invalidateAlertCache(){}}});
const request=(body:any,origin='https://claimreach.test')=>new NextRequest('https://claimreach.test/api/owner-firm-review',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 const before=JSON.stringify(claim);
 for(const denied of [null,'agent','admin','firm']){role=denied;assert.equal((await route.POST(request({claim:claimId,action:'accepted'}))).status,403);}
 role='owner';
 assert.equal((await route.POST(request({claim:claimId,action:'accepted'},'https://hostile.test'))).status,403);
 for(const bad of [{claim:claimId,action:'turned_down',explanation:'  '},{claim:claimId,action:'received'},{claim:'x',action:'accepted'}])assert.equal((await route.POST(request(bad))).status,400);
 assert.equal((await route.POST(request({claim:'44444444-4444-4444-8444-444444444444',action:'accepted'}))).status,404);
 for(const patch of [{firm_id:'foreign'}, {archived_at:'2026-10-02'}, {claimant_name:'TEST record'}]){
  const old={...lead};Object.assign(lead,patch);assert.equal((await route.POST(request({claim:claimId,action:'accepted'}))).status,409);Object.assign(lead,old);
 }
 claim.status='new';assert.equal((await route.POST(request({claim:claimId,action:'accepted'}))).status,409);claim.status='delivered';
 assert.equal(db.tables.lead_activity.length,0);
 for(const action of ['accepted','turned_down']){
  const r=await route.POST(request({claim:claimId,action,explanation:'Fictional treatment gap.'}));assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
 }
 assert.equal(db.tables.lead_activity.length,2);
 assert.equal(JSON.stringify(claim),before,'decision must never rewrite signing/delivery evidence or the clock');
 assert.ok(db.ops.filter(o=>o.kind!=='select').every(o=>o.table==='lead_activity'&&o.kind==='insert'));
 assert.equal(db.tables.lead_activity[1].meta.recorded_by_owner,true);
 assert.equal(db.tables.lead_activity[1].actor,'owner');
 db.tables.lead_activity.push({id:'foreign',lead_id:'lead',firm_id:'other',meta:{event:access.REVIEW_EVENT,claim_id:claimId,campaign_id:campaignId,action:'accepted'}});
 const get=await route.GET(new NextRequest('https://claimreach.test/api/owner-firm-review?claim='+claimId));
 assert.equal((await get.json()).history.length,2,'foreign review excluded');
 db.failOn=o=>o.kind==='insert'?'save failed':null;
 const failed=await route.POST(request({claim:claimId,action:'accepted'}));assert.equal(failed.status,503);assert.equal((await failed.json()).ok,undefined);
 console.log('Owner firm decision: role, CSRF, required reason, firm/matter/archive scope, append-only history and write failures passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
