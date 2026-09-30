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
function world(){provider=[];sent=[];attachments=[];transitions=[];audit=[];archiveResult={ok:true};expireResult={ok:true};expiryVerified=true;syncStatus='completed';role='owner';identityResult={ok:true,identity:null};identityReads=[];identitySaves=[];identitySaveFailure=null;db=new FakeDb({leads:[{id:L,firm_id:F,campaign_id:CA,case_type:'mva',campaign:'A',claimant_name:'CHAT TESTER',phone:'2025550110',email:'caller@example.invalid',archived_at:null}],claims:[{id:C,lead_id:L,firm_id:F,campaign_id:CA,claim_type:'mva',status:'esign_sent'}],campaigns:[{id:CA,firm_id:F,ssn_require_full:false}],firms:[{id:F,name:'Offline firm',slug:'test'}],esign_templates:[{campaign_id:CA,provider:'docuseal',key:'TX',template_id:'1'}],intake_calls:[{id:'call',lead_id:L,firm_id:F,claim_id:C,campaign_id:CA,answers:{story:{text:'OWN'}}}],esign_submissions:[],signable_documents:[]});db.auth={getUser:async()=>({data:{user:{id:'agent',email:'agent@example.invalid'}}})};db.rpc=async()=>({data:'TMP-TEST'});return db;}
const request=body=>({json:async()=>body,url:'https://offline.invalid/api',headers:new Headers()});
const row=(extras={})=>({id:'agreement',lead_id:L,firm_id:F,claim_id:C,campaign_id:CA,status:'signed',pax_index:null,submission_id:'sub',intake_submitter_id:'intake',created_at:'2026-09-28T10:00:00Z',voided_at:null,signed_at:'2026-09-28T10:02:00Z',agent_reviewed_at:'2026-09-28T10:03:00Z',agent_reviewed_by:'agent',...extras});
const route=p=>load(path.join(app,'src/app/api',p,'route.ts'));
const send=route('calls/esign'),complete=route('calls/esign/complete'),cancel=route('calls/esign/void'),email=route('calls/email');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('explicit wrong call claim rejects before DocuSeal',async()=>{world();db.tables.claims.push({...db.tables.claims[0],id:B});const r=await send.POST(request({lead_id:L,claim_id:B,call_id:'call',signer_name:'CHAT TESTER',today:'09/28/2026',doi:'09/01/2026',city:'Dallas TX',via:'Email',email:'tester@example.invalid'}));assert.equal(r.status,409);assert.equal(provider.length,0)});
test('adult email-only passenger file has own email and no inherited caller cell',async()=>{world();const r=await send.POST(request({lead_id:L,claim_id:C,call_id:'call',signer_name:'Passenger Tester',injured_name:'Passenger Tester',today:'09/28/2026',doi:'09/01/2026',city:'Dallas TX',via:'Email',email:'passenger@example.invalid',pax_index:0,pax_key:'p1'}));assert.equal(r.status,200,JSON.stringify(r));const child=db.tables.leads.find(x=>x.id!==L);assert.equal(child.phone,null);assert.equal(child.email,'passenger@example.invalid');assert.equal(db.tables.esign_submissions[0].lead_id,child.id);assert.ok(r.body.claim_id)});
test('passenger completes original indexed agreement on own file',async()=>{world();db.tables.leads[0].external_id='90000000-0000-4000-8000-000000000001:pax:p1';db.tables.esign_submissions=[row({pax_index:2})];const r=await complete.POST(request({lead_id:L,claim_id:C,agreement_id:'agreement',dob:'01/02/1990',ssn:'0000'}));assert.equal(r.status,200,JSON.stringify(r));assert.equal(provider[0][0],'complete')});
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
test('failed local save expires the orphan correction link and keeps original signed evidence held',async()=>{world();role='agent';syncStatus='signed';db.tables.esign_submissions=[row({template_key:'TX'})];db.failOn=o=>o.table==='esign_submissions'&&o.kind==='insert'?'offline insert':null;const r=await send.POST(request(correctedSend()));assert.equal(r.status,500);assert.equal(r.body.error.includes('untracked DocuSeal link was expired'),true);assert.deepEqual(provider.map(x=>x[0]),['send','expire','get']);assert.equal(db.tables.esign_submissions.length,1);assert.equal(db.tables.esign_submissions[0].status,'signed');assert.ok(db.tables.esign_submissions[0].replacement_requested_at);assert.ok(audit.some(x=>x.meta?.orphan_expired===true&&x.meta?.needs_reconciliation===true))});
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
test('archived agreement GET is read-only and never syncs the provider',async()=>{world();db.tables.leads[0].archived_at='2026-09-28';db.tables.esign_submissions=[row()];let syncs=0;stubs['@/lib/mva-call/esign'].syncSubmission=async()=>{syncs++;return'completed'};const r=await send.GET({url:`https://offline.invalid/api?lead_id=${L}&claim_id=${C}`});assert.equal(r.status,200);assert.equal(r.body.read_only,true);assert.equal(syncs,0)});
(async()=>{for(const [name,fn]of tests){await fn();console.log('ok',name)}console.log(tests.length+' route scenarios passed')})().catch(e=>{console.error(e);process.exit(1)});
