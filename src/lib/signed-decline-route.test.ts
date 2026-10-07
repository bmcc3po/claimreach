import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import ts from 'typescript';
import { NextRequest } from 'next/server';
import { FakeDb } from './test-fake-db';
import * as decline from './signed-decline';
import * as notification from './signed-decline-notification';
import * as access from './firm-review-access';
import { setClaimStatusForLeads } from './claim-status';
import { DEFAULT_STATUSES } from './statuses';

const id = '33333333-3333-4333-8333-333333333333';
const version = '2026-10-01T12:00:00Z';
const claim = { id, lead_id:'lead', firm_id:'firm', campaign_id:'inno', claim_type:'mva', status:'signed_qa', updated_at:version, answers:{ mva_call:{ story:'Preserved' } } };
const db = new FakeDb({ claims:[claim], leads:[{ id:'lead', firm_id:'firm', claimant_name:'Fictional Client', lead_no:'TEST-1', archived_at:null }],
  campaigns:[{ id:'inno', firm_id:'firm', name:'INNO MVA', firm_email:'firm@example.test' }], statuses:DEFAULT_STATUSES, esign_submissions:[], lead_activity:[] });
let role: string | null = 'owner', capability = true, firmId: string | null = null, signed = true, sends = 0;
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../app/api/signed-decline/route.ts'),'utf8'), { compilerOptions:{ target:9, module:1 } }).outputText;
const mods: Record<string, any> = {
  'next/server':require('next/server'), 'next/cache':{ revalidatePath(){} }, '@/lib/supabase-server':{ supabaseServer:async()=>db },
  '@/lib/gate':{ gateUser:async()=>role ? { id:'owner', role, firmId, name:'Owner', can:()=>capability } : null },
  '@/lib/firm-review-access':access, '@/lib/signed-decline':decline, '@/lib/alerts':{ invalidateAlertCache(){} },
  '@/lib/signature-report-loader':{ loadSignatureReport:async()=>[{ claimId:id, state:signed?'signed':'verify', agent:'Intake: Test Agent · Assigned: Other', agentId:'agent', agentName:'Test Agent' }] },
  '@/lib/claim-status':{ setClaimStatusForLeads:(o:any,d:any)=>setClaimStatusForLeads(o,{...d,audit:async()=>{}}) },
  '@/lib/signed-decline-notification':{ ...notification, notifySignedDecline:(c:any,retry:boolean)=>notification.notifySignedDecline(c,retry,async()=>{ sends++;return {ok:true,providerId:'test'}; }) },
};
const route:any={};new Function('require','exports',code)((k:string)=>{assert.ok(k in mods,k);return mods[k];},route);
const request=(body:any,origin='https://claimreach.test')=>new NextRequest('https://claimreach.test/api/signed-decline',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const body = { claim:id, confirm:true, action:'decline', reason:'Fictional treatment gap', version, to:'firm@example.test' };
(async()=>{
  for(const r of [null,'agent','qa','manager','firm']){role=r;assert.equal((await route.POST(request(body))).status,403);}
  role='owner'; capability=false;assert.equal((await route.POST(request(body))).status,403);capability=true;
  firmId='other';assert.equal((await route.POST(request(body))).status,404);firmId=null;
  assert.equal((await route.POST(request(body,'https://hostile.test'))).status,403);
  for(const b of [{...body,claim:'bad'}, {...body,reason:' '}, {...body,confirm:false}])assert.equal((await route.POST(request(b))).status,400);
  for(const b of [{...body,version:'stale'}, {...body,to:'elsewhere@example.test'}])assert.equal((await route.POST(request(b))).status,409);
  db.tables.leads[0].archived_at='yesterday';assert.equal((await route.POST(request(body))).status,409);db.tables.leads[0].archived_at=null;
  db.tables.campaigns[0].firm_id='other';assert.equal((await route.POST(request(body))).status,409);db.tables.campaigns[0].firm_id='firm';
  db.tables.campaigns[0].name='NETFLY';assert.equal((await route.POST(request(body))).status,409);db.tables.campaigns[0].name='INNO MVA';
  signed=false;assert.equal((await route.POST(request(body))).status,409);signed=true;
  assert.equal(sends,0);assert.equal(claim.status,'signed_qa');
  db.failOn=o=>o.kind==='update'&&o.table==='claims'?'db failed':null;
  assert.equal((await route.POST(request(body))).status,409);assert.equal(sends,0);db.failOn=()=>null;
  const r=await route.POST(request(body));assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.notification.state,'sent');
  assert.equal(saved.decline.agentId,'agent');assert.equal(saved.decline.agentName,'Test Agent');
  assert.equal(claim.status,'signed_dropped');assert.equal(sends,1);assert.equal(db.tables.leads[0].qa_pending,false);
  await route.POST(request(body));assert.equal(sends,1);
  const read=await route.GET(new NextRequest('https://claimreach.test/api/signed-decline?claim='+id));
  const view=await read.json();assert.equal(view.notification.state,'sent');assert.equal(view.notification.html,undefined);
  assert.deepEqual(decline.preserveDeclineEvidence({signed_decline:{id:'forged'},story:'new'},{}),{story:'new'});
  assert.equal(decline.preserveDeclineEvidence({},db.tables.claims[0].answers).signed_decline.id,saved.decline.id);
  console.log('Signed decline API: role, capability, CSRF, signature proof, firm/campaign/archive scope, stale version/recipient, write failure, terminal status and duplicate send checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
