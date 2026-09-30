// Actual TypeScript route modules with fake session/database/provider boundaries.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),ts=require(path.join(app,'node_modules/typescript'));
const L='10000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002',F='30000000-0000-4000-8000-000000000001',CA='40000000-0000-4000-8000-000000000001';
let db,provider=[],sent=[],attachments=[],transitions=[],audit=[],archiveResult={ok:true},expireResult={ok:true},expiryVerified=true,syncStatus='completed',role='owner',identityResult={ok:true,identity:null},identityReads=[],identitySaves=[],identitySaveFailure=null;
const cache=new Map();
const stubs={
'next/server':{NextResponse:{json:(body,o={})=>({status:o.status||200,body})}},
'@/lib/supabase-server':{supabaseServer:async()=>db,supabaseAdmin:()=>db},
'@/lib/gate':{gateUser:async()=>({id:'agent',name:'Tester',role,firmId:F}),requirePerm:async()=>({ok:true})},
'@/lib/audit':{recordAudit:async x=>audit.push(x)},
'@/lib/docuseal':{docusealConfigured:()=>true,MISSING_DOCUSEAL:'missing',agreementKey:()=> 'TX',plainDocuSeal:x=>x,templateProblem:()=>false,completeIntake:async(...x)=>{provider.push(['complete',...x]);return{ok:true}},archiveSubmission:async x=>{provider.push(['archive',x]);return archiveResult},expireSubmission:async(x,at)=>{provider.push(['expire',x,at]);return expireResult},getSubmission:async x=>{provider.push(['get',x]);return{ok:true,data:{expire_at:expiryVerified?'2026-01-01T00:00:00Z':null,submitters:[{role:'Client',status:'awaiting'}]}}},createSubmission:async x=>{provider.push(['send',x]);return{ok:true,data:[{role:'Client',id:'client',submission_id:'sub',embed_src:'https://offline.invalid/sign'},{role:'Intake',id:'intake'}]}}},
'@/lib/mva-call/client-signed':{ensureClientSignedSnapshot:async()=>({ok:true,path:'offline/client-signed.pdf'})},
'@/lib/mva-call/identity':{
  readIdentityForSigning:async(_admin,scope)=>{identityReads.push(scope);return identityResult},
  getIdentityMetadata:async()=>identityResult.ok?{ok:true,identity:identityResult.identity?{saved:true,mode:identityResult.identity.mode,version:identityResult.identity.version,saved_at:'2026-09-29T19:00:00Z'}:{saved:false,mode:null,version:0,saved_at:null}}:identityResult,
  saveIdentity:async(_admin,scope,input)=>{
    identitySaves.push({scope,input,providerCount:provider.length});
    if(identitySaveFailure)return identitySaveFailure;
    identityResult={ok:true,identity:{ssn:input.ssn,mode:input.mode,version:input.expectedVersion+1}};
    return{ok:true,identity:{saved:true,mode:input.mode,version:input.expectedVersion+1,saved_at:'2026-09-29T19:00:00Z'}};
  },
},
'@/lib/mva-call/esign':{packetsFor:()=>null,templateFor:async()=>({ok:true,templateId:'tpl'}),syncSubmission:async()=> syncStatus,ssnForForm:raw=>{const d=String(raw||'').replace(/\D/g,'');return[4,9].includes(d.length)?{printed:d,last4:d.slice(-4)}:null}},
'@/lib/claim-status':{setClaimStatusForLeads:async o=>{transitions.push(o);return{ok:true}}},
'@/lib/justcall-send':{toE164:s=>s?'+1'+String(s).replace(/\D/g,'').slice(-10):null,sendJustCallSms:async()=>({ok:true})},
'@/lib/signed-docs':{signedPdfAttachment:async(_db,p)=>{attachments.push(p);return{file:{filename:'test.pdf',content:'offline'}}}},
'@/lib/email':{sendEmail:async o=>{sent.push(o);return{ok:true}}},
'@/lib/mva-call/report':{caseReport:(lead,answers,sub)=>({name:lead.claimant_name,agreement:{signed:!!sub,hasPdf:!!sub?.completed_pdf_path},lead,answers,sub}),caseReportHtml:r=>JSON.stringify(r),caseReportText:r=>JSON.stringify(r)},
};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;const req=k=>{if(stubs[k])return stubs[k];if(k.startsWith('@/'))return load(path.join(app,'src',k.slice(2))+'.ts');if(k.startsWith('.'))return load(path.resolve(path.dirname(file),k)+'.ts');return require(k)};const fn=vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file});fn(req,m,m.exports);return m.exports}
const {FakeDb}=load(path.join(app,'src/lib/test-fake-db.ts'));
stubs['@/lib/mva-call/identity'].normalizeIdentityValue=load(path.join(app,'src/lib/mva-call/identity.ts')).normalizeIdentityValue;
function world(){provider=[];sent=[];attachments=[];transitions=[];audit=[];archiveResult={ok:true};expireResult={ok:true};expiryVerified=true;syncStatus='completed';role='owner';identityResult={ok:true,identity:null};identityReads=[];identitySaves=[];identitySaveFailure=null;db=new FakeDb({leads:[{id:L,firm_id:F,campaign_id:CA,case_type:'mva',campaign:'A',claimant_name:'CHAT TESTER',phone:'2025550110',email:'caller@example.invalid',archived_at:null}],claims:[{id:C,lead_id:L,firm_id:F,campaign_id:CA,claim_type:'mva',status:'esign_sent'}],campaigns:[{id:CA,firm_id:F,ssn_require_full:false}],firms:[{id:F,name:'Offline firm',slug:'test'}],esign_templates:[{campaign_id:CA,provider:'docuseal',key:'TX',template_id:'1'}],intake_calls:[{id:'call',lead_id:L,firm_id:F,claim_id:C,campaign_id:CA,answers:{story:{text:'OWN'}}}],esign_submissions:[],signable_documents:[]});db.auth={getUser:async()=>({data:{user:{id:'agent',email:'agent@example.invalid'}}})};require('./send-attempt-rpc-fake.cjs').installAttemptRpc(db);return db;}
const request=body=>({json:async()=>body,url:'https://offline.invalid/api',headers:new Headers()});
const row=(extras={})=>({id:'agreement',lead_id:L,firm_id:F,claim_id:C,campaign_id:CA,status:'signed',pax_index:null,submission_id:'sub',intake_submitter_id:'intake',created_at:'2026-09-28T10:00:00Z',voided_at:null,signed_at:['signed','completed'].includes(extras.status||'signed')?'2026-09-28T10:02:00Z':null,completed_at:null,agent_reviewed_at:'2026-09-28T10:03:00Z',agent_reviewed_by:'agent',...extras});
const route=p=>load(path.join(app,'src/app/api',p,'route.ts'));
const send=route('calls/esign'),complete=route('calls/esign/complete'),cancel=route('calls/esign/void'),email=route('calls/email'),resend=route('calls/esign/resend');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const freshSend=()=>({lead_id:L,claim_id:C,signer_name:'CHAT TESTER',today:'09/28/2026',doi:'09/01/2026',city:'Dallas TX',via:'Email',email:'tester@example.invalid'});
test('concurrent first sends reserve once and issue only one provider create',async()=>{
  world();const results=await Promise.all([send.POST(request(freshSend())),send.POST(request(freshSend()))]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(provider.filter(x=>x[0]==='send').length,1);
  assert.equal(db.tables.esign_submissions.length,1);assert.equal(db.tables.esign_send_attempts.filter(x=>x.state==='linked').length,1);
  assert.equal(provider.find(x=>x[0]==='send')[1].externalId,db.tables.esign_send_attempts[0].id);
});
test('timeout and malformed provider success hold retries without another create',async()=>{
  const normal=stubs['@/lib/docuseal'].createSubmission;
  try {for(const response of [{ok:false,status:504,error:'synthetic timeout'},{ok:true,data:{unrecognized:true}}]){
    world();stubs['@/lib/docuseal'].createSubmission=async x=>{provider.push(['send',x]);return response};
    const first=await send.POST(request(freshSend()));assert.equal(first.status,502);assert.equal(first.body.send_attempt.state,'uncertain');
    const second=await send.POST(request(freshSend()));assert.equal(second.status,409);assert.equal(provider.filter(x=>x[0]==='send').length,1);
    assert.equal(db.tables.esign_submissions.length,0);assert.equal(db.tables.esign_send_attempts[0].state,'uncertain');
  }}finally{stubs['@/lib/docuseal'].createSubmission=normal;}
});
test('definitive structured provider rejection releases only for a deliberate new request',async()=>{
  world();const normal=stubs['@/lib/docuseal'].createSubmission;
  try{stubs['@/lib/docuseal'].createSubmission=async x=>{provider.push(['send',x]);return{ok:false,status:422,error:'synthetic refusal',definitiveRejection:true}};
    const failed=await send.POST(request(freshSend()));assert.equal(failed.status,424);assert.equal(db.tables.esign_send_attempts[0].state,'rejected');assert.equal(provider.length,1);
  }finally{stubs['@/lib/docuseal'].createSubmission=normal;}
  assert.equal((await send.POST(request(freshSend()))).status,200);assert.equal(provider.filter(x=>x[0]==='send').length,2);
});
test('signed correction can retry a definite rejection while preserving original supervisor hold',async()=>{
  world();role='agent';syncStatus='signed';db.tables.esign_submissions=[row({template_key:'TX'})];
  const normal=stubs['@/lib/docuseal'].createSubmission;
  try{stubs['@/lib/docuseal'].createSubmission=async x=>{provider.push(['send',x]);return{ok:false,status:422,error:'synthetic refusal',definitiveRejection:true}};
    assert.equal((await send.POST(request(correctedSend()))).status,424);
  }finally{stubs['@/lib/docuseal'].createSubmission=normal;}
  const original={...db.tables.esign_submissions[0]};assert.ok(original.replacement_requested_at);
  const retry=await send.POST(request(correctedSend()));assert.equal(retry.status,200,JSON.stringify(retry));
  assert.equal(db.tables.esign_submissions[0].replacement_requested_at,original.replacement_requested_at);
  assert.equal(db.tables.esign_submissions[0].status,'signed');assert.equal(db.tables.esign_submissions[0].replacement_reason,original.replacement_reason);
  assert.equal(db.tables.esign_submissions[1].replacement_of,original.id);
});
test('lost response after durable pending transition prevents any provider create or retry',async()=>{
  for(const error of [null,{code:'08006'}]){
    world();const actual=db.rpc;db.rpc=async(name,args)=>{const result=await actual(name,args);return name==='cr_mark_esign_send_pending'?{data:null,error}:result};
    const first=await send.POST(request(freshSend()));assert.equal(first.status,503);assert.equal(db.tables.esign_send_attempts[0].state,'provider_pending');assert.equal(provider.length,0);
    assert.equal((await send.POST(request(freshSend()))).status,409);assert.equal(provider.length,0);
  }
});
test('atomic binding rejects an agreement that changed since route validation',async()=>{
  world();const actual=db.rpc;db.rpc=async(name,args)=>{if(name==='cr_bind_esign_send')db.tables.esign_submissions.push(row({status:'sent'}));return actual(name,args)};
  const result=await send.POST(request(freshSend()));assert.equal(result.status,409);assert.equal(provider.length,0);assert.equal(db.tables.esign_send_attempts[0].state,'rejected');
});
test('office completion refuses unresolved sends and unavailable reservation checks before identity or provider work',async()=>{
  for(const state of ['reserved','provider_pending','uncertain','unavailable']){
    world();db.tables.esign_submissions=[row()];
    if(state==='unavailable'){const actual=db.rpc;db.rpc=async(name,args)=>name==='cr_pending_esign_send'?{data:null,error:{code:'08006'}}:actual(name,args)}
    else db.tables.esign_send_attempts.push({id:'attempt',parent_claim_id:C,pax_key:'',state,created_at:'2026-09-29T19:00:00Z',send_context:{private:'not in response'}});
    const result=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));
    assert.equal(result.status,state==='unavailable'?503:409);assert.equal(provider.length,0);assert.equal(identityReads.length,0);assert.equal(identitySaves.length,0);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});
test('resending old signing link is blocked on exact-matter hold or unavailable check',async()=>{
  const original=stubs['@/lib/justcall-send'].sendJustCallSms,from=process.env.JUSTCALL_DEFAULT_FROM;process.env.JUSTCALL_DEFAULT_FROM='+12025550100';
  try{stubs['@/lib/justcall-send'].sendJustCallSms=async x=>{provider.push(['sms',x]);return{ok:true}};
    for(const state of ['none','reserved','provider_pending','uncertain','unavailable']){
      world();db.tables.esign_submissions=[row({status:'sent',via:'Text',phone:'+12025550110',sign_url:'https://offline.invalid/sign'})];
      if(state==='unavailable'){const actual=db.rpc;db.rpc=async(name,args)=>name==='cr_pending_esign_send'?{data:null,error:{code:'08006'}}:actual(name,args)}
      else if(state!=='none')db.tables.esign_send_attempts.push({id:'attempt',parent_claim_id:C,pax_key:'',state,created_at:'2026-09-29T19:00:00Z'});
      const result=await resend.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));
      assert.equal(result.status,state==='none'?200:state==='unavailable'?503:409);assert.equal(provider.length,state==='none'?1:0);
    }
  }finally{stubs['@/lib/justcall-send'].sendJustCallSms=original;if(from===undefined)delete process.env.JUSTCALL_DEFAULT_FROM;else process.env.JUSTCALL_DEFAULT_FROM=from;}
});
test('poll preserves signed review status while returning only safe exact-matter hold metadata',async()=>{
  world();syncStatus='signed';db.tables.esign_submissions=[row()];
  db.tables.esign_send_attempts.push({id:'attempt',parent_claim_id:C,pax_key:'',state:'uncertain',created_at:'2026-09-29T19:00:00Z',send_context:{private:'not in response'}});
  const result=await send.GET({url:'https://offline.invalid/api/calls/esign?'+new URLSearchParams({lead_id:L,claim_id:C})});
  assert.equal(result.status,200);assert.equal(result.body.status,'signed');assert.equal(result.body.send_attempt.id,'attempt');assert.ok(!JSON.stringify(result).includes('private'));
});
test('passenger hold and main send stay separate while direct passenger access finds the same hold',async()=>{
  world();const child='90000000-0000-4000-8000-000000000001';db.tables.leads.push({...db.tables.leads[0],id:child,external_id:L+':pax:p1'});db.tables.claims.push({...db.tables.claims[0],id:B,lead_id:child});
  db.tables.esign_send_attempts.push({id:'pax-attempt',parent_claim_id:C,pax_key:'p1',pax_index:0,state:'uncertain',created_at:'2026-09-29T19:00:00Z'});
  const main=await send.GET({url:'https://offline.invalid/api/calls/esign?'+new URLSearchParams({lead_id:L,claim_id:C})});
  assert.equal(main.body.send_attempt,null);assert.equal(main.body.pax_send_attempts['0'].id,'pax-attempt');
  const direct=await send.GET({url:'https://offline.invalid/api/calls/esign?'+new URLSearchParams({lead_id:child,claim_id:B})});
  assert.equal(direct.body.send_attempt.id,'pax-attempt');
});
test('explicit wrong call claim rejects before DocuSeal',async()=>{world();db.tables.claims.push({...db.tables.claims[0],id:B});const r=await send.POST(request({lead_id:L,claim_id:B,call_id:'call',signer_name:'CHAT TESTER',today:'09/28/2026',doi:'09/01/2026',city:'Dallas TX',via:'Email',email:'tester@example.invalid'}));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('adult email-only passenger file has own email and no inherited caller cell',async()=>{world();const r=await send.POST(request({lead_id:L,claim_id:C,call_id:'call',signer_name:'Passenger Tester',injured_name:'Passenger Tester',today:'09/28/2026',doi:'09/01/2026',city:'Dallas TX',via:'Email',email:'passenger@example.invalid',pax_index:0,pax_key:'p1'}));assert.equal(r.status,200,JSON.stringify(r));const child=db.tables.leads.find(x=>x.id!==L);assert.equal(child.phone,null);assert.equal(child.email,'passenger@example.invalid');assert.equal(db.tables.esign_submissions[0].lead_id,child.id);assert.ok(r.body.claim_id)});
test('ambiguous passenger writes keep the reservation even when the database committed before its response failed',async()=>{
  for(const table of ['leads','claims'])for(const failure of ['Synthetic response lost','THROW']){
    world();let writes=0;
    db.failOn=op=>{
      if(op.kind==='insert'&&op.table===table){
        writes++;db.tables[table].push({id:db.nextId(),...op.patch});return failure;
      }
      return null;
    };
    const body={...freshSend(),signer_name:'Passenger Tester',injured_name:'Passenger Tester',pax_index:0,pax_key:'uncertain-pax'};
    const first=await send.POST(request(body));assert.equal(first.status,503,JSON.stringify(first));
    assert.equal(first.body.send_attempt.state,'uncertain');assert.equal(db.tables.esign_send_attempts[0].state,'uncertain');
    assert.equal(db.tables.esign_send_attempts[0].provider_started_at,undefined);assert.equal(provider.length,0);
    assert.equal(db.tables.leads.filter(x=>x.id!==L).length,1);
    assert.ok(db.tables.leads.filter(x=>x.id!==L).every(x=>!x.archived_at));
    db.failOn=()=>null;
    const retry=await send.POST(request(body));assert.equal(retry.status,409);assert.equal(writes,1);assert.equal(provider.length,0);
    assert.equal(db.tables.leads.filter(x=>x.id!==L).length,1);
  }
});
test('passenger write refusal stays held if recording uncertainty itself is unavailable',async()=>{
  world();const rpc=db.rpc;db.rpc=async(name,args)=>name==='cr_hold_esign_send'?{data:null,error:{code:'08006'}}:rpc(name,args);
  db.failOn=op=>op.table==='leads'&&op.kind==='insert'?'Synthetic write unavailable':null;
  const body={...freshSend(),signer_name:'Passenger Tester',injured_name:'Passenger Tester',pax_index:0,pax_key:'held-pax'};
  assert.equal((await send.POST(request(body))).status,503);assert.equal(db.tables.esign_send_attempts[0].state,'reserved');
  db.failOn=()=>null;assert.equal((await send.POST(request(body))).status,409);assert.equal(provider.length,0);
});
test('passenger completes original indexed agreement on own file',async()=>{world();db.tables.leads.push({...db.tables.leads[0],id:'90000000-0000-4000-8000-000000000001'});db.tables.claims.push({...db.tables.claims[0],id:B,lead_id:'90000000-0000-4000-8000-000000000001'});db.tables.leads[0].external_id='90000000-0000-4000-8000-000000000001:pax:p1';db.tables.esign_submissions=[row({pax_index:2})];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(provider[0][0],'complete')});
test('stale agreement ID cannot complete a replacement',async()=>{world();db.tables.esign_submissions=[row(),row({id:'new',created_at:'2026-09-28T11:00:00Z'})];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('corrected record name blocks completing old evidence instead of rewriting it',async()=>{world();db.tables.esign_submissions=[row({injured_name:'Old Name',signer_name:'Old Name'})];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));assert.equal(r.status,409);assert.match(r.body.error,/send a corrected agreement/);assert.equal(provider.length,0);assert.equal(db.tables.esign_submissions[0].injured_name,'Old Name')});
test('OBO signer stays separate when injured person matches corrected record',async()=>{world();db.tables.esign_submissions=[row({injured_name:'CHAT TESTER',signer_name:'Guardian Tester'})];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));assert.equal(r.status,200);assert.equal(provider[0][0],'complete')});
test('voiding child indexed agreement rolls back its own claim',async()=>{world();db.tables.leads[0].external_id='90000000-0000-4000-8000-000000000001:pax:p1';db.tables.esign_submissions=[row({pax_index:2,status:'sent'})];const r=await cancel.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',reason:'Wrong agreement'}));assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(transitions[0].claimIds,[C]);assert.equal(transitions[0].status,'contacting')});
test('agent cannot directly void signed or unsigned agreement',async()=>{for(const status of ['sent','signed']){world();role='agent';db.tables.esign_submissions=[row({status})];const r=await cancel.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',reason:'Wrong contract selected'}));assert.equal(r.status,403);assert.equal(db.tables.esign_submissions[0].status,status);assert.equal(provider.length,0)}});
test('provider expiry failure never marks an unsigned agreement voided',async()=>{world();db.tables.esign_submissions=[row({status:'sent'})];expireResult={ok:false,status:500,error:'offline'};const r=await cancel.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',reason:'Wrong agreement'}));assert.equal(r.status,502);assert.equal(db.tables.esign_submissions[0].status,'sent')});
test('unverified provider expiry never marks an unsigned agreement voided',async()=>{world();db.tables.esign_submissions=[row({status:'sent'})];expiryVerified=false;const r=await cancel.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',reason:'Wrong agreement'}));assert.equal(r.status,502);assert.equal(db.tables.esign_submissions[0].status,'sent');assert.deepEqual(provider.map(x=>x[0]),['expire','get'])});
const correctedSend=()=>({lead_id:L,claim_id:C,call_id:'call',signer_name:'CHAT TESTER',injured_name:'CHAT TESTER',today:'09/29/2026',doi:'09/24/2026',city:'Dallas TX',via:'Email',email:'tester@example.invalid',replacement_agreement_id:'agreement',replacement_reason:'Wrong contract version selected; send corrected copy'});
const initialSend=()=>{const body=correctedSend();delete body.replacement_agreement_id;delete body.replacement_reason;return body};

test('initial client send works without captured DOB or SSN',async()=>{
  world();const r=await send.POST(request(initialSend()));
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(identityReads,[{leadId:L,claimId:C,firmId:F}]);
  assert.deepEqual(provider.find(x=>x[0]==='send')[1].intake.values,{});
});

test('early saved identity goes only to office signer fields, not response, ordinary answers, or audit',async()=>{
  world();identityResult={ok:true,identity:{ssn:'123456789',mode:'full',version:3}};
  db.tables.leads[0].dob='1990-01-02';const r=await send.POST(request(initialSend()));
  assert.equal(r.status,200,JSON.stringify(r));
  const args=provider.find(x=>x[0]==='send')[1];
  assert.deepEqual(args.intake.values,{'Patient DOB':'01/02/1990','Patient SSN':'123456789'});
  for(const value of [args.client.values,r.body,audit,db.tables]) assert.ok(!JSON.stringify(value).includes('123456789'));
});

test('unreadable saved identity blocks replacement before expiring the previous link',async()=>{
  world();syncStatus='sent';db.tables.esign_submissions=[row({status:'sent'})];
  identityResult={ok:false,status:503,error:'Secure identity storage is unavailable.'};
  const r=await send.POST(request(correctedSend()));
  assert.equal(r.status,503);assert.equal(provider.length,0);
  assert.equal(db.tables.esign_submissions[0].status,'sent');
});

test('passenger identity is read from the passenger matter, not the parent file',async()=>{
  world();db.tables.leads[0].dob='1990-01-02';
  const r=await send.POST(request({...initialSend(),signer_name:'Passenger Tester',injured_name:'Passenger Tester',pax_index:0,pax_key:'identity-pax',dob:'01/02/1990'}));
  assert.equal(r.status,200,JSON.stringify(r));
  const child=db.tables.leads.find(x=>x.id!==L),childClaim=db.tables.claims.find(x=>x.lead_id===child.id);
  assert.deepEqual(identityReads,[{leadId:child.id,claimId:childClaim.id,firmId:F}]);
  assert.deepEqual(provider.find(x=>x[0]==='send')[1].intake.values,{});
});

test('office completion uses server saved full identity after agent review',async()=>{
  world();db.tables.leads[0].dob='1990-01-02';db.tables.esign_submissions=[row()];
  db.tables.campaigns[0].ssn_require_full=true;
  identityResult={ok:true,identity:{ssn:'123456789',mode:'full',version:2}};
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',use_saved_identity:true}));
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(identityReads,[{leadId:L,claimId:C,firmId:F}]);
  assert.equal(provider[0][0],'complete');assert.equal(provider[0][2]['Patient SSN'],'123456789');
  assert.equal(provider[0][2]['Patient DOB'],'01/02/1990');
  assert.equal(db.tables.leads[0].ssn_last4,'6789');
  for(const value of [r.body,audit,db.tables]) assert.ok(!JSON.stringify(value).includes('123456789'));
});

test('saved last-four identity still obeys campaign full-SSN requirement at office completion',async()=>{
  world();db.tables.esign_submissions=[row()];db.tables.campaigns[0].ssn_require_full=true;
  identityResult={ok:true,identity:{ssn:'6789',mode:'last4',version:1}};
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',use_saved_identity:true}));
  assert.equal(r.status,400);assert.match(r.body.error,/full 9-digit/);assert.equal(provider.length,0);
});

test('office completion cannot fall back to browser SSN when saved identity read fails',async()=>{
  world();db.tables.esign_submissions=[row()];identityResult={ok:false,status:503,error:'Secure identity storage is unavailable.'};
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'123456789',use_saved_identity:true}));
  assert.equal(r.status,503);assert.equal(provider.length,0);assert.equal(audit.length,0);
});

test('saved identity never bypasses signed-packet review before office completion',async()=>{
  world();db.tables.esign_submissions=[row({agent_reviewed_at:null,agent_reviewed_by:null})];
  identityResult={ok:true,identity:{ssn:'123456789',mode:'full',version:1}};
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',use_saved_identity:true}));
  assert.equal(r.status,409);assert.match(r.body.error,/Review the client's signed agreement/);assert.equal(provider.length,0);
});

test('legacy raw SSN is retained securely before office signing with first-write version zero',async()=>{
  world();db.tables.esign_submissions=[row()];
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'123-45-6789'}));
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(identitySaves,[{scope:{leadId:L,claimId:C,firmId:F},input:{ssn:'123456789',mode:'full',expectedVersion:0,actorId:'agent'},providerCount:0}]);
  assert.equal(identityResult.identity.ssn,'123456789');assert.equal(provider[0][2]['Patient SSN'],'123456789');
  for(const value of [r.body,audit,db.tables]) assert.ok(!JSON.stringify(value).includes('123456789'));
});

test('legacy last-four completion reuses full saved identity without downgrading or overwriting it',async()=>{
  world();db.tables.esign_submissions=[row()];db.tables.campaigns[0].ssn_require_full=true;
  identityResult={ok:true,identity:{ssn:'123456789',mode:'full',version:7}};
  const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'6789'}));
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(identitySaves.length,0);
  assert.deepEqual(identityResult.identity,{ssn:'123456789',mode:'full',version:7});
  assert.equal(provider[0][2]['Patient SSN'],'123456789');
});

test('legacy mismatched or concurrently changed identity cannot overwrite or complete',async()=>{
  for(const concurrent of [false,true]){
    world();db.tables.esign_submissions=[row()];
    if(concurrent)identitySaveFailure={ok:false,status:409,error:'Identity changed. Refresh.'};
    else identityResult={ok:true,identity:{ssn:'987654321',mode:'full',version:7}};
    const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'123456789'}));
    assert.equal(r.status,409);assert.equal(provider.length,0);
    assert.equal(identitySaves.length,concurrent?1:0);
    assert.equal(identityResult.identity?.ssn,concurrent?undefined:'987654321');
  }
});
test('agent replaces signed agreement immediately while preserving original and supervisor hold',async()=>{world();role='agent';syncStatus='signed';db.tables.esign_submissions=[row({template_key:'TX'})];const r=await send.POST(request(correctedSend()));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.owner_review_required,true);assert.equal(db.tables.esign_submissions[0].status,'signed');assert.equal(db.tables.esign_submissions[0].voided_at,null);assert.equal(db.tables.esign_submissions[0].replacement_requested_by,'agent');assert.match(db.tables.esign_submissions[0].replacement_reason,/Wrong contract version/);assert.equal(db.tables.esign_submissions[1].replacement_of,'agreement');assert.ok(provider.some(x=>x[0]==='send'));assert.ok(audit.some(x=>x.meta?.supervisor_review_required===true&&x.meta?.replacement_reason))});
test('a pending signed correction cannot produce a second provider submission',async()=>{world();role='agent';syncStatus='signed';db.tables.esign_submissions=[row({replacement_requested_at:'2026-09-29T11:00:00Z',replacement_reason:'Wrong contract version selected'})];const r=await send.POST(request(correctedSend()));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('failed local save holds the attempt and keeps original signed evidence without sending another link',async()=>{world();role='agent';syncStatus='signed';db.tables.esign_submissions=[row({template_key:'TX'})];db.failOn=o=>o.table==='esign_submissions'&&o.kind==='insert'?'offline insert':null;const r=await send.POST(request(correctedSend()));assert.equal(r.status,500);assert.match(r.body.error,/saving it could not be confirmed/);assert.deepEqual(provider.map(x=>x[0]),['send']);assert.equal(db.tables.esign_send_attempts[0].state,'uncertain');assert.equal(db.tables.esign_submissions.length,1);assert.equal(db.tables.esign_submissions[0].status,'signed');assert.ok(db.tables.esign_submissions[0].replacement_requested_at);assert.ok(audit.some(x=>x.meta?.attempt_id&&x.meta?.needs_reconciliation===true))});
test('unsigned correction verifies provider expiry before a new send and preserves old history',async()=>{world();role='agent';syncStatus='sent';db.tables.esign_submissions=[row({status:'sent',signed_at:null,agent_reviewed_at:null})];const r=await send.POST(request(correctedSend()));assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(provider.map(x=>x[0]),['expire','get','send']);assert.equal(db.tables.esign_submissions[0].status,'voided');assert.match(db.tables.esign_submissions[0].void_reason,/corrected agreement/);assert.equal(db.tables.esign_submissions[1].replacement_of,'agreement')});
test('unsigned correction never sends when DocuSeal cannot confirm expiry',async()=>{world();role='agent';syncStatus='sent';expiryVerified=false;db.tables.esign_submissions=[row({status:'opened',signed_at:null,agent_reviewed_at:null})];const r=await send.POST(request(correctedSend()));assert.equal(r.status,502);assert.deepEqual(provider.map(x=>x[0]),['expire','get']);assert.equal(db.tables.esign_submissions[0].status,'opened')});
test('voided current agreement is excluded from case email',async()=>{world();db.tables.esign_submissions=[row({status:'voided',completed_pdf_path:'old-private.pdf'})];const r=await email.POST(request({lead_id:L,claim_id:C,to:'review@example.invalid'}));assert.equal(r.status,200);assert.equal(attachments.length,0);assert.equal(sent.length,1);assert.equal(r.body.signed,false)});
test('non-MVA campaign sends configured DocuSeal template without wreck fields',async()=>{world();db.tables.claims[0].claim_type='motel_trafficking';db.tables.esign_templates[0].key='DEFAULT';const r=await send.POST(request({lead_id:L,claim_id:C,signer_name:'CHAT TESTER',via:'Email',email:'tester@example.invalid'}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(provider[0][1].templateId,'1');assert.ok(!('Accident Date' in provider[0][1].client.values))});
test('non-MVA office completion does not force MVA SSN/DOB',async()=>{world();db.tables.claims[0].claim_type='motel_trafficking';db.tables.esign_submissions=[row()];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(Object.keys(provider[0][2]),['Firm Date'])});
function emergencyWorld(){world();db.tables.claims[0].claim_type='motel_trafficking';db.tables.esign_templates[0].key='DEFAULT';db.tables.esign_submissions=[row({status:'completed',completed_pdf_path:'original.pdf'})];db.tables.signable_documents=[{id:'emergency',lead_id:L,firm_id:F,status:'signed',created_at:'2026-09-28T11:00:00Z',packet_group:'emergency-group',audit:{emergency:{claim_id:C}}}];}
const resignBody=()=>({lead_id:L,claim_id:C,signer_name:'CHAT TESTER',via:'Email',email:'tester@example.invalid',emergency_resign:true});
test('explicit emergency re-sign creates a linked new primary and preserves both original records',async()=>{emergencyWorld();const beforePrimary=JSON.stringify(db.tables.esign_submissions[0]),beforeEmergency=JSON.stringify(db.tables.signable_documents[0]);const r=await send.POST(request(resignBody()));assert.equal(r.status,200,JSON.stringify(r));assert.equal(provider[0][0],'send');assert.equal(JSON.stringify(db.tables.esign_submissions[0]),beforePrimary);assert.equal(JSON.stringify(db.tables.signable_documents[0]),beforeEmergency);assert.ok(audit.some(x=>x.meta?.emergency_resign_group==='emergency-group'))});
test('a signed emergency never silently replaces a live primary without the explicit flag',async()=>{emergencyWorld();const b=resignBody();delete b.emergency_resign;const r=await send.POST(request(b));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('emergency re-sign cannot bypass a live primary using unsigned or another matter evidence',async()=>{for(const mutate of [()=>db.tables.signable_documents[0].status='sent',()=>db.tables.signable_documents[0].audit.emergency.claim_id=B]){emergencyWorld();mutate();const r=await send.POST(request(resignBody()));assert.equal(r.status,409);assert.equal(provider.length,0)}});
test('an older emergency does not permit replacing a newer primary',async()=>{emergencyWorld();db.tables.signable_documents[0].created_at='2026-09-28T09:00:00Z';const r=await send.POST(request(resignBody()));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('office completion refuses a primary superseded by a newer signed emergency',async()=>{emergencyWorld();db.tables.esign_submissions[0].status='signed';const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));assert.equal(r.status,409);assert.match(r.body.error,/Prepare the DocuSeal re-sign first/);assert.equal(provider.length,0)});
test('unsigned active emergency also prevents completing the old primary',async()=>{emergencyWorld();db.tables.esign_submissions[0].status='signed';db.tables.signable_documents[0].status='sent';const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('cancelled emergency or primary newer than emergency permits normal office completion',async()=>{for(const mutate of [()=>db.tables.signable_documents[0].status='cancelled',()=>db.tables.esign_submissions[0].created_at='2026-09-28T12:00:00Z']){emergencyWorld();db.tables.esign_submissions[0].status='signed';mutate();const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(provider[0][0],'complete')}});
test('unreadable emergency state blocks office completion before contacting provider',async()=>{emergencyWorld();db.tables.esign_submissions[0].status='signed';db.failOn=o=>o.table==='signable_documents'&&o.kind==='select'?'Read unavailable':null;const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement'}));assert.equal(r.status,503);assert.equal(provider.length,0)});
for(const action of ['void','replace']) {
  const run=()=>action==='void'?cancel.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',reason:'Intentional synthetic cancellation'})):send.POST(request(correctedSend()));
  test(action+' accepts verified expiry callback racing local unsigned retirement',async()=>{
    world();syncStatus='sent';db.tables.esign_submissions=[row({status:'opened'})];
    let raced=false;db.failOn=op=>{if(!raced&&op.table==='esign_submissions'&&op.kind==='update'&&op.patch.status==='voided'){raced=true;db.tables.esign_submissions[0].status='expired'}return null};
    const r=await run();assert.equal(r.status,200,JSON.stringify(r));assert.equal(raced,true);assert.equal(db.tables.esign_submissions[0].status,'voided');assert.ok(db.tables.esign_submissions[0].voided_at);
    assert.equal(provider.filter(x=>x[0]==='send').length,action==='replace'?1:0);
    assert.ok(audit.some(x=>x.category==='retainer'&&!x.meta?.needs_reconciliation));
  });
  test(action+' refuses concurrent client signature or completion after provider expiry verification',async()=>{
    for(const update of [{status:'signed',signed_at:'2026-09-29T12:00:00Z'},{status:'completed',completed_at:'2026-09-29T12:00:00Z'},{status:'expired',signed_at:'2026-09-29T12:00:00Z'}]){
      world();syncStatus='sent';db.tables.esign_submissions=[row({status:'sent'})];
      db.failOn=op=>{if(op.table==='esign_submissions'&&op.kind==='update'&&op.patch.status==='voided')Object.assign(db.tables.esign_submissions[0],update);return null};
      const r=await run();assert.equal(r.status,409,JSON.stringify(r));assert.equal(db.tables.esign_submissions[0].status,update.status);assert.equal(db.tables.esign_submissions[0].voided_at,null);assert.equal(provider.some(x=>x[0]==='send'),false);assert.ok(audit.some(x=>x.meta?.needs_reconciliation));
    }
  });
  test(action+' surfaces failed local retirement and sends no replacement',async()=>{
    world();syncStatus='sent';db.tables.esign_submissions=[row({status:'sent'})];
    db.failOn=op=>op.table==='esign_submissions'&&op.kind==='update'&&op.patch.status==='voided'?'Write unavailable':null;
    const r=await run();assert.equal(r.status,action==='void'?500:409);assert.equal(db.tables.esign_submissions[0].status,'sent');assert.equal(provider.some(x=>x[0]==='send'),false);assert.ok(audit.some(x=>x.meta?.needs_reconciliation));
  });
  test(action+' does not duplicate a send when another request already retired the row',async()=>{
    world();syncStatus='sent';db.tables.esign_submissions=[row({status:'sent'})];
    db.failOn=op=>{if(op.table==='esign_submissions'&&op.kind==='update'&&op.patch.status==='voided')Object.assign(db.tables.esign_submissions[0],{status:'voided',voided_at:'2026-09-29T12:00:00Z'});return null};
    const r=await run();assert.equal(r.status,action==='void'?200:409);if(action==='void')assert.equal(r.body.already,true);assert.equal(provider.some(x=>x[0]==='send'),false);
  });
}
test('poll immediately returns contract selection after provider sync becomes terminal',async()=>{
  for(const terminal of ['expired','declined','failed','voided']){
    world();syncStatus=terminal;db.tables.esign_submissions=[row({status:'sent'})];
    const r=await send.GET({url:`https://offline.invalid/api?lead_id=${L}&claim_id=${C}`});assert.equal(r.status,200);assert.equal(r.body.status,'ready');assert.equal(r.body.complete,false);assert.equal(provider.some(x=>x[0]==='send'),false);
  }
});
test('archived agreement GET is read-only and never syncs the provider',async()=>{world();db.tables.leads[0].archived_at='2026-09-28';db.tables.esign_submissions=[row()];let syncs=0;stubs['@/lib/mva-call/esign'].syncSubmission=async()=>{syncs++;return'completed'};const r=await send.GET({url:`https://offline.invalid/api?lead_id=${L}&claim_id=${C}`});assert.equal(r.status,200);assert.equal(r.body.read_only,true);assert.equal(syncs,0)});
(async()=>{for(const [name,fn]of tests){await fn();console.log('ok',name)}console.log(tests.length+' route scenarios passed')})().catch(e=>{console.error(e);process.exit(1)});
