// Synthetic route test. No network, live client, message, or signing provider.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'), ts = require(path.join(app, 'node_modules/typescript'));
const F = '30000000-0000-4000-8000-000000000001', CA = '40000000-0000-4000-8000-000000000001';
let ctx, number = 0;
const stubs = {
  'next/server': { NextResponse: { json: (body, o={}) => ({ status:o.status || 200, body }) } },
  '@/lib/netfly-server': { netflyContext: async () => ctx, netflyMatter: async () => null },
  '@/lib/netfly-ontake': { NETFLY_ANSWER_KEY:'netfly_secondary', NETFLY_CAMPAIGN:'NETFLY ONTAKE' },
  '@/lib/mva-call/server': { parseDob: () => null },
  '@/lib/us-address': { mailColumnsFrom: () => ({}) },
  '@/lib/mva-call/esign': { packetShort: () => null },
  '@/lib/comms': { normPhone: value => String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/,'') },
};
const cache = new Map();
function load(file) { file=path.resolve(file); if(cache.has(file)) return cache.get(file).exports;
  const m={exports:{}}; cache.set(file,m);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const req=k=>stubs[k] || (k.startsWith('@/')?load(path.join(app,'src',k.slice(2))+'.ts'):require(k));
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,m,m.exports); return m.exports; }
const {FakeDb}=load(path.join(app,'src/lib/test-fake-db.ts'));
const route=load(path.join(app,'src/app/api/netfly/route.ts'));
const db=new FakeDb({leads:[{id:'inno',firm_id:F,campaign_id:'inno-campaign',lead_no:'TMP-100',phone_norm:'2025550100',archived_at:null}],claims:[]});
db.rpc=async () => ({data:`TMP-${++number}`,error:null});
ctx={ actor:{id:'agent',name:'Agent',can:key=>key==='leads.edit'},campaign:{id:CA,firm_id:F},db };
const request=body=>({json:async()=>body,url:'https://offline.invalid/api/netfly'});
(async()=>{
  const body={op:'start_call',name:'Sample Transfer',phone:'(202) 555-0100'};
  const first=await route.POST(request(body)); assert.equal(first.status,200,JSON.stringify(first));
  assert.equal(first.body.existing,undefined);
  const lead=db.tables.leads.find(x=>x.campaign_id===CA);
  assert.equal(lead.campaign,'NETFLY ONTAKE'); assert.equal(lead.marketing_source,'NETFLY');
  assert.equal(lead.perm_call,false); assert.equal(lead.perm_text,false); assert.equal(lead.perm_email,false);
  assert.equal(lead.intake_agent_id,'agent');
  assert.equal(db.tables.claims.length,1); assert.equal(db.tables.claims[0].campaign_id,CA);
  assert.equal(db.tables.claims[0].answers.netfly_secondary.review.status,'in_progress');
  // Simulate the normalized phone column that production computes on insert.
  lead.phone_norm='2025550100';
  const second=await route.POST(request(body)); assert.equal(second.status,200);
  assert.equal(second.body.existing,true); assert.equal(second.body.file.id,lead.id);
  assert.equal(db.tables.leads.length,2); assert.equal(db.tables.claims.length,1);
  assert.equal((await route.POST(request({...body,name:'Different Transfer'}))).status,409);
  db.failOn=op=>op.table==='leads' && op.kind==='select' ? 'lookup unavailable' : null;
  assert.equal((await route.POST(request(body))).status,503);
  db.failOn=()=>null;
  ctx.actor.can=()=>false;
  assert.equal((await route.POST(request(body))).status,403);
  console.log('NETFLY New call keeps INNO separate, reopens the same transfer, holds outreach, and fails closed');
})().catch(e=>{console.error(e);process.exit(1)});
