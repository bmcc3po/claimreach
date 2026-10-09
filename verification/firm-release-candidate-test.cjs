// Isolated PostgreSQL role proof, synthetic rows, no production connections.
// Tests the candidate fixture only. NOT full deployed RLS/portal acceptance.
const {PGlite}=require('@electric-sql/pglite');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
(async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table app_users(id uuid primary key,role text,firm_id uuid,active boolean);
 create table leads(id uuid primary key,firm_id uuid,lead_no text,claimant_name text,
 phone text,email text,archived_at timestamptz,answers jsonb,vendor_fields jsonb);
 create table statuses(key text primary key,active boolean,unlocks_firm boolean);
 create table claims(id uuid primary key,lead_id uuid,firm_id uuid,claim_type text,status text,answers jsonb);
 create table case_documents(id uuid primary key,lead_id uuid,claim_id uuid,firm_id uuid,storage_path text);
 create function my_firm_id() returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select firm_id from public.app_users where id=auth.uid() and active=true $$;
 create function is_internal() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.app_users where id=auth.uid() and active=true and role in ('owner','agent')) $$;
 grant usage on schema public,auth to authenticated,anon;
 grant select on leads,claims,case_documents to authenticated,anon;
 alter table leads enable row level security; alter table claims enable row level security; alter table case_documents enable row level security;
 create policy leads_firm_read on leads for select to authenticated using (firm_id=my_firm_id());
 create policy claims_firm_read on claims for select to authenticated using (firm_id=my_firm_id());
 create policy case_docs_firm on case_documents for all to authenticated using (firm_id=my_firm_id()) with check (firm_id=my_firm_id());
 create policy leads_internal_all on leads for all to authenticated using (is_internal());
 create policy claims_internal_all on claims for all to authenticated using (is_internal());
 create policy case_docs_internal on case_documents for all to authenticated using (is_internal());
 insert into app_users values ('${id(1)}','owner',null,true),('${id(2)}','agent',null,true),
 ('${id(3)}','firm','${id(10)}',true),('${id(4)}','firm','${id(11)}',true),
 ('${id(5)}','firm','${id(10)}',false);
 insert into statuses values ('approved',true,true),('pending',true,false),('inactive-release',false,true);
 insert into leads values ('${id(20)}','${id(10)}','SYNTH-20','Synthetic One','000','synthetic@example.invalid',null,'{"privateSibling":"pending"}','{"privateVendor":"secret"}'),
 ('${id(21)}','${id(11)}','SYNTH-21','Synthetic Two','000','synthetic2@example.invalid',null,'{}','{}'),
 ('${id(22)}','${id(10)}','SYNTH-22','Synthetic Archive','000','synthetic3@example.invalid',now(),'{}','{}');
 insert into claims values ('${id(30)}','${id(20)}','${id(10)}','mva','approved','{"own":"released"}'),
 ('${id(31)}','${id(20)}','${id(10)}','mva','pending','{"sibling":"pending"}'),
 ('${id(32)}','${id(21)}','${id(11)}','mva','approved','{"foreign":"secret"}'),
 ('${id(33)}','${id(22)}','${id(10)}','mva','approved','{}'),
 ('${id(34)}','${id(20)}','${id(10)}','mva','unknown','{}'),
 ('${id(35)}','${id(20)}','${id(10)}','mva','inactive-release','{}');
 insert into case_documents values ('${id(40)}','${id(20)}','${id(30)}','${id(10)}','own.pdf'),
 ('${id(41)}','${id(20)}','${id(31)}','${id(10)}','pending.pdf'),
 ('${id(42)}','${id(20)}',null,'${id(10)}','legacy.pdf'),
 ('${id(43)}','${id(21)}','${id(32)}','${id(11)}','foreign.pdf'),
 ('${id(44)}','${id(21)}','${id(30)}','${id(10)}','wrong-lead.pdf');
 `);
 const actor=async(n,role='authenticated')=>{await db.exec('reset role');await db.exec(`set role ${role}; set request.jwt.claim.sub='${n?id(n):''}'`);};
 const rows=async(sql,args)=>(await db.query(sql,args)).rows;
 const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name);};
 await actor(3);
 check('baseline broad own-firm policy permits the pending sibling', (await rows(`select id from claims where id='${id(31)}'`)).length,1);
 check('baseline raw lead contains sibling/vendor aggregate', (await rows(`select answers->>'privateSibling' v from leads where id='${id(20)}'`))[0].v,'pending');
 await db.exec('reset role');
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/firm-release-candidate.sql'),'utf8'));
 for(const n of [1,2]){await actor(n);check(`${n===1?'owner':'agent'} existing permissive access retained`,(await rows('select id from claims')).length,6);check('internal raw lead remains available',(await rows('select id from leads')).length,3);}
 await actor(3);
 check('correct firm sees only its released unarchived matter',(await rows('select id from claims')).map(x=>x.id),[id(30)]);
 check('raw aggregate lead is denied even with approved sibling',(await rows('select id from leads')).length,0);
 check('only exact matter document is readable',(await rows('select storage_path from case_documents')).map(x=>x.storage_path),['own.pdf']);
 const projected=await rows('select * from cr_portal_matter($1)',[id(30)]);
 check('projection returns only selected answers',projected[0].answers,{own:'released'});
 check('projection omits vendor and aggregate columns',Object.keys(projected[0]),['lead_id','claim_id','lead_no','claimant_name','phone','email','claim_type','status','answers']);
 for(const n of [31,32,33,34,35])check(`pending/foreign/archive/unknown/inactive-status projection ${n} denied`,(await rows('select * from cr_portal_matter($1)',[id(n)])).length,0);
 await actor(4);check('other firm cannot read first firm matter',(await rows('select * from cr_portal_matter($1)',[id(30)])).length,0);
 check('other firm retains only its own released matter',(await rows('select id from claims')).map(x=>x.id),[id(32)]);
 await actor(5);check('inactive firm reads zero claims',(await rows('select id from claims')).length,0);check('inactive projection denied',(await rows('select * from cr_portal_matter($1)',[id(30)])).length,0);
 await actor(0);check('authenticated without account denied',(await rows('select id from claims')).length,0);
 await actor(0,'anon');check('anonymous reads zero claims',(await rows('select id from claims')).length,0);
 await assert.rejects(()=>rows('select * from cr_portal_matter($1)',[id(30)]),/permission denied/);checks++;console.log('PASS anonymous cannot execute projection');
 await db.exec('reset role');await db.exec("update statuses set unlocks_firm=false where key='approved'");await actor(3);
 check('revoked catalog release immediately removes claim access',(await rows('select id from claims')).length,0);
 check('revoked release removes document access',(await rows('select id from case_documents')).length,0);
 check('revoked release removes projection',(await rows('select * from cr_portal_matter($1)',[id(30)])).length,0);
 console.log(`${checks} isolated PostgreSQL candidate checks passed; not production acceptance`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
