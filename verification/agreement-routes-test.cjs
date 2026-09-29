// Independent offline route matrix. Reuses only existing fake DB/provider setup;
// loads real state/choice/matter/send/preview modules and never contacts a provider.
const fs0=require('node:fs'),path0=require('node:path'),vm0=require('node:vm');
let base=fs0.readFileSync(path0.join(__dirname,'signing-routes-test.cjs'),'utf8');
base=base.slice(0,base.indexOf("const send=route("));
const review=String.raw`
const choice=load(path.join(app,'src/lib/mva-call/agreement-choice.ts'));
stubs['@/lib/docuseal'].agreementKey=choice.agreementKey;
let previewCalls=[],templateCalls=[],assetFetches=[];
const packetMap=Object.fromEntries(['TX','FL','NV','NV_FLAT','OTHER'].map(key=>[key,{name:key,path:'/synthetic/'+key+'.pdf',fields:[]}]));
stubs['@/lib/mva-call/esign'].packetsFor=(slug,type)=>slug==='tmp'&&type==='mva'?packetMap:null;
stubs['@/lib/mva-call/esign'].templateFor=async(_db,opts)=>{templateCalls.push(opts);return{ok:true,templateId:'tpl-'+opts.key};};
stubs['@/lib/mva-call/preview']={stampPreview:async(_bytes,_packet,key,values)=>{previewCalls.push({key,values});return new Uint8Array([1,2,3]);}};
globalThis.fetch=async url=>{const target=new URL(String(url));assert.equal(target.origin,'https://offline.invalid');assert.match(target.pathname,/^\/synthetic\/[A-Z_]+\.pdf$/);assetFetches.push(String(url));return{ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};};
const send=route('calls/esign'),preview=route('calls/esign/preview');
function setup(keys=['TX','FL','NV','NV_FLAT','OTHER']){
 world();previewCalls=[];templateCalls=[];assetFetches=[];db.tables.firms[0].slug='tmp';
 db.tables.esign_templates=keys.map(key=>({campaign_id:CA,firm_id:F,provider:'docuseal',key,template_id:'tpl-'+key}));
}
const body=(extras={})=>({lead_id:L,claim_id:C,call_id:'call',signer_name:'CHAT TESTER',injured_name:'CHAT TESTER',today:'09/28/2026',doi:'09/01/2026',city:'Dallas, TX',via:'Email',email:'tester@example.invalid',...extras});
const previewRequest=extras=>{const b=body(extras);return{url:'https://offline.invalid/api/calls/esign/preview?'+new URLSearchParams({...b,signer:b.signer_name,injured:b.injured_name})};};
const cases=[];function test(name,fn){cases.push([name,fn]);}
for(const [city,variant,key]of[['Dallas, TX','tiered','TX'],['Miami, FL','tiered','FL'],['Atlanta, GA','tiered','OTHER'],['Las Vegas, NV','tiered','NV'],['Las Vegas, NV','flat','NV_FLAT']]){
 test('real send and preview agree for '+key,async()=>{
  setup();const b={city,nv_variant:variant,nv_reason:variant==='flat'?'Approved by synthetic reviewer':''};
  const p=await preview.GET(previewRequest(b));assert.equal(p.status,200);assert.equal(previewCalls[0].key,key);
  const s=await send.POST(request(body(b)));assert.equal(s.status,200,JSON.stringify(s));assert.equal(db.tables.esign_submissions[0].template_key,key);
  assert.equal(templateCalls[0].key,key);assert.equal(provider.find(x=>x[0]==='send')[1].templateId,'tpl-'+key);
 });
}
test('NV_FLAT unavailable never falls back to NV and never creates provider/template',async()=>{
 setup(['NV']);const b={city:'Las Vegas, NV',nv_variant:'flat',nv_reason:'Approved'};
 const p=await preview.GET(previewRequest(b));assert.ok(p.status>=400,JSON.stringify(p));
 const s=await send.POST(request(body(b)));assert.ok(s.status>=400,JSON.stringify(s));assert.equal(provider.length,0);assert.equal(templateCalls.length,0);assert.equal(assetFetches.length,0);
});
test('missing crash state never accepts an arbitrary template_key',async()=>{
 setup();const b={city:'',template_key:'TX'};
 assert.ok((await preview.GET(previewRequest(b))).status>=400);assert.ok((await send.POST(request(body(b)))).status>=400);assert.equal(provider.length,0);
});
test('wrong-state requested template cannot override crash-state family',async()=>{
 setup();const b={city:'Miami, FL',template_key:'TX'};
 assert.equal((await send.POST(request(body(b)))).status,400);
 assert.equal((await preview.GET(previewRequest(b))).status,400);
 assert.equal(provider.length,0);assert.equal(assetFetches.length,0);
});
test('flat Nevada send needs the approval reason',async()=>{
 setup();const s=await send.POST(request(body({city:'Las Vegas, NV',nv_variant:'flat',nv_reason:''})));assert.equal(s.status,400);assert.equal(provider.length,0);assert.equal(templateCalls.length,0);
});
test('unknown explicit variant is rejected before preview or provider',async()=>{
 setup();const b={city:'Las Vegas, NV',nv_variant:'unsupported'};
 assert.ok((await preview.GET(previewRequest(b))).status>=400);assert.ok((await send.POST(request(body(b)))).status>=400);assert.equal(provider.length,0);assert.equal(assetFetches.length,0);
});
test('explicit flat variant is rejected outside Nevada before preview or provider',async()=>{
 for(const city of ['Dallas, TX','Miami, FL','Atlanta, GA']){
  setup();const b={city,nv_variant:'flat',nv_reason:'Approved'};
  assert.equal((await preview.GET(previewRequest(b))).status,400);assert.equal((await send.POST(request(body(b)))).status,400);
  assert.equal(provider.length,0);assert.equal(assetFetches.length,0);
 }
});
test('selected claim campaign must be this firms campaign for both preview and send',async()=>{
 setup();db.tables.campaigns[0].firm_id='foreign-firm';const b={};
 assert.ok((await preview.GET(previewRequest(b))).status>=400);assert.ok((await send.POST(request(body(b)))).status>=400);
 assert.equal(provider.length,0);assert.equal(assetFetches.length,0);
});
test('sibling claim campaign templates cannot authorize selected claim variant',async()=>{
 setup(['TX']);db.tables.claims.push({...db.tables.claims[0],id:B,campaign_id:'other-campaign'});
 db.tables.esign_templates.push({campaign_id:'other-campaign',firm_id:F,provider:'docuseal',key:'NV_FLAT',template_id:'wrong'});
 const b={city:'Las Vegas, NV',nv_variant:'flat',nv_reason:'Approved'};
 assert.ok((await preview.GET(previewRequest(b))).status>=400);assert.ok((await send.POST(request(body(b)))).status>=400);assert.equal(provider.length,0);
});
for(const status of ['sent','opened','signed','completed']){
 test(status+' envelope cannot be replaced by changing draft variant',async()=>{
  setup();const original=row({status,template_key:'NV',template_id:'original'});db.tables.esign_submissions=[original];const before=JSON.stringify(original);
  const s=await send.POST(request(body({city:'Las Vegas, NV',nv_variant:'flat',nv_reason:'Approved'})));
  assert.equal(s.status,409);assert.equal(provider.length,0);assert.equal(templateCalls.length,0);assert.equal(JSON.stringify(db.tables.esign_submissions[0]),before);
 });
}
(async()=>{let pass=0,fail=0;for(const[name,fn]of cases){try{await fn();pass++;console.log('ok',name);}catch(e){fail++;console.error('FAIL',name,'\n ',e.message);}}console.log(JSON.stringify({passed:pass,failed:fail},null,2));if(fail)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
`;
const wrapper=vm0.runInThisContext('(function(require,__dirname){'+base+'\n'+review+'\n})',{filename:__filename});
wrapper(require,__dirname);
