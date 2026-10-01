// Synthetic route test: never calls DocuSeal, SMS, email, or a live database.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'), ts = require(path.join(app, 'node_modules/typescript'));
const F = '30000000-0000-4000-8000-000000000001', L = '10000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000001', CA = '40000000-0000-4000-8000-000000000001';
let db, matter, ctx, providerCalls = 0, reservations = 0, officeCalls = 0;
const cache = new Map();
const stubs = {
  'next/server': { NextResponse: { json: (body, o={}) => ({ status: o.status || 200, body }) } },
  '@/lib/netfly-server': { netflyContext: async () => ctx, netflyMatter: async (_ctx, key) => key === 'TMP-1' ? matter : null },
  '@/lib/netfly-ontake': { NETFLY_ANSWER_KEY: 'netfly_secondary', NETFLY_RETAINER_TYPE: 'netfly_signed_retainer' },
  '@/lib/esign-packets/tmp-mva': { TMP_MVA_PACKETS: Object.fromEntries(['TX','FL','NV','NV_FLAT','OTHER'].map(k => [k, { name:k, path:'/offline.pdf' }])) },
  '@/lib/mva-call/esign': { templateFor: async () => ({ ok:true, templateId:'123' }), syncSubmission: async (_db,r) => r.status, ssnForForm: raw => raw ? ({ printed:raw,last4:raw.slice(-4) }) : null },
  '@/lib/docuseal': { docusealConfigured: () => true, plainDocuSeal: e => e, completeIntake: async () => { officeCalls++; return { ok:true }; },
    createSubmission: async () => { providerCalls++; return { ok:true, data:[{ role:'Client', id:'client', submission_id:'1234', embed_src:'https://offline.invalid/sign' }, { role:'Intake', id:'intake' }] }; } },
  '@/lib/mva-call/send-attempt': { reserveSendAttempt: async () => ({ ok:true, attempt:{ id:'attempt', state:'reserved', created_at:new Date().toISOString() } }),
    bindSendAttempt: async () => ({ ok:true }), markSendPending: async () => ({ ok:true }), holdSendAttempt: async () => ({ ok:true }),
    rejectSendAttempt: async () => ({ ok:true }), finalizeSendAttempt: async (_db,_id,row) => { reservations++; db.tables.esign_submissions.push({ ...row, id:'corrected', created_at:new Date().toISOString() }); return { ok:true,id:'corrected' }; } },
  '@/lib/mva-call/client-signed': { ensureClientSignedSnapshot: async () => ({ ok:true,path:`${F}/client-ds-1234.pdf` }), clientSignedPath: () => `${F}/client-ds-1234.pdf` },
  '@/lib/mva-call/identity': { readIdentityForSigning: async () => ({ ok:true, identity:null }), saveIdentity: async () => ({ ok:true }), normalizeIdentityValue: (s,mode) => /^\d+$/.test(String(s)) && String(s).length === (mode === 'full' ? 9 : 4) ? String(s) : null },
  '@/lib/signed-docs': { SIGNED_BUCKET:'signed-docs' },
  '@/lib/audit': { recordAudit: async x => audits.push(x) },
  '@/lib/supabase-server': { supabaseServer: async () => ({ auth:{ getUser: async () => ({ data:{ user:{ email:'agent@example.invalid' } } }) } }) },
};
function load(file) { file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const m={exports:{}}; cache.set(file,m); const code=ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true} }).outputText;
  const req=k=>{ if(stubs[k]) return stubs[k]; if(k.startsWith('@/')) return load(path.join(app,'src',k.slice(2))+'.ts'); if(k.startsWith('.')) return load(path.resolve(path.dirname(file),k)+'.ts'); return require(k); };
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,m,m.exports); return m.exports; }
const {FakeDb}=load(path.join(app,'src/lib/test-fake-db.ts'));
function world() { providerCalls=0; reservations=0; officeCalls=0;
  const lead={ id:L, firm_id:F, campaign_id:CA, claimant_name:'Sample Client', phone:'2025550100', email:'sample@example.invalid' };
  const claim={ id:C, firm_id:F, campaign_id:CA, status:'wip', answers:{ netfly_secondary:{ fields:{ confirmed_name:'Sample Client',accident_city:'Dallas',accident_state:'Texas',accident_date:'2026-09-04' },review:{status:'correction_needed',document_id:'original',note:'Misspelled name on original'} } } };
  matter={ lead,claim }; db=new FakeDb({ case_documents:[{id:'original',firm_id:F,lead_id:L,claim_id:C,doc_type:'netfly_signed_retainer',created_at:'2026-09-29'}], esign_submissions:[], claims:[claim], leads:[lead], audit_log:[] });
  ctx={ actor:{ id:'agent',name:'Agent',can:key=>key==='intake.fill' },campaign:{id:CA,firm_id:F,ssn_require_full:false},db };
}
const route=load(path.join(app,'src/app/api/netfly/esign/route.ts'));
const body={ op:'send',file:'TMP-1',confirm:true,name:'Sample Client',email:'sample@example.invalid',city:'Dallas',state:'Texas',accident_date:'2026-09-04',nv_variant:'tiered' };
const request=b=>({ json:async()=>b,url:'https://offline.invalid/api/netfly/esign' });
(async()=>{
  world(); matter.claim.answers.netfly_secondary.review.status='in_progress';
  assert.equal((await route.POST(request(body))).status,409); assert.equal(providerCalls,0);
  assert.equal((await route.POST(request({...body,op:'preview'}))).status,409);
  world(); const first=await route.POST(request(body)); assert.equal(first.status,200,JSON.stringify(first));
  assert.equal(providerCalls,1); assert.equal(reservations,1); assert.equal(db.tables.case_documents.length,1);
  assert.equal(matter.claim.status,'wip'); assert.equal(db.tables.esign_submissions[0].campaign_id,CA);
  assert.equal(db.tables.audit_log.at(-1).meta.original_document_id,'original');
  assert.equal((await route.POST(request(body))).status,409); assert.equal(providerCalls,1);
  world(); matter.lead.email='changed@example.invalid';
  assert.equal((await route.POST(request(body))).status,400); assert.equal(providerCalls,0);
  world(); ctx.campaign.ssn_require_full=true;
  db.tables.esign_submissions.push({ id:'corrected', firm_id:F, campaign_id:CA, lead_id:L, claim_id:C,
    status:'signed', signed_at:'2026-09-29T12:00:00Z', agent_reviewed_at:'2026-09-29T13:00:00Z', intake_submitter_id:'intake', created_at:'2026-09-29T10:00:00Z' });
  const short=await route.POST(request({op:'complete',file:'TMP-1',agreement_id:'corrected',dob:'1999-11-11',ssn:'6969'}));
  assert.equal(short.status,400); assert.equal(officeCalls,0);
  console.log('NETFLY emergency send guards, original preservation and duplicate block passed');
})().catch(e=>{console.error(e);process.exit(1)});
