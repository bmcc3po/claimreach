// Offline integration boundary: real route, matter resolution and finalize
// helper; synthetic database/provider only. SQL locking is tested separately.
const fs0=require('node:fs'),path0=require('node:path'),vm0=require('node:vm');
let base=fs0.readFileSync(path0.join(__dirname,'signing-routes-test.cjs'),'utf8');
base=base.slice(0,base.indexOf("const send=route("));
const checks=String.raw`
const endpoint=route('calls/esign/reconcile');
const A='50000000-0000-4000-8000-000000000001';
let attempt,found,envelope,rpcCalls,lookups,finalizeError;
function setup(){
 world();rpcCalls=[];lookups=[];finalizeError=false;syncStatus='signed';
 attempt={id:A,parent_claim_id:C,parent_lead_id:L,target_claim_id:C,target_lead_id:L,firm_id:F,campaign_id:CA,template_id:'123',state:'uncertain',created_at:'2026-09-29T10:00:00Z',provider_started_at:'2026-09-29T10:00:01Z',send_context:{signer_name:'CHAT TESTER',phone:'2025550110'}};
 found={ok:true,data:{data:[{id:11,submission_id:55,external_id:A,role:'Client',embed_src:'https://docuseal.com/s/synthetic'}],pagination:{count:1}}};
 envelope={ok:true,data:{id:55,template:{id:123},submitters:[{id:11,external_id:A,role:'Client',embed_src:'https://docuseal.com/s/synthetic'},{id:12,role:'Intake'}]}};
 stubs['@/lib/docuseal'].getSubmittersByExternalId=async id=>{lookups.push(['find',id]);return found};
 stubs['@/lib/docuseal'].getSubmission=async id=>{lookups.push(['get',id]);return envelope};
 db.rpc=async(name,args)=>{rpcCalls.push({name,args});if(name==='cr_pending_esign_send')return{data:attempt,error:null};
  if(name==='cr_finalize_esign_send'){if(finalizeError)return{data:null,error:{code:'40001'}};db.tables.esign_submissions.push({id:'recovered',claim_id:C,lead_id:L,...args.p_submission});return{data:{id:'recovered'},error:null};}
  throw Error('Unexpected RPC '+name);
 };
}
const body=(extra={})=>({lead_id:L,claim_id:C,attempt_id:A,...extra});
const invoke=extra=>endpoint.POST(request(body(extra)));
const cases=[];function test(name,fn){cases.push([name,fn]);}
for(const deniedRole of ['agent','manager','admin','qa','firm_user'])test(deniedRole+' cannot reconcile or inspect provider',async()=>{
 setup();role=deniedRole;const r=await invoke();assert.ok([401,403].includes(r.status));assert.equal(rpcCalls.length,0);assert.equal(lookups.length,0);
});
test('missing or foreign matter rejected before trusted recovery',async()=>{setup();const r=await invoke({claim_id:B});assert.ok(r.status>=400);assert.equal(rpcCalls.length,0);assert.equal(lookups.length,0)});
test('stale attempt ID rejected before provider',async()=>{setup();const r=await invoke({attempt_id:'stale'});assert.equal(r.status,409);assert.equal(lookups.length,0)});
test('reserved attempt never released for its age',async()=>{setup();attempt.state='reserved';attempt.provider_started_at=null;const r=await invoke();assert.equal(r.status,409);assert.equal(lookups.length,0)});
test('unreadable reservation fails closed',async()=>{setup();db.rpc=async()=>{throw Error('offline')};const r=await invoke();assert.equal(r.status,503);assert.equal(lookups.length,0)});
test('empty provider search does not release or resend',async()=>{setup();found.data.data=[];found.data.pagination.count=0;const r=await invoke();assert.equal(r.status,409);assert.match(r.body.error,/empty search/);assert.equal(db.tables.esign_submissions.length,0)});
test('multiple provider matches remain held',async()=>{setup();found.data.data.push({...found.data.data[0],id:22,submission_id:66});const r=await invoke();assert.equal(r.status,409);assert.equal(lookups.length,1)});
test('pagination indicating more matches remains held',async()=>{setup();found.data.pagination.count=2;const r=await invoke();assert.equal(r.status,409)});
test('wrong external ID cannot be adopted',async()=>{setup();found.data.data[0].external_id='other';const r=await invoke();assert.equal(r.status,409);assert.equal(lookups.length,1)});
test('wrong template cannot be adopted',async()=>{setup();envelope.data.template.id=999;const r=await invoke();assert.equal(r.status,409);assert.equal(db.tables.esign_submissions.length,0)});
test('same submitter ID with wrong external ID remains held',async()=>{setup();envelope.data.submitters[0].external_id='other';const r=await invoke();assert.equal(r.status,409)});
test('different provider submission is rejected',async()=>{setup();envelope.data.id=999;const r=await invoke();assert.equal(r.status,409)});
test('missing office signer remains held',async()=>{setup();envelope.data.submitters.pop();const r=await invoke();assert.equal(r.status,409)});
test('inaccessible target cannot be linked by privileged client',async()=>{setup();attempt.target_lead_id='unreadable';const r=await invoke();assert.equal(r.status,409);assert.equal(lookups.length,0)});
test('changed target campaign remains held',async()=>{setup();attempt.campaign_id='different';const r=await invoke();assert.equal(r.status,409);assert.equal(lookups.length,0)});
test('provider outage remains held without exposing provider details',async()=>{setup();found={ok:false,error:'secret diagnostics'};const r=await invoke();assert.equal(r.status,502);assert.ok(!JSON.stringify(r).includes('secret diagnostics'))});
test('database finalization failure is not reported recovered',async()=>{setup();finalizeError=true;const r=await invoke();assert.equal(r.status,409);assert.equal(r.body.recovered,undefined);assert.equal(audit.length,0)});
test('documented Cloud slug response recovers without embed_src',async()=>{setup();delete found.data.data[0].embed_src;delete envelope.data.submitters[0].embed_src;found.data.data[0].slug='syntheticSlug';const r=await invoke();assert.equal(r.status,200);assert.equal(rpcCalls.find(x=>x.name==='cr_finalize_esign_send').args.p_submission.sign_url,'https://docuseal.com/s/syntheticSlug')});
test('unsigned recovery catches up status without starting messaging automation',async()=>{setup();syncStatus='opened';const r=await invoke();assert.equal(r.status,200);assert.equal(transitions[0].status,'esign_sent');assert.equal(transitions[0].historical,true);assert.equal(provider.length,0);assert.equal(sent.length,0)});
test('recovery does not reopen a closed matter',async()=>{setup();syncStatus='opened';db.tables.claims[0].status='dead';const r=await invoke();assert.equal(r.status,200);assert.equal(transitions.length,0)});
test('owner recovers exact envelope with no creation, expiry, SMS or email',async()=>{
 setup();const r=await invoke();assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.recovered,true);assert.equal(r.body.agreement_id,'recovered');assert.equal(r.body.status,'signed');
 const call=rpcCalls.find(x=>x.name==='cr_finalize_esign_send');assert.equal(call.args.p_reconciled_by,'agent');assert.equal(call.args.p_submission.submission_id,'55');assert.equal(provider.length,0);assert.equal(sent.length,0);assert.equal(audit.length,1);
 for(const value of [r.body,audit]){assert.ok(!JSON.stringify(value).includes('2025550110'));assert.ok(!JSON.stringify(value).includes('/s/synthetic'));}
});
(async()=>{let passed=0;for(const[name,fn]of cases){try{await fn();passed++;console.log('ok',name)}catch(e){console.error('FAIL',name,e);process.exitCode=1}}console.log(passed+'/'+cases.length+' reconciliation route checks passed')})().catch(e=>{console.error(e);process.exitCode=1});
`;
vm0.runInThisContext('(function(require,__dirname){'+base+'\n'+checks+'\n})',{filename:__filename})(require,__dirname);
