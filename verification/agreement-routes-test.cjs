// Independent offline route matrix. Reuses only existing fake DB/provider setup;
// loads real state/choice/matter/send/preview modules and never contacts a provider.
const fs0=require('node:fs'),path0=require('node:path'),vm0=require('node:vm');
let base=fs0.readFileSync(path0.join(__dirname,'signing-routes-test.cjs'),'utf8');
base=base.slice(0,base.indexOf("const send=route("));
const review=String.raw`
const choice=load(path.join(app,'src/lib/mva-call/agreement-choice.ts'));
stubs['@/lib/docuseal'].agreementKey=choice.agreementKey;
let previewCalls=[],templateCalls=[],templateCreates=[],assetFetches=[];
const packetMap=load(path.join(app,'src/lib/esign-packets/tmp-mva.ts')).TMP_MVA_PACKETS;
// Exercise the actual packet resolver and template helper, with only their
// network boundary mocked. AST selection avoids unrelated signing side effects.
const esignSource=ts.createSourceFile('esign.ts',fs.readFileSync(path.join(app,'src/lib/mva-call/esign.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const helperSource=esignSource.statements.filter(n=>ts.isFunctionDeclaration(n)&&['packetsFor','templateFor'].includes(n.name?.text)).map(n=>n.getText(esignSource)).join('\n');
assert.equal(esignSource.statements.filter(n=>ts.isFunctionDeclaration(n)&&['packetsFor','templateFor'].includes(n.name?.text)).length,2);
const helperJs=ts.transpileModule(helperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const realHelpers={exports:{}};
vm.runInThisContext('(function(exports,TMP_MVA_PACKETS,createTemplate,plainDocuSeal,recordAudit){'+helperJs+'\n})')(
 realHelpers.exports,packetMap,async(packet,url)=>{templateCreates.push({packet,url});return{ok:true,data:{id:'created-'+packet.external_id,fields:packet.fields}};},x=>x,async x=>audit.push(x));
stubs['@/lib/mva-call/esign'].packetsFor=realHelpers.exports.packetsFor;
stubs['@/lib/mva-call/esign'].templateFor=async(_db,opts)=>{templateCalls.push(opts);return realHelpers.exports.templateFor(_db,opts);};
stubs['@/lib/mva-call/preview']={stampPreview:async(bytes,packet,key,values)=>{
 assert.equal(packet,packetMap[key]);assert.deepEqual(Buffer.from(bytes),fs.readFileSync(path.join(app,'public',packet.path)));
 previewCalls.push({key,packet,values});return new Uint8Array([1,2,3]);
}};
globalThis.fetch=async url=>{const target=new URL(String(url));assert.equal(target.origin,'https://offline.invalid');assert.ok(Object.values(packetMap).some(p=>p.path===target.pathname));
 const bytes=fs.readFileSync(path.join(app,'public',target.pathname));assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assetFetches.push(String(url));return{ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};};
const send=route('calls/esign'),preview=route('calls/esign/preview');
function setup(keys=['TX','FL','NV','NV_FLAT','OTHER']){
 world();previewCalls=[];templateCalls=[];templateCreates=[];assetFetches=[];db.tables.firms[0].slug='tmp';
 db.tables.esign_templates=keys.map(key=>({campaign_id:CA,firm_id:F,provider:'docuseal',key,template_id:'tpl-'+key,name:packetMap[key]?.name}));
}
const body=(extras={})=>({lead_id:L,claim_id:C,call_id:'call',signer_name:'CHAT TESTER',injured_name:'CHAT TESTER',today:'09/28/2026',doi:'09/01/2026',city:'Dallas, TX',via:'Email',email:'tester@example.invalid',...extras});
const previewRequest=extras=>{const b=body(extras);return{url:'https://offline.invalid/api/calls/esign/preview?'+new URLSearchParams({...b,signer:b.signer_name,injured:b.injured_name})};};
const cases=[];function test(name,fn){cases.push([name,fn]);}
const states=[['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
assert.equal(states.length,50);assert.equal(new Set(states.map(([code])=>code)).size,50);
for(const [code,name]of states){
 test(code+' abbreviation and full name use the same approved packet in resolver, preview and send',async()=>{
  const key=['TX','FL','NV'].includes(code)?code:'OTHER';
  for(const city of ['Synthetic City, '+code,'Synthetic City, '+name,'  Synthetic City, '+name.toLowerCase()+'  ']){
   setup();const selected=choice.agreementChoice(city,undefined,Object.keys(packetMap));assert.equal(selected.state,code);assert.equal(selected.key,key);assert.equal(selected.available,true);
   const p=await preview.GET(previewRequest({city}));assert.equal(p.status,200,city);assert.equal(previewCalls[0].key,key);
   assert.equal(p.headers.get('cache-control'),'no-store');assert.equal(assetFetches[0],'https://offline.invalid'+packetMap[key].path);
   const s=await send.POST(request(body({city})));assert.equal(s.status,200,JSON.stringify(s));assert.equal(db.tables.esign_submissions[0].template_key,key);
   assert.equal(templateCalls[0].packet,previewCalls[0].packet);assert.equal(templateCalls[0].campaignId,CA);assert.equal(templateCalls[0].firmId,F);
   assert.equal(provider.find(x=>x[0]==='send')[1].templateId,'tpl-'+key);assert.equal(templateCreates.length,0);
  }
 });
}
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
for(const [city,variant,key]of [['Dallas, Texas','tiered','TX'],['Miami, Florida','tiered','FL'],['Las Vegas, Nevada','tiered','NV'],['Las Vegas, Nevada','flat','NV_FLAT'],['Jackson, Mississippi','tiered','OTHER']]){
 test('missing designated '+key+' never substitutes another campaign packet',async()=>{
  setup(Object.keys(packetMap).filter(k=>k!==key));const b={city,nv_variant:variant,nv_reason:'Approved by synthetic reviewer'};
  assert.equal((await preview.GET(previewRequest(b))).status,409);assert.equal((await send.POST(request(body(b)))).status,409);
  assert.equal(provider.length,0);assert.equal(templateCalls.length,0);assert.equal(templateCreates.length,0);assert.equal(assetFetches.length,0);
 });
 test('outdated '+key+' template rebuild uses the exact preview PDF and retains selected campaign',async()=>{
  setup();db.tables.esign_templates.find(t=>t.key===key).name='Superseded synthetic template';
  db.tables.esign_templates.push({campaign_id:'unrelated-campaign',firm_id:'unrelated-firm',provider:'docuseal',key,name:packetMap[key].name,template_id:'do-not-use'});
  const b={city,nv_variant:variant,nv_reason:'Approved by synthetic reviewer'};
  assert.equal((await preview.GET(previewRequest(b))).status,200);assert.equal((await send.POST(request(body(b)))).status,200);
  assert.equal(templateCreates.length,1);assert.equal(templateCreates[0].packet,previewCalls[0].packet);assert.equal(templateCreates[0].url,assetFetches[0]);
  assert.equal(provider.find(x=>x[0]==='send')[1].templateId,'created-'+packetMap[key].external_id);
  assert.equal(db.tables.esign_templates.find(t=>t.campaign_id==='unrelated-campaign').template_id,'do-not-use');
 });
}
test('Nevada full name preserves explicit tiered and non-tiered selection with distinct source PDFs',async()=>{
 const paths=[];
 for(const [variant,key]of [['tiered','NV'],['flat','NV_FLAT']]){
  setup();const b={city:'Las Vegas, Nevada',nv_variant:variant,nv_reason:'Approved by synthetic reviewer'};
  assert.equal((await preview.GET(previewRequest(b))).status,200);assert.equal(previewCalls[0].key,key);paths.push(previewCalls[0].packet.path);
  assert.equal((await send.POST(request(body(b)))).status,200);assert.equal(db.tables.esign_submissions[0].template_key,key);
 }
 assert.notEqual(paths[0],paths[1]);assert.notDeepEqual(fs.readFileSync(path.join(app,'public',paths[0])),fs.readFileSync(path.join(app,'public',paths[1])));
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
