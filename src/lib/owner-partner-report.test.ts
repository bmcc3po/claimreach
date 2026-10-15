import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
import { gateUser } from './gate';
import { partnerReportHarness } from './partner-report-test-harness';
import { FakeDb } from './test-fake-db';
import * as reportAccess from './partner-report-access';

async function harness() {
  const report = await partnerReportHarness();
  const account:any={id:'owner',role:'owner',active:true};
  const session=new FakeDb({app_users:[account]});
  let signedIn=true,adminReads=0,available=true,fail=false;
  (session as any).auth={getUser:async()=>({data:{user:signedIn?{id:account.id}:null}})};
  const out:any={};
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../app/api/owner/pr-digital-report/route.ts'),'utf8'),{compilerOptions:{module:1,target:9}}).outputText;
  const modules:Record<string,any>={
    'next/server':require('next/server'),
    '@/lib/supabase-server':{supabaseServer:async()=>session,supabaseAdmin:()=>{adminReads++;return report.db;}},
    '@/lib/gate':{gateUser},'@/lib/partner-report-access':reportAccess,
    '@/lib/partner-report-server':{
      loadReportAccess:async(db:any)=>{assert.equal(db,report.db);return available?report.config:null;},
      loadPartnerReport:async(db:any,access:any)=>{assert.equal(access,report.config);if(fail)throw Error('read failure');return report.server.loadPartnerReport(db,access);},
    },
  };
  new Function('require','exports',code)((key:string)=>{assert.ok(key in modules,key);return modules[key];},out);
  return {route:out,report,account,session,setSignedIn:(v:boolean)=>{signedIn=v;},setAvailable:(v:boolean)=>{available=v;},setFail:(v:boolean)=>{fail=v;},adminReads:()=>adminReads};
}

test('owner preview requires a real active owner session before accessing the privileged report loader',async()=>{
  const h=await harness();h.setSignedIn(false);assert.equal((await h.route.GET()).status,401);
  h.setSignedIn(true);
  for(const role of ['admin','supervisor','agent','qa','firm','partner']){h.account.role=role;assert.equal((await h.route.GET()).status,403,role);}
  h.account.role='owner';h.account.active=false;assert.equal((await h.route.GET()).status,401);
  assert.equal(h.adminReads(),0);assert.equal(h.report.db.ops.length,0);
});

test('owner preview shares the exact PR Digital source allowlist and exposes no extra staff data or cookies',async()=>{
  const h=await harness();h.report.config.scope='approved_sources';
  let response=await h.route.GET();assert.equal(response.status,200);assert.equal((await response.json()).rows.length,0,'owner cannot widen approved source scope');
  h.report.db.tables.partner_source_leads=[{partner_key:'pr-digital',firm_id:h.report.config.firm_id,source_system:'lawruler',source_lead_id:'100'}];
  response=await h.route.GET();const data=await response.json();assert.equal(data.rows.length,1);
  const external=await h.report.server.loadPartnerReport(h.report.db,h.report.config);
  assert.deepEqual(data.rows,external.rows);assert.deepEqual(data.summary,external.summary);
  assert.ok(!JSON.stringify(data).includes(h.report.config.token_secret));assert.ok(!JSON.stringify(data).includes(h.report.config.password_hash));
  assert.match(response.headers.get('cache-control')||'',/no-store/);assert.equal(response.headers.get('set-cookie'),null);
  assert.ok(h.report.db.ops.every(o=>o.kind==='select'),'preview never writes any record');
  assert.equal(h.route.POST,undefined);assert.equal(h.route.DELETE,undefined);
});

test('disabled external reports and failed evidence queries fail closed in owner preview',async()=>{
  const h=await harness();h.setAvailable(false);let r=await h.route.GET();assert.equal(r.status,503);assert.equal((await r.json()).rows,undefined);
  h.setAvailable(true);h.setFail(true);r=await h.route.GET();assert.equal(r.status,503);assert.equal((await r.json()).rows,undefined);
});
