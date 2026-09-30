// Real isolated PostgreSQL roles/RLS, synthetic data only, no network.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/0121_pilot_database_boundary.sql'),'utf8');
const passwordDocumentMigration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/0123_pilot_password_document_boundary.sql'),'utf8');
const documentGuardSource = fs.readFileSync(path.join(__dirname,'../supabase/migrations/0103_round3_hardening.sql'),'utf8');
const documentGuard = documentGuardSource.slice(documentGuardSource.indexOf('create or replace function public.guard_case_documents()')).split('end $$;')[0]+'end $$;';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1), agent=id(2), admin=id(3), disabled=id(4), firm=id(5), partner=id(6), newcomer=id(7), badNewcomer=id(8);
const tmp=id(10), tmt=id(11), inno=id(20), other=id(21), live=id(30), archive=id(31), foreign=id(32), mixed=id(33), claim=id(40), foreignClaim=id(41), wrongType=id(42);
let checks=0;
// Execute the real file handler. Its document query is backed by this isolated
// PostgreSQL session; only auth, unrelated helpers, and Storage URL issuance
// are stubbed. Record exactly which object paths reach privileged signing.
async function fileDocumentPaths(db) {
  const ts=require('typescript');
  const source=fs.readFileSync(path.join(__dirname,'../src/app/api/calls/file/route.ts'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const signedPaths=[];
  const sb={from(table){
    const filters=[];
    const q={select(){return q;},eq(col,value){filters.push([col,value]);return q;},or(){return q;},order(){return q;},limit(){return q;},
      async run(){
        if(table==='case_documents') return {data:(await db.query('select * from case_documents where lead_id=$1 and (claim_id=$2 or claim_id is null)',[live,claim])).rows,error:null};
        if(table==='leads') return {data:(await db.query('select * from leads where id=$1',[filters.find(([c])=>c==='id')[1]])).rows,error:null};
        if(table==='app_users') return {data:(await db.query('select * from app_users')).rows,error:null};
        return {data:[],error:null};
      },async maybeSingle(){const result=await q.run();return {...result,data:result.data[0]||null};},then(resolve,reject){return q.run().then(resolve,reject);}};
    return q;
  }};
  const modules={
    'next/server':{NextResponse:{json:payload=>({payload})}},
    '@/lib/supabase-server':{supabaseServer:async()=>sb,supabaseAdmin:()=>({storage:{from:()=>({createSignedUrl:async key=>{signedPaths.push(key);return {data:{signedUrl:'synthetic://'+key}};}})}})},
    '@/lib/mva-call/server':{requireStaff:async()=>({role:'agent'})},
    '@/lib/mva-call/signing-matter':{resolveSigningMatter:async()=>({ok:true,lead:{},matter:{claim:{id:claim,campaign:'INNO MVA'}}})},
    '@/lib/file-notes':{loadFileNotes:async()=>({notes:[],deskNotes:[]}),mergeFileNotes:()=>[]},
    '@/lib/claim-status':{loadStatuses:async()=>[]},'@/lib/statuses':{resolveStatus:()=>null},
    '@/lib/matter':{matterRowsFilter:()=>`claim_id.eq.${claim}`},
    '@/lib/lawruler-recovery':{loadLawRulerProvenance:async()=>null},
    '@/lib/mva-call/send-attempt':{readPendingSendAttempt:async()=>({ok:true,attempt:null})},
    '@/lib/mva-call/agreement-names':{agreementName:key=>key},
  };
  const exports={};new Function('require','exports',code)(name=>{assert.ok(name in modules,name);return modules[name];},exports);
  const response=await exports.GET({url:`https://synthetic.invalid/api/calls/file?lead_id=${live}&claim_id=${claim}`});
  assert.ok(Array.isArray(response.payload.docs));
  return signedPaths;
}
async function main() {
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
      create table public.firms(id uuid primary key,slug text,lead_prefix text);
      create table public.app_users(id uuid primary key,firm_id uuid,role text,active boolean default true,email text,full_name text,perm_overrides jsonb default '{}');
      create table public.campaigns(id uuid primary key,firm_id uuid,name text,case_type text,active boolean);
      create table public.leads(id uuid primary key,firm_id uuid,campaign_id uuid,case_type text,archived_at timestamptz,claimant_name text);
      create table public.claims(id uuid primary key,lead_id uuid,firm_id uuid,campaign_id uuid,claim_type text,answers jsonb);
      create table public.notes(id uuid primary key,lead_id uuid,claim_id uuid,firm_id uuid,campaign_id uuid,body text);
      create table public.intake_calls(id uuid primary key,lead_id uuid,claim_id uuid,firm_id uuid,body text);
      create table public.esign_submissions(id uuid primary key,lead_id uuid,claim_id uuid,firm_id uuid,campaign_id uuid,status text,completed_pdf_path text);
      create table public.signable_documents(id uuid primary key,lead_id uuid,firm_id uuid,audit jsonb);
      create table public.case_documents(id uuid primary key,lead_id uuid,claim_id uuid,firm_id uuid,storage_path text,file_name text,doc_type text,created_at timestamptz default now(),uploaded_by_name text);
      create table public.esign_templates(id uuid primary key,firm_id uuid,campaign_id uuid,name text);
      create table public.intake_forms(id uuid primary key,firm_id uuid,campaign_id uuid,claim_type text,status text,fields jsonb);
      create table public.statuses(id uuid primary key,label text);
      create table public.firm_access(email text,firm_slug text,role text,full_name text);
      create table public.retention_alert_recipients(email text,campaign text,active boolean);
      create table public.unclassified_private(id uuid primary key,body text);
      create table public.write_only_private(id uuid primary key,body text);
      create table public.drip_rules(id uuid primary key,firm_id uuid,campaign text,active boolean,every_days integer);
      create table public.drip_enrollments(firm_id uuid,lead_id uuid,rule_id uuid,next_due timestamptz,active boolean);
      create table storage.buckets(id text primary key,public boolean);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      create view public.safe_leads with (security_invoker=true) as select * from public.leads;
      create sequence public.global_lead_seq;
      create function public.is_internal() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from app_users where id=auth.uid() and active and role in ('owner','admin','manager','agent','qa'))$$;
      create function public.my_firm_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$select firm_id from app_users where id=auth.uid() and active$$;
      create function public.role_is_firm() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from app_users where id=auth.uid() and active and role='firm')$$;
      create function public.m6_log_touch(uuid,text,text,text,uuid,text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
      declare uid uuid:=auth.uid(); begin
        if uid is null then raise exception 'Sign in'; end if;
        if not is_internal() and not role_is_firm() then raise exception 'Forbidden'; end if;
        return uid;
      end $$;
      grant usage on schema public,auth,storage to authenticated,service_role;
      grant all on all tables in schema public,storage to authenticated,service_role;
      revoke select on public.write_only_private from authenticated;
      grant usage on sequence public.global_lead_seq to authenticated,service_role;
      grant execute on all functions in schema public,auth to authenticated,service_role;
      alter table storage.objects enable row level security;
    `);
    // Use the actual canonical path/lead/claim trigger, not a weakened model.
    await db.exec(documentGuard + `create trigger guard_case_docs before insert or update on public.case_documents for each row execute function public.guard_case_documents();`);
    const dripSource=fs.readFileSync(path.join(__dirname,'../supabase/migrations/0092_m6_cadence.sql'),'utf8');
    const dripFunction=dripSource.slice(dripSource.indexOf('create or replace function enroll_drips_for_lead')).split('$$;')[0]+'$$;';
    await db.exec(dripFunction+`revoke execute on function public.enroll_drips_for_lead(uuid,uuid) from anon,authenticated;`);
    const tables=(await db.query(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'`)).rows.map(r=>r.relname);
    for (const table of tables) {
      await db.exec(`alter table public.${table} enable row level security;
        create policy existing_internal on public.${table} for all to authenticated using(is_internal()) with check(is_internal());`);
    }
    await db.exec(`create policy firm_leads on leads for select to authenticated using(role_is_firm() and firm_id=my_firm_id());
      create policy firm_claims on claims for select to authenticated using(role_is_firm() and firm_id=my_firm_id());
      create policy firm_documents on case_documents for all to authenticated using(role_is_firm() and firm_id=my_firm_id()) with check(role_is_firm() and firm_id=my_firm_id());
      create policy partner_leads on leads for select to authenticated using(auth.uid()='${partner}' and id='${live}');
      create policy own_profile on app_users for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
      -- Deliberately permissive policy models a firm account's users.manage override.
      create policy unsafe_user_override on app_users for all to authenticated using(auth.uid()='${firm}') with check(auth.uid()='${firm}');
      insert into firms values('${tmp}','tmp','TMP'),('${tmt}','tmt','TMT');
      insert into app_users(id,firm_id,role,active,email,full_name) values
       ('${owner}','${tmp}','owner',true,'owner@example.invalid','Owner'),
       ('${agent}','${tmp}','agent',true,'agent@example.invalid','Agent'),
       ('${admin}','${tmp}','admin',true,'admin@example.invalid','Admin'),
       ('${disabled}','${tmp}','agent',false,'disabled@example.invalid','Disabled'),
       ('${firm}','${tmt}','firm',true,'firm@example.invalid','Firm');
      insert into auth.users(id,email,raw_app_meta_data) select id,email,'{}' from app_users;
      insert into auth.users(id,email,raw_app_meta_data) values('${partner}','partner@example.invalid','{"account_type":"partner"}'),('${newcomer}','new@example.invalid','{}'),('${badNewcomer}','bad@example.invalid','{}');
      insert into campaigns values('${inno}','${tmp}','INNO MVA','mva',true),('${other}','${tmt}','Other MVA','mva',true);
      insert into leads values('${live}','${tmp}','${inno}','mva',null,'Live'),('${archive}','${tmp}','${inno}','mva',now(),'Archived'),('${foreign}','${tmt}','${other}','mva',null,'Other'),('${mixed}','${tmp}','${inno}','motel_trafficking',null,'Wrong type');
      insert into claims values('${claim}','${live}','${tmp}','${inno}','mva','{}'),('${foreignClaim}','${foreign}','${tmt}','${other}','mva','{}'),('${wrongType}','${live}','${tmp}','${inno}','motel_trafficking','{}');
      insert into case_documents(id,lead_id,claim_id,firm_id,storage_path,file_name) values
        ('${id(110)}','${live}','${claim}','${tmp}','${tmp}/${live}/visible.pdf','visible.pdf'),
        ('${id(111)}','${live}','${wrongType}','${tmp}','${tmp}/${live}/hidden-sibling.pdf','hidden-sibling.pdf'),
        ('${id(112)}','${foreign}','${foreignClaim}','${tmt}','${tmt}/${foreign}/foreign.pdf','foreign.pdf');
      insert into drip_rules values('${id(120)}','${tmt}',null,true,1);
      insert into notes values('${id(50)}','${live}','${claim}','${tmp}',null,'Legacy valid'),('${id(51)}','${live}','${foreignClaim}','${tmp}',null,'Wrong claim'),('${id(52)}','${live}','${claim}','${tmp}','${other}','Wrong campaign'),('${id(53)}','${live}','${claim}','${tmt}',null,'Wrong firm');
      insert into intake_forms values('${id(60)}',null,null,'mva','published','[]'),('${id(61)}',null,null,'motel_trafficking','published','[]'),('${id(62)}','${tmt}',null,'mva','published','[]'),('${id(63)}','${tmp}','${inno}','mva','draft','[]');
      insert into esign_submissions values('${id(70)}','${live}','${claim}','${tmp}',null,'signed','pilot/file.pdf'),('${id(71)}','${foreign}','${foreignClaim}','${tmt}','${other}','signed','other/file.pdf');
      insert into esign_templates values('${id(72)}','${tmp}','${inno}','Nevada non-tiered');
      insert into statuses values('${id(80)}','New');
      insert into unclassified_private values('${id(81)}','private');
      insert into firm_access values('agent@example.invalid','tmt','firm','Agent'),('disabled@example.invalid','tmt','firm','Disabled'),('partner@example.invalid','tmt','firm','Partner'),('new@example.invalid','tmt','firm','New'),('bad@example.invalid','tmp','owner','Bad');
      insert into retention_alert_recipients values('firm@example.invalid','motel6',true);
      insert into storage.buckets values('signed-docs',false),('case-docs',false),('retainer-pdfs',false);
      insert into storage.objects values('${id(90)}','signed-docs','hidden.pdf');
    `);
    await db.exec(migration);
    async function check(name,fn){await fn();checks++;console.log('ok',name);}
    async function as(who,fn,role='authenticated') {
      await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)`,[who,role]);
      await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');}
    }
    const rows=t=>db.query(`select * from ${t}`);
    await check('all exposed tables, including write-only tables, have restrictive guards',async()=>{
      assert.equal((await db.query(`select count(*)::int n from pg_policies where policyname='cr_inno_mva_staff_wall' and permissive='RESTRICTIVE'`)).rows[0].n,tables.length);
      assert.equal((await db.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')`)).rows[0].n,0);
    });
    await check('reproduces old same-lead hidden-claim path forgery through actual file GET before 0123',()=>as(agent,async()=>{
      assert.deepEqual((await rows('case_documents')).rows.map(r=>r.id),[id(110)]);
      assert.deepEqual(await fileDocumentPaths(db),[`${tmp}/${live}/visible.pdf`]);
      await db.query('update case_documents set storage_path=$1 where id=$2',[`${tmp}/${live}/hidden-sibling.pdf`,id(110)]);
      assert.deepEqual(await fileDocumentPaths(db),[`${tmp}/${live}/hidden-sibling.pdf`]);
      await db.query(`insert into case_documents(id,lead_id,claim_id,firm_id,storage_path) values($1,$2,$3,$4,$5)`,[id(113),live,claim,tmp,`${tmp}/${live}/hidden-sibling.pdf`]);
      assert.equal((await fileDocumentPaths(db)).filter(p=>p.endsWith('hidden-sibling.pdf')).length,2);
    }));
    await db.query('delete from case_documents where id=$1',[id(113)]);
    await db.query('update case_documents set storage_path=$1 where id=$2',[`${tmp}/${live}/visible.pdf`,id(110)]);
    await check('historical named-role-only RPC revoke leaves PUBLIC execute in isolated reconstruction',async()=>{
      assert.equal((await db.query(`select has_function_privilege('authenticated','public.enroll_drips_for_lead(uuid,uuid)','EXECUTE') ok`)).rows[0].ok,true);
      await as(agent,async()=>db.query('select enroll_drips_for_lead($1,$2)',[foreign,tmt]));
      assert.equal((await rows('drip_enrollments')).rows.length,1);
      await db.exec('delete from drip_enrollments');
    });
    await db.exec(passwordDocumentMigration);
    await check('0123 adds password guards to every exposed table with restricted helper ACL and empty search path',async()=>{
      assert.equal((await db.query(`select count(*)::int n from pg_policies where policyname='cr_pilot_password_wall' and permissive='RESTRICTIVE'`)).rows[0].n,tables.length);
      const fn=(await db.query(`select prosecdef,proconfig from pg_proc where oid='public.cr_pilot_password_required()'::regprocedure`)).rows[0];
      assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=""'));
      for(const role of ['anon','authenticated','service_role']) assert.equal((await db.query(`select has_function_privilege($1,'public.cr_pilot_password_required()','EXECUTE') ok`,[role])).rows[0].ok,role!=='anon');
      assert.equal((await db.query(`select count(*)::int n from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.cr_pilot_password_required()'::regprocedure and a.grantee=0`)).rows[0].n,0);
    });
    for(const who of [agent,admin]) await check('staff document reads remain scoped; forged index insert/update/delete cannot reach URL signer '+who,()=>as(who,async()=>{
      assert.deepEqual((await rows('case_documents')).rows.map(r=>r.id),[id(110)]);
      for(const path of [`${tmp}/${live}/hidden-sibling.pdf`,`${tmt}/${foreign}/foreign.pdf`]) {
        assert.equal((await db.query('update case_documents set storage_path=$1 where id=$2 returning id',[path,id(110)])).rows.length,0);
        await assert.rejects(db.query(`insert into case_documents(id,lead_id,claim_id,firm_id,storage_path) values($1,$2,$3,$4,$5)`,[id(113),live,claim,tmp,path]));
      }
      assert.equal((await db.query('delete from case_documents where id=$1 returning id',[id(110)])).rows.length,0);
      assert.deepEqual(await fileDocumentPaths(db),[`${tmp}/${live}/visible.pdf`]);
    }));
    await check('owner, firm, and service retain their original document-index writes',async()=>{
      for(const [who,doc,key,role] of [[owner,id(110),`${tmp}/${live}/visible.pdf`,'authenticated'],[firm,id(112),`${tmt}/${foreign}/foreign.pdf`,'authenticated'],['',id(110),`${tmp}/${live}/visible.pdf`,'service_role']]) {
        await as(who,async()=>assert.equal((await db.query('update case_documents set storage_path=$1 where id=$2 returning id',[key,doc])).rows.length,1),role);
      }
    });
    await check('first-password gate uses current trusted Auth row, denies data and mutations despite permissive grants, keeps own profile',async()=>{
      for(const who of [agent,admin]) {
        await db.query(`update auth.users set raw_app_meta_data='{"must_change_password":true}',raw_user_meta_data='{"must_change_password":false}' where id=$1`,[who]);
        await db.exec(`select set_config('request.jwt.claims','{"app_metadata":{"must_change_password":false},"user_metadata":{"must_change_password":false}}',false)`);
        await as(who,async()=>{
          assert.equal((await db.query('select cr_pilot_password_required() required')).rows[0].required,true);
          for(const table of ['leads','safe_leads','claims','case_documents','esign_submissions','notes','intake_calls','statuses','campaigns','firms']) assert.equal((await rows(table)).rows.length,0,table);
          assert.deepEqual((await rows('app_users')).rows.map(r=>r.id),[who]);
          assert.equal((await db.query(`update claims set answers='{"tampered":true}' where id=$1 returning id`,[claim])).rows.length,0);
          await assert.rejects(db.query(`insert into notes values($1,$2,$3,$4,null,'blocked')`,[id(114),live,claim,tmp]));
          assert.equal((await db.query(`update app_users set role='owner' where id=$1 returning id`,[who])).rows.length,0);
          assert.equal((await db.query(`update app_users set full_name='Changed' where id=$1 returning id`,[who])).rows.length,0);
          await assert.rejects(db.query('select mint_lead_no($1)',[tmp]),/temporary password/);
          assert.equal((await db.query('select provision_self_from_firm_access() ok')).rows[0].ok,false);
        });
        await db.query(`update auth.users set raw_app_meta_data='{"must_change_password":false}',raw_user_meta_data='{"must_change_password":true}' where id=$1`,[who]);
        await db.exec(`select set_config('request.jwt.claims','{"app_metadata":{"must_change_password":true}}',false)`);
        await as(who,async()=>{
          assert.equal((await db.query('select cr_pilot_password_required() required')).rows[0].required,false);
          assert.deepEqual((await rows('leads')).rows.map(r=>r.id),[live]);
          assert.deepEqual((await rows('claims')).rows.map(r=>r.id),[claim]);
          assert.deepEqual(await fileDocumentPaths(db),[`${tmp}/${live}/visible.pdf`]);
        });
      }
      await as('',async()=>{
        assert.equal((await db.query('select cr_pilot_password_required() required')).rows[0].required,false);
        assert.equal((await rows('leads')).rows.length,0);
      });
    });
    await check('owner, firm and partner scopes are unchanged even with first-password metadata',async()=>{
      for(const [who,expected] of [[owner,4],[firm,1],[partner,1]]) {
        await db.query(`update auth.users set raw_app_meta_data=raw_app_meta_data||'{"must_change_password":true}'::jsonb where id=$1`,[who]);
        await as(who,async()=>{
          assert.equal((await db.query('select cr_pilot_password_required() required')).rows[0].required,false);
          assert.equal((await rows('leads')).rows.length,expected);
        });
      }
    });
    await check('server-only enrollment ACL denies PUBLIC, anon, authenticated and preserves service',async()=>{
      for(const role of ['anon','authenticated','service_role']) assert.equal((await db.query(`select has_function_privilege($1,'public.enroll_drips_for_lead(uuid,uuid)','EXECUTE') ok`,[role])).rows[0].ok,role==='service_role');
      await as(agent,async()=>assert.rejects(db.query('select enroll_drips_for_lead($1,$2)',[foreign,tmt]),/permission denied/));
      await as('',async()=>db.query('select enroll_drips_for_lead($1,$2)',[foreign,tmt]),'service_role');
      assert.equal((await rows('drip_enrollments')).rows.length,1);
    });
    for(const user of [agent,admin]) await check('staff read only live INNO matter, matching legacy child, and published MVA master '+user,()=>as(user,async()=>{
      assert.deepEqual((await rows('leads')).rows.map(r=>r.id),[live]);
      assert.deepEqual((await rows('safe_leads')).rows.map(r=>r.id),[live]);
      assert.deepEqual((await rows('claims')).rows.map(r=>r.id),[claim]);
      assert.deepEqual((await rows('notes')).rows.map(r=>r.body),['Legacy valid']);
      assert.deepEqual((await rows('intake_forms')).rows.map(r=>r.id),[id(60)]);
      assert.deepEqual((await rows('esign_submissions')).rows.map(r=>r.id),[id(70)]);
      assert.equal((await rows('unclassified_private')).rows.length,0);
      assert.equal((await rows('storage.objects')).rows.length,0);
    }));
    await check('agent can save pilot intake, answers, notes and calls',()=>as(agent,async()=>{
      assert.equal((await db.query(`update leads set claimant_name='Corrected' where id=$1 returning id`,[live])).rows.length,1);
      assert.equal((await db.query(`update claims set answers='{"injury":"yes"}' where id=$1 returning id`,[claim])).rows.length,1);
      assert.equal((await db.query(`insert into intake_calls values($1,$2,$3,$4,'active') returning id`,[id(91),live,claim,tmp])).rows.length,1);
      assert.equal((await db.query(`insert into notes values($1,$2,$3,$4,null,'New note') returning id`,[id(92),live,claim,tmp])).rows.length,1);
    }));
    await check('agent cannot reparent files, cross-bind notes, archive or hard-delete',()=>as(agent,async()=>{
      await assert.rejects(db.query('update leads set campaign_id=$1 where id=$2',[other,live]));
      await assert.rejects(db.query('update claims set lead_id=$1 where id=$2',[foreign,claim]));
      await assert.rejects(db.query('update claims set claim_type=$1 where id=$2',['motel_trafficking',claim]));
      await assert.rejects(db.query(`insert into notes values($1,$2,$3,$4,null,'bad')`,[id(93),live,foreignClaim,tmp]));
      await assert.rejects(db.query('update leads set archived_at=now() where id=$1',[live]));
      assert.equal((await db.query('delete from leads where id=$1 returning id',[live])).rows.length,0);
      await assert.rejects(db.exec('truncate leads'));
    }));
    await check('agent cannot transplant matter to another visible INNO claimant',async()=>{
      await db.query(`insert into leads values($1,$2,$3,'mva',null,'Sibling')`,[id(97),tmp,inno]);
      await as(agent,async()=>{
        assert.equal((await db.query('select id from leads where id=$1',[id(97)])).rows.length,1);
        await assert.rejects(db.query('update claims set lead_id=$1 where id=$2',[id(97),claim]));
      });
      await db.query('delete from leads where id=$1',[id(97)]);
    });
    await check('RLS-hidden sibling cannot make unbound old evidence look like the sole pilot matter',async()=>{
      // live has one visible INNO claim plus a hidden non-MVA sibling already.
      await db.query(`insert into esign_submissions values($1,$2,null,$3,null,'signed','ambiguous.pdf')`,[id(101),live,tmp]);
      await db.query(`insert into intake_calls values($1,$2,null,$3,'ambiguous')`,[id(102),live,tmp]);
      await db.query(`insert into signable_documents values($1,$4,$5,'{}'),($2,$4,$5,$6),($3,$4,$5,$7)`,[id(103),id(104),id(105),live,tmp,JSON.stringify({emergency:{claim_id:claim,campaign_id:inno}}),JSON.stringify({emergency:{claim_id:wrongType,campaign_id:inno}})]);
      await as(agent,async()=>{
        assert.equal((await db.query('select cr_pilot_legacy_matter_allowed($1) ok',[live])).rows[0].ok,false);
        assert.equal((await db.query('select id from esign_submissions where id=$1',[id(101)])).rows.length,0);
        assert.equal((await db.query('select id from intake_calls where id=$1',[id(102)])).rows.length,0);
        assert.deepEqual((await rows('signable_documents')).rows.map(r=>r.id),[id(104)]);
      });
      // Once owner removes the synthetic hidden sibling, unbound single-matter
      // history remains available. There is no requirement to rewrite old rows.
      await db.query('delete from claims where id=$1',[wrongType]);
      await as(agent,async()=>{
        assert.equal((await db.query('select cr_pilot_legacy_matter_allowed($1) ok',[live])).rows[0].ok,true);
        assert.equal((await db.query('select id from esign_submissions where id=$1',[id(101)])).rows.length,1);
        assert.equal((await db.query('select id from intake_calls where id=$1',[id(102)])).rows.length,1);
      });
    });
    await check('agent cannot void signed evidence, change stored PDF path, templates or settings',()=>as(agent,async()=>{
      assert.equal((await db.query(`update esign_submissions set status='voided',completed_pdf_path='other/file.pdf' returning id`)).rows.length,0);
      await assert.rejects(db.query(`insert into esign_submissions values($1,$2,$3,$4,null,'signed','fake.pdf')`,[id(94),live,claim,tmp]));
      assert.equal((await db.query(`update esign_templates set name='wrong' returning id`)).rows.length,0);
      assert.equal((await db.query(`update campaigns set name='wrong' returning id`)).rows.length,0);
      assert.equal((await db.query(`update intake_forms set fields='["wrong"]' returning id`)).rows.length,0);
      await assert.rejects(db.query(`insert into write_only_private values($1,'bad')`,[id(95)]));
    }));
    await check('admin and firm permissions cannot elevate roles, provision over users or delete identities',async()=>{
      for(const user of [admin,firm]) await as(user,async()=>{
        const run=db.query(`update app_users set role='owner' where id=$1 returning id`,[user]);
        if(user===firm) await assert.rejects(run); else assert.equal((await run).rows.length,0);
        assert.equal((await db.query(`delete from app_users where id=$1 returning id`,[user])).rows.length,0);
        await assert.rejects(db.query(`insert into app_users(id,role,active) values($1,'owner',true)`,[id(96)]));
      });
      for(const user of [owner,agent,admin,disabled,partner,firm,badNewcomer]) await as(user,async()=>{
        assert.equal((await db.query('select provision_self_from_firm_access() ok')).rows[0].ok,false);
      });
      await as(firm,async()=>{
        assert.equal((await db.query(`update app_users set full_name='Own corrected' where id=$1 returning id`,[firm])).rows.length,1);
        assert.equal((await db.query(`update app_users set full_name='Someone else' where id=$1 returning id`,[agent])).rows.length,0);
      });
    });
    await check('deactivated internal account sees no files even if another permissive policy grants them',async()=>{
      await db.exec(`create policy dangerous_firm_id on leads for select to authenticated using(auth.uid()='${disabled}');`);
      await as(disabled,async()=>assert.equal((await rows('leads')).rows.length,0));
    });
    await check('existing firm and partner scopes remain distinct and unchanged',async()=>{
      await as(firm,async()=>{
        assert.deepEqual((await rows('leads')).rows.map(r=>r.id),[foreign]);
        assert.equal((await db.query(`select m6_log_touch($1,'two_way','ad_hoc','call',null,null) id`,[foreign])).rows[0].id,firm);
        assert.equal((await db.query(`select is_m6_landing_email('firm@example.invalid') ok`)).rows[0].ok,true);
      });
      await as(partner,async()=>assert.deepEqual((await rows('leads')).rows.map(r=>r.id),[live]));
    });
    await check('approved new firm provisioning still works once without granting owner role',()=>as(newcomer,async()=>{
      assert.equal((await db.query('select provision_self_from_firm_access() ok')).rows[0].ok,true);
      assert.equal((await db.query('select provision_self_from_firm_access() ok')).rows[0].ok,false);
      assert.equal((await db.query('select role from app_users where id=$1',[newcomer])).rows[0].role,'firm');
    }));
    await check('staff RPCs cannot inspect M6 membership or log M6 calls or mint another firm number',()=>as(agent,async()=>{
      assert.equal((await db.query(`select is_m6_landing_email('firm@example.invalid') ok`)).rows[0].ok,false);
      await assert.rejects(db.query(`select m6_log_touch($1,'two_way','ad_hoc','call',null,null)`,[foreign]));
      await assert.rejects(db.query('select mint_lead_no($1)',[tmt]));
      assert.match((await db.query('select mint_lead_no($1) n',[tmp])).rows[0].n,/^TMP-/);
    }));
    await check('owner retains all firms and settings, service callbacks can save provider evidence',async()=>{
      await as(owner,async()=>{
        assert.equal((await rows('leads')).rows.length,4);
        assert.equal((await db.query(`update campaigns set name='Other updated' where id=$1 returning id`,[other])).rows.length,1);
        assert.equal((await db.query(`select m6_log_touch($1,'two_way','ad_hoc','call',null,null) id`,[foreign])).rows[0].id,owner);
        assert.equal((await rows('storage.objects')).rows.length,0); // Owner also uses server-signed URLs.
      });
      await as('',async()=>{
        assert.equal((await db.query(`update esign_submissions set status='completed' where id=$1 returning id`,[id(70)])).rows.length,1);
        assert.equal((await rows('leads')).rows.length,4);
        assert.equal((await rows('storage.objects')).rows.length,1);
      },'service_role');
    });
    await check('migrations may be reapplied without duplicating guards',async()=>{await db.exec(migration);await db.exec(passwordDocumentMigration);await db.exec(passwordDocumentMigration);});
    await check('ambiguous campaign and public document bucket fail atomically',async()=>{
      await db.query(`insert into campaigns values($1,$2,'INNO MVA','mva',true)`,[id(98),tmp]);
      await assert.rejects(db.exec(migration),/exactly one/);
      await db.exec('rollback');
      await db.query('delete from campaigns where id=$1',[id(98)]);
      await db.exec(`update storage.buckets set public=true where id='signed-docs'`);
      await assert.rejects(db.exec(migration),/document bucket is public/);
      await db.exec('rollback');
      await db.exec(`update storage.buckets set public=false where id='signed-docs'`);
      await db.exec(`create policy unsafe_object_policy on storage.objects for select to authenticated using(true)`);
      await assert.rejects(db.exec(migration),/Storage object access changed/);
      await db.exec('rollback');
      await db.exec('drop policy unsafe_object_policy on storage.objects');
      await as(agent,async()=>assert.deepEqual((await rows('leads')).rows.map(r=>r.id),[live]));
    });
    await check('production read-only role probe script returns counts and rolls back',async()=>{
      const probe=fs.readFileSync(path.join(__dirname,'pilot-boundary-production-probes.sql'),'utf8')
        .replaceAll('lisa@innovativeintake.com','agent@example.invalid')
        .replaceAll("where key='NV_FLAT'","where name='Nevada non-tiered'");
      const result=await db.exec(probe);
      const report=result.flatMap(r=>r.rows).find(r=>r.boundary_verification)?.boundary_verification;
      assert.equal(report.agent.self_profile,1);
      assert.equal(report.agent.files,1);
      assert.equal(report.agent.outside_pilot,0);
      assert.equal(report.agent.outside_claims,0);
      assert.equal(report.agent.NV_FLAT,1);
      assert.equal(report.agent.published_mva_forms,1);
      assert.equal(report.agent.truncate_leads,false);
      assert.equal(report.owner.outside_pilot,1);
      assert.equal(report.inactive.files,0);
    });
    console.log(`${checks} isolated pilot boundary SQL checks passed`);
  } finally {await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
