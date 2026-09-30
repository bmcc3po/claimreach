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
  const access = {admin: 0};
  let row = { id: 'synthetic-user', email: 'test@example.invalid', role: options.targetRole || 'agent', active: options.targetActive ?? true };
  let authUser = {...row, app_metadata: options.metadata || {provider:'email', providers:['email'], unrelated:'preserve-me'}};
  const inputs = {created:[], updated:[], inserted:[], profileUpdated:[]};
  let authReads=0;
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data: {role: options.role || 'owner', active: 'active' in options ? options.active : true, perm_overrides: options.overrides || {}}}), order: async () => {
    if (options.listThrow) throw new Error('synthetic network error');
    return options.list || {data: [], error: null};
  }};
  const sb = { auth: {getUser: async () => ({data: {user: {id: 'synthetic-owner'}}})}, from: () => query };
  const admin = {auth: {admin: {
    createUser: async input => {steps.push('auth');inputs.created.push(input);authUser={...authUser,app_metadata:{...authUser.app_metadata,...input.app_metadata}};return options.auth || {data: {user: authUser}, error: null};},
    getUserById: async id => {steps.push('auth-read');authReads++;assert.equal(id,row.id);if(options.authReadThrow)throw Error('synthetic auth read failure');return options.authReads?.[authReads-1] || {data:{user:authUser},error:null};},
    updateUserById: async (id,input) => {steps.push('auth-update');inputs.updated.push({id,...input});if(options.authUpdateThrow)throw Error('synthetic auth update failure');if(options.authUpdateError)return{error:{message:'synthetic update rejection'}};authUser={...authUser,...(input.email?{email:input.email}:{}),app_metadata:{...authUser.app_metadata,...input.app_metadata}};return{data:{user:authUser},error:null};}
  }}, from: () => ({
    insert: async input => {steps.push('insert');inputs.inserted.push(input);return {error: options.insertError || null};},
    update: input => {const filters=[];const q={eq(k,v){filters.push([k,v]);return q;},select(){return q;},async maybeSingle(){steps.push('profile-update');inputs.profileUpdated.push({input,filters});if(options.profileSave)return options.profileSave;assert.deepEqual(filters,[['id',row.id],['email',row.email]]);row={...row,...input};return{data:row,error:null};}};return q;},
    select: () => ({eq: () => ({maybeSingle: async () => {steps.push('verify'); if(options.verifyThrow) throw new Error('synthetic network error'); return options.verify || {data: row, error: null};}})})
  })};
  return { steps, access, inputs, route: load('src/app/api/users/route.ts', {'next/server': {NextResponse: {json: (body, options = {}) => ({body, status: options.status || 200, headers: options.headers})}}, '@/lib/permissions':load('src/lib/permissions.ts',{}), '@/lib/supabase-server': {supabaseServer: async () => sb, supabaseAdmin: () => {access.admin++; return admin;}}}) };
}
let passed = 0;
async function test(name, fn) {await fn(); passed++; console.log('PASS', name);}
const request = {json: async () => ({op: 'create', email: 'test@example.invalid', password: 'offline-only'})};
(async () => {
  await test('database list failure is 500 and never a success empty roster', async () => {const f=fixture({list:{data:null,error:{message:'offline failure'}}}); const r=await f.route.GET({});assert.equal(r.status,500);assert.equal(r.body.users,undefined);});
  await test('network list failure is 500', async () => {assert.equal((await fixture({listThrow:true}).route.GET({})).status,500);});
  await test('verified empty roster remains legitimate empty success', async () => {const r=await fixture().route.GET({});assert.equal(r.status,200);assert.deepEqual(r.body.users,[]);assert.equal(r.headers['Cache-Control'],'no-store');});
  await test('existing agent permission denial remains unchanged', async () => {assert.equal((await fixture({role:'agent'}).route.GET({})).status,403);});
  await test('pilot denies admin and all non-owner roles even with user-management overrides', async () => {
    for (const role of ['admin','manager','agent','qa','firm']) {
      const f=fixture({role,overrides:{'users.manage':true}});
      assert.equal((await f.route.GET({})).status,403,role);
      assert.equal((await f.route.POST({json:async()=>{throw new Error('Denied request body must not be parsed');}})).status,403,role);
      assert.equal(f.access.admin,0);assert.deepEqual(f.steps,[]);
    }
  });
  await test('inactive or unknown-active owner cannot manage accounts through a stale session', async () => {
    for (const active of [false,null]) {
      const f=fixture({active});assert.equal((await f.route.GET({})).status,403);
      assert.equal((await f.route.POST(request)).status,403);assert.equal(f.access.admin,0);
    }
  });
  await test('staff creation confirms profile and trusted temporary-password flag before success', async () => {const f=fixture();const r=await f.route.POST(request);assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.deepEqual(f.steps,['auth','insert','verify','auth-read']);assert.deepEqual(f.inputs.created[0].app_metadata,{must_change_password:true});assert.equal(f.inputs.created[0].user_metadata,undefined);assert.equal(f.inputs.inserted[0].role,'agent');});
  for (const [name, options] of [['missing',{verify:{data:null,error:null}}],['database failure',{verify:{data:null,error:{message:'offline failure'}}}],['wrong identity',{verify:{data:{id:'different',email:'test@example.invalid'},error:null}}],['network failure',{verifyThrow:true}]]) {
    await test('create readback '+name+' preserves data but does not claim success', async () => {const f=fixture(options);const r=await f.route.POST(request);assert.equal(r.status,502);assert.match(r.body.error,/Refresh Users/);assert.equal(r.body.ok,undefined);assert.deepEqual(f.steps,['auth','insert','verify']);});
  }
  await test('failed auth creation never inserts or verifies a profile', async () => {const f=fixture({auth:{data:null,error:{message:'offline rejected'}}});assert.equal((await f.route.POST(request)).status,500);assert.deepEqual(f.steps,['auth']);});
  await test('all non-owner internal roles receive the required personal-password flag',async()=>{
    for(const role of ['admin','manager','agent','qa']){const f=fixture({targetRole:role});const r=await f.route.POST({json:async()=>({...await request.json(),role})});assert.equal(r.status,200);assert.equal(f.inputs.created[0].app_metadata.must_change_password,true);}
  });
  await test('owner and external account creation keep their existing onboarding behavior',async()=>{
    for(const role of ['owner','firm','partner']){const f=fixture({targetRole:role});const r=await f.route.POST({json:async()=>({...await request.json(),role})});assert.equal(r.status,200);assert.equal(f.inputs.created[0].app_metadata,undefined);assert.deepEqual(f.steps,['auth','insert','verify']);}
  });
  await test('staff creation cannot claim success when Auth flag readback fails or disagrees',async()=>{
    for(const authReads of [[{data:{user:{id:'synthetic-user',email:'test@example.invalid',app_metadata:{must_change_password:false}}}}],[{data:{user:{id:'wrong',email:'test@example.invalid',app_metadata:{must_change_password:true}}}}],[{data:null,error:{message:'offline'}}]]){const f=fixture({authReads});const r=await f.route.POST(request);assert.equal(r.status,502);assert.equal(r.body.ok,undefined);assert.equal(f.inputs.inserted.length,1);}
  });
  const resetRequest={json:async()=>({op:'set_password',id:'synthetic-user',password:'synthetic-temporary-only'})};
  await test('staff reset preserves unrelated Auth metadata and changes no profile fields',async()=>{
    const f=fixture({metadata:{provider:'email',providers:['email'],custom:{keep:true},must_change_password:false}});const r=await f.route.POST(resetRequest);assert.equal(r.status,200);assert.deepEqual(f.steps,['verify','auth-read','auth-update','auth-read']);assert.deepEqual(f.inputs.updated[0].app_metadata,{provider:'email',providers:['email'],custom:{keep:true},must_change_password:true});assert.deepEqual(Object.keys(f.inputs.updated[0]).sort(),['app_metadata','id','password']);assert.equal(f.inputs.inserted.length,0);
  });
  await test('staff reset stops before Auth write if profile or Auth identity is not verified',async()=>{
    for(const options of [{verify:{data:null,error:null}},{verify:{data:null,error:{message:'offline'}}},{authReads:[{data:{user:{id:'other',email:'test@example.invalid'}}}]},{authReads:[{data:{user:{id:'synthetic-user',email:'other@example.invalid'}}}]},{authReadThrow:true}]){const f=fixture(options);const r=await f.route.POST(resetRequest);assert.ok(r.status>=400);assert.equal(f.inputs.updated.length,0);}
  });
  await test('staff reset failed flag readback never announces success',async()=>{
    const current={id:'synthetic-user',email:'test@example.invalid',app_metadata:{provider:'email'}};
    for(const readback of [{data:{user:{...current,app_metadata:{must_change_password:false}}}},{data:null,error:{message:'offline'}},{data:{user:{...current,id:'wrong',app_metadata:{must_change_password:true}}}}]){const f=fixture({authReads:[{data:{user:current}},readback]});const r=await f.route.POST(resetRequest);assert.equal(r.status,502);assert.equal(r.body.ok,undefined);assert.equal(f.inputs.updated.length,1);}
  });
  await test('owner and external password resets do not add or clear metadata flags',async()=>{
    for(const role of ['owner','firm','partner']){const f=fixture({targetRole:role});const r=await f.route.POST(resetRequest);assert.equal(r.status,200);assert.deepEqual(f.steps,['verify','auth-update']);assert.equal(f.inputs.updated[0].app_metadata,undefined);}
  });
  await test('Auth update rejection and network failure never report successful reset',async()=>{
    for(const options of [{authUpdateError:true},{authUpdateThrow:true}]){const f=fixture(options);const r=await f.route.POST(resetRequest);assert.ok(r.status>=500);assert.equal(r.body.ok,undefined);}
  });
  const emailRequest={json:async()=>({op:'update_email',id:'synthetic-user',expected_email:'test@example.invalid',email:'new@example.invalid',role:'owner',perm_overrides:{'users.manage':true}})};
  await test('login email change retains the UUID and only changes Auth email and profile email',async()=>{
    const f=fixture();const r=await f.route.POST(emailRequest);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,id:'synthetic-user',email:'new@example.invalid'});
    assert.deepEqual(f.inputs.updated,[{id:'synthetic-user',email:'new@example.invalid',email_confirm:true}]);assert.deepEqual(f.inputs.profileUpdated,[{input:{email:'new@example.invalid'},filters:[['id','synthetic-user'],['email','test@example.invalid']]}]);assert.deepEqual(f.steps,['verify','auth-read','auth-update','auth-read','profile-update','auth-read']);assert.equal(f.inputs.inserted.length,0);
  });
  await test('login email change rejects owner external inactive and stale profile without Auth writes',async()=>{
    for(const options of [{targetRole:'owner'},{targetRole:'firm'},{targetRole:'partner'},{targetActive:false},{verify:{data:{id:'synthetic-user',email:'different@example.invalid',role:'agent',active:true}}}]){const f=fixture(options);const r=await f.route.POST(emailRequest);assert.ok(r.status>=400);assert.equal(f.inputs.updated.length,0);assert.equal(f.inputs.profileUpdated.length,0);}
  });
  await test('login email change checks the exact existing Auth identity before changing anything',async()=>{
    for(const user of [{id:'wrong',email:'test@example.invalid'},{id:'synthetic-user',email:'another@example.invalid'}]){const f=fixture({authReads:[{data:{user}}]});const r=await f.route.POST(emailRequest);assert.ok(r.status>=400);assert.equal(f.inputs.updated.length,0);assert.equal(f.inputs.profileUpdated.length,0);}
  });
  await test('login email Auth rejection and failed readback do not update the profile',async()=>{
    const old={data:{user:{id:'synthetic-user',email:'test@example.invalid'}}};
    for(const options of [{authUpdateError:true},{authReads:[old,old]},{authReads:[old,{data:null,error:{message:'offline'}}]}]){const f=fixture(options);const r=await f.route.POST(emailRequest);assert.ok(r.status>=400);assert.equal(r.body.ok,undefined);assert.equal(f.inputs.profileUpdated.length,0);}
  });
  await test('login email profile failure or race stays incomplete after the Auth change',async()=>{
    for(const profileSave of [{data:null,error:{message:'offline'}},{data:null,error:null},{data:{id:'different',email:'new@example.invalid'},error:null}]){const f=fixture({profileSave});const r=await f.route.POST(emailRequest);assert.equal(r.status,502);assert.match(r.body.error,/Retry this same email/);assert.equal(r.body.ok,undefined);}
  });
  await test('retry repairs an Auth-only email change on the same UUID without another Auth write',async()=>{
    const user={id:'synthetic-user',email:'new@example.invalid'};const f=fixture({authReads:[{data:{user}},{data:{user}},{data:{user}}]});const r=await f.route.POST(emailRequest);assert.equal(r.status,200);assert.equal(f.inputs.updated.length,0);assert.equal(f.inputs.profileUpdated.length,1);assert.equal(f.inputs.created.length,0);
  });
  await test('login email final Auth readback cannot report a different or unavailable login as success',async()=>{
    for(const final of [{data:{user:{id:'synthetic-user',email:'changed-again@example.invalid'}}},{data:null,error:{message:'offline'}}]){const f=fixture({authReads:[{data:{user:{id:'synthetic-user',email:'test@example.invalid'}}},{data:{user:{id:'synthetic-user',email:'new@example.invalid'}}},final]});const r=await f.route.POST(emailRequest);assert.equal(r.status,502);assert.equal(r.body.ok,undefined);}
  });
  let values=[],cursor=0,effect=null;
  const hooks={useState:initial=>{const index=cursor++;if(!(index in values))values[index]=initial;return[values[index],v=>{values[index]=typeof v==='function'?v(values[index]):v;}];},useEffect:fn=>{effect=fn;}};
  const ui=load('src/components/UserManager.tsx', {'react':hooks,'react/jsx-runtime':require(path.join(app,'node_modules/react/jsx-runtime')),'@/lib/permissions':load('src/lib/permissions.ts',{})});
  function render(){cursor=0;return renderToStaticMarkup(ui.default({firms:[]}));}
  async function fetchList(response){values=[];global.fetch=async()=>response;render();effect();await new Promise(resolve=>setImmediate(resolve));return render();}
  await test('UI failed roster shows Retry and never No users yet',async()=>{const html=await fetchList({ok:false,json:async()=>({error:'Synthetic failure'})});assert.match(html,/Synthetic failure/);assert.match(html,/Retry loading users/);assert.doesNotMatch(html,/No users yet/);});
  await test('UI genuine empty roster is distinguished from failed load',async()=>{const html=await fetchList({ok:true,json:async()=>({users:[]})});assert.match(html,/No users yet/);assert.doesNotMatch(html,/Retry loading users/);});
  await test('UI non-JSON roster response offers retry',async()=>{const html=await fetchList({ok:false,json:async()=>{throw new Error('Synthetic bad response');}});assert.match(html,/Retry loading users/);assert.doesNotMatch(html,/No users yet/);});
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
