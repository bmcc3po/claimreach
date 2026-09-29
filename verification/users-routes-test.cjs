const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..');
const ts = require(path.join(app, 'node_modules/typescript'));
const React = require(path.join(app, 'node_modules/react'));
const { renderToStaticMarkup } = require(path.join(app, 'node_modules/react-dom/server'));
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync(path.join(app, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { assert.ok(name in modules, 'Unstubbed ' + name); return modules[name]; }, exports);
  return exports;
}
function fixture(options = {}) {
  const steps = [];
  const row = { id: 'synthetic-user', email: 'test@example.invalid' };
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data: {role: options.role || 'owner', active: true}}), order: async () => {
    if (options.listThrow) throw new Error('synthetic network error');
    return options.list || {data: [], error: null};
  }};
  const sb = { auth: {getUser: async () => ({data: {user: {id: 'synthetic-owner'}}})}, from: () => query };
  const admin = {auth: {admin: {createUser: async () => {steps.push('auth'); return options.auth || {data: {user: row}, error: null};}}}, from: () => ({
    insert: async () => {steps.push('insert'); return {error: null};},
    select: () => ({eq: () => ({maybeSingle: async () => {steps.push('verify'); if(options.verifyThrow) throw new Error('synthetic network error'); return options.verify || {data: row, error: null};}})})
  })};
  return { steps, route: load('src/app/api/users/route.ts', {'next/server': {NextResponse: {json: (body, options = {}) => ({body, status: options.status || 200, headers: options.headers})}}, '@/lib/supabase-server': {supabaseServer: async () => sb, supabaseAdmin: () => admin}}) };
}
let passed = 0;
async function test(name, fn) {await fn(); passed++; console.log('PASS', name);}
const request = {json: async () => ({op: 'create', email: 'test@example.invalid', password: 'offline-only'})};
(async () => {
  await test('database list failure is 500 and never a success empty roster', async () => {const f=fixture({list:{data:null,error:{message:'offline failure'}}}); const r=await f.route.GET({});assert.equal(r.status,500);assert.equal(r.body.users,undefined);});
  await test('network list failure is 500', async () => {assert.equal((await fixture({listThrow:true}).route.GET({})).status,500);});
  await test('verified empty roster remains legitimate empty success', async () => {const r=await fixture().route.GET({});assert.equal(r.status,200);assert.deepEqual(r.body.users,[]);assert.equal(r.headers['Cache-Control'],'no-store');});
  await test('existing agent permission denial remains unchanged', async () => {assert.equal((await fixture({role:'agent'}).route.GET({})).status,403);});
  await test('create confirms persisted profile before success', async () => {const f=fixture();const r=await f.route.POST(request);assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.deepEqual(f.steps,['auth','insert','verify']);});
  for (const [name, options] of [['missing',{verify:{data:null,error:null}}],['database failure',{verify:{data:null,error:{message:'offline failure'}}}],['wrong identity',{verify:{data:{id:'different',email:'test@example.invalid'},error:null}}],['network failure',{verifyThrow:true}]]) {
    await test('create readback '+name+' preserves data but does not claim success', async () => {const f=fixture(options);const r=await f.route.POST(request);assert.equal(r.status,502);assert.match(r.body.error,/Refresh Users/);assert.equal(r.body.ok,undefined);assert.deepEqual(f.steps,['auth','insert','verify']);});
  }
  await test('failed auth creation never inserts or verifies a profile', async () => {const f=fixture({auth:{data:null,error:{message:'offline rejected'}}});assert.equal((await f.route.POST(request)).status,500);assert.deepEqual(f.steps,['auth']);});
  let values=[],cursor=0,effect=null;
  const hooks={useState:initial=>{const index=cursor++;if(!(index in values))values[index]=initial;return[values[index],v=>{values[index]=typeof v==='function'?v(values[index]):v;}];},useEffect:fn=>{effect=fn;}};
  const ui=load('src/components/UserManager.tsx', {'react':hooks,'react/jsx-runtime':require(path.join(app,'node_modules/react/jsx-runtime')),'@/lib/permissions':{PERMISSIONS:[],PERM_GROUPS:[],ROLES:[],ROLE_DEFAULTS:{}}});
  function render(){cursor=0;return renderToStaticMarkup(ui.default({firms:[]}));}
  async function fetchList(response){values=[];global.fetch=async()=>response;render();effect();await new Promise(resolve=>setImmediate(resolve));return render();}
  await test('UI failed roster shows Retry and never No users yet',async()=>{const html=await fetchList({ok:false,json:async()=>({error:'Synthetic failure'})});assert.match(html,/Synthetic failure/);assert.match(html,/Retry loading users/);assert.doesNotMatch(html,/No users yet/);});
  await test('UI genuine empty roster is distinguished from failed load',async()=>{const html=await fetchList({ok:true,json:async()=>({users:[]})});assert.match(html,/No users yet/);assert.doesNotMatch(html,/Retry loading users/);});
  await test('UI non-JSON roster response offers retry',async()=>{const html=await fetchList({ok:false,json:async()=>{throw new Error('Synthetic bad response');}});assert.match(html,/Retry loading users/);assert.doesNotMatch(html,/No users yet/);});
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
