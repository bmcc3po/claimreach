// Real PostgreSQL functions, constraints, transactions and roles; synthetic only.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/0122_durable_esign_send.sql'),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1),agent=id(2),disabled=id(3),firm=id(10),otherFirm=id(11),campaign=id(20),otherCampaign=id(21);
let checks=0;
async function main(){
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.firms(id uuid primary key);
   create table public.app_users(id uuid primary key,role text,active boolean);
   create table public.campaigns(id uuid primary key,firm_id uuid,active boolean);
   create table public.leads(id uuid primary key,firm_id uuid,campaign_id uuid,archived_at timestamptz,external_id text);
   create table public.claims(id uuid primary key,lead_id uuid,firm_id uuid,campaign_id uuid,claim_type text,status text);
   create table public.intake_calls(id uuid primary key,lead_id uuid,claim_id uuid);
   create table public.signable_documents(id uuid primary key,lead_id uuid,firm_id uuid,status text,audit jsonb,created_at timestamptz default now());
   create table public.esign_submissions(id uuid primary key default gen_random_uuid(),firm_id uuid,lead_id uuid,call_id uuid,campaign_id uuid,
    provider text,template_key text,template_id text,claim_id uuid,submission_id text,client_submitter_id text,intake_submitter_id text,
    signer_name text,injured_name text,phone text,email text,via text,pax_index integer,status text,sign_url text,sent_by uuid,replacement_of uuid,
    voided_at timestamptz,signed_at timestamptz,completed_at timestamptz,agent_reviewed_at timestamptz,replacement_requested_at timestamptz,
    completed_pdf_path text,sent_at timestamptz not null default now(),created_at timestamptz not null default now());
   create unique index esign_provider on esign_submissions(provider,submission_id) where submission_id is not null;
   create function cr_inno_mva_campaign_id() returns uuid language sql as $$select '${campaign}'::uuid$$;
   create function cr_inno_mva_firm_id() returns uuid language sql as $$select '${firm}'::uuid$$;
   grant usage on schema public to anon,authenticated,service_role;
   grant all on all tables in schema public to service_role;
   insert into firms values('${firm}'),('${otherFirm}');
   insert into campaigns values('${campaign}','${firm}',true),('${otherCampaign}','${otherFirm}',true);
   insert into app_users values('${owner}','owner',true),('${agent}','agent',true),('${disabled}','agent',false);
  `);
  await db.exec(sql);
  const t=async(name,fn)=>{await fn();checks++;console.log('ok',name);};
  const query=async(q,args=[])=>db.query(q,args);
  const rpc=async(name,args=[])=>{
   await db.exec('set role service_role');
   try{return(await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;}
   finally{await db.exec('reset role');}
  };
  const denied=async(fn,re)=>assert.rejects(fn,re);
  const seed=async(n,opts={})=>{
   const lead=id(n),claim=id(n+1),f=opts.firm||firm,c=opts.campaign||campaign;
   await query('insert into leads(id,firm_id,campaign_id,external_id) values($1,$2,$3,$4)',[lead,f,c,opts.external||null]);
   await query("insert into claims values($1,$2,$3,$4,'mva','new')",[claim,lead,f,c]);
   return {lead,claim};
  };
  const reserve=(s,key=null,index=null,who=agent)=>rpc('cr_reserve_esign_send',[s.claim,who,key,index]);
  const bind=(a,s,old=null,context={},emergency=null)=>rpc('cr_bind_esign_send',[a.id,s.lead,s.claim,old?.id||null,old?.status||null,'NV_FLAT','6095186','Text',JSON.stringify(context),emergency]);
  const pending=a=>rpc('cr_mark_esign_send_pending',[a.id]);
  const finish=(a,extra={},who=null)=>rpc('cr_finalize_esign_send',[a.id,JSON.stringify({submission_id:'provider-'+a.id,client_submitter_id:'client-'+a.id,sign_url:'https://docuseal.com/s/synthetic',...extra}),who]);
  const old=async(s,n,status='sent',extra='')=>{
   await query(`insert into esign_submissions(id,firm_id,lead_id,campaign_id,provider,claim_id,submission_id,status,pax_index${extra?',signed_at,agent_reviewed_at,replacement_requested_at':''}) values($1,$2,$3,$4,'docuseal',$5,$6,$7,null${extra?',now(),now(),now()':''})`,[id(n),firm,s.lead,campaign,s.claim,'old-'+n,status]);
   return {id:id(n),status};
  };
  await t('table and all entry RPCs deny anonymous/authenticated callers; service writes require RPC',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    try{
     await denied(()=>query('select * from esign_send_attempts'),/permission denied/);
     await denied(()=>query('insert into esign_send_attempts default values'),/permission denied/);
     await denied(()=>query('select cr_reserve_esign_send($1,$2)',[id(101),agent]),/permission denied/);
     const funcs=(await query("select p.oid::regprocedure::text signature,has_function_privilege(current_user,p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in ('cr_bind_esign_send','cr_mark_esign_send_pending','cr_hold_esign_send','cr_reject_esign_send','cr_finalize_esign_send','cr_reconcile_expired_esign_send','cr_pending_esign_send')")).rows;
     assert.equal(funcs.length,7);assert.ok(funcs.every(f=>f.allowed===false));
    }finally{await db.exec('reset role');}
   }
   await db.exec('set role service_role');
   try{await denied(()=>query('delete from esign_send_attempts'),/permission denied/);await denied(()=>query('update esign_send_attempts set parent_claim_id=$1',[id(1)]),/permission denied/);}
   finally{await db.exec('reset role');}
  });
  await t('same signer reservation is atomic while independent claims proceed',async()=>{
   const a=await seed(100),b=await seed(110);
   // PGlite queues concurrent calls onto one PostgreSQL session; the database
   // predicate and unique index, not a JavaScript precheck, elect the winner.
   const results=await Promise.allSettled([query('select cr_reserve_esign_send($1,$2) result',[a.claim,agent]),query('select cr_reserve_esign_send($1,$2) result',[a.claim,agent])]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal(results.filter(r=>r.status==='rejected').length,1);
   assert.ok((await reserve(b)).id);
   const indexes=(await query("select indexdef from pg_indexes where tablename='esign_send_attempts'")).rows.map(r=>r.indexdef).join('\n');
   assert.match(indexes,/UNIQUE.*parent_claim_id, pax_key/s);assert.match(indexes,/UNIQUE.*target_claim_id/s);
  });
  await t('timeout stays held indefinitely; second provider start and generic retry are refused',async()=>{
   const s=await seed(120),a=await reserve(s);await bind(a,s);await pending(a);
   await denied(()=>pending(a),/cannot start another/);
   await rpc('cr_hold_esign_send',[a.id,'provider_timeout']);
   await query("update esign_send_attempts set created_at=now()-interval '365 days',updated_at=now()-interval '365 days' where id=$1",[a.id]);
   await denied(()=>reserve(s),/already pending/);
   await denied(()=>rpc('cr_reject_esign_send',[a.id,'pre_provider_abort',false]),/cannot be released/);
   await denied(()=>rpc('cr_reject_esign_send',[a.id,'definitive_provider_rejection',true]),/cannot be released/);
   assert.equal((await rpc('cr_pending_esign_send',[s.claim,null])).state,'uncertain');
  });
  await t('stale expected agreement or status cannot bind a send',async()=>{
   const s=await seed(130),a=await reserve(s);const prior=await old(s,132);
   await denied(()=>bind(a,s),/current agreement changed/);
   await denied(()=>bind(a,s,{...prior,status:'opened'}),/current agreement changed/);
   await bind(a,s,prior);await denied(()=>pending(a),/not been cleared/);
   await query("update esign_submissions set status='voided',voided_at=now() where id=$1",[prior.id]);
   await pending(a);
  });
  await t('atomic finalize and duplicate finalize produce exactly one signing row',async()=>{
   const s=await seed(140),a=await reserve(s);await bind(a,s,null,{signer_name:'Synthetic Person',injured_name:'Synthetic Person',phone:'+12025550199'});await pending(a);
   const first=await finish(a),second=await finish(a);assert.equal(first.id,second.id);
   const rows=(await query('select * from esign_submissions where claim_id=$1',[s.claim])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].signer_name,'Synthetic Person');assert.equal(rows[0].sent_by,agent);
   assert.equal(await rpc('cr_pending_esign_send',[s.claim,null]),null);
   const next=await reserve(s);await denied(()=>bind(next,s),/current agreement changed/);
   await denied(()=>finish(a,{submission_id:'another-provider'}),/already linked/);
  });
  await t('unavailable local signing storage leaves pending mutex and no partial link',async()=>{
   const s=await seed(150),a=await reserve(s);await bind(a,s);await pending(a);
   await db.exec("create function reject_test_signing_insert() returns trigger language plpgsql as $$begin raise exception 'Synthetic unavailable storage';end$$;create trigger reject_test_insert before insert on esign_submissions for each row execute function reject_test_signing_insert();");
   try{await denied(()=>finish(a),/unavailable storage/);}finally{await db.exec('drop trigger reject_test_insert on esign_submissions;drop function reject_test_signing_insert();');}
   assert.equal((await rpc('cr_pending_esign_send',[s.claim,null])).state,'provider_pending');
   assert.equal((await query('select count(*)::int n from esign_submissions where claim_id=$1',[s.claim])).rows[0].n,0);
   await denied(()=>reserve(s),/already pending/);
   await rpc('cr_hold_esign_send',[a.id,'local_save_failed']);assert.ok((await finish(a,{},owner)).id);
  });
  await t('passenger reservation blocks duplicate child creation and direct-file bypass',async()=>{
   const parent=await seed(160);const a=await reserve(parent,'stable_person',0);
   await denied(()=>reserve(parent,'stable_person',3),/already pending/);
   const child=await seed(162,{external:parent.lead+':pax:stable_person'});
   await denied(()=>reserve(child),/already pending/);
   assert.equal((await rpc('cr_pending_esign_send',[child.claim,null])).id,a.id);
   assert.equal(await rpc('cr_pending_esign_send',[parent.claim,null]),null);
   assert.equal((await rpc('cr_pending_esign_send',[parent.claim,'stable_person'])).id,a.id);
   const other=await reserve(parent,'another_person',1);assert.notEqual(other.id,a.id);
   await bind(a,child);await pending(a);await finish(a);
   const direct=await reserve(child);assert.equal(direct.parent_claim_id,parent.claim);assert.equal(direct.pax_key,'stable_person');
  });
  await t('wrong passenger or changed firm/campaign cannot bind or start',async()=>{
   const parent=await seed(170),child=await seed(172,{external:parent.lead+':pax:right'}),wrong=await seed(174,{external:parent.lead+':pax:wrong'});
   const a=await reserve(parent,'right',0);await denied(()=>bind(a,wrong),/different signer/);await bind(a,child);
   await query('update claims set campaign_id=$1,firm_id=$2 where id=$3',[otherCampaign,otherFirm,child.claim]);
   await denied(()=>pending(a),/scope changed|outside/);assert.equal((await query('select state from esign_send_attempts where id=$1',[a.id])).rows[0].state,'reserved');
  });
  await t('scope changes after provider create refuse finalize while retaining the hold',async()=>{
   const s=await seed(180),a=await reserve(s);await bind(a,s);await pending(a);
   await query('update leads set archived_at=now() where id=$1',[s.lead]);
   await denied(()=>finish(a),/scope changed/);assert.equal((await rpc('cr_pending_esign_send',[s.claim,null])).state,'provider_pending');
  });
  await t('disabled and external actors are refused; owner can reserve outside pilot',async()=>{
   const s=await seed(190,{firm:otherFirm,campaign:otherCampaign});
   await denied(()=>reserve(s),/outside/);await denied(()=>reserve(s,null,null,disabled),/active intake/);
   await query("insert into app_users values($1,'firm',true)",[id(4)]);await denied(()=>reserve(s,null,null,id(4)),/active intake/);
   assert.ok((await reserve(s,null,null,owner)).id);
  });
  await t('signed original is preserved when its reviewed correction is finalized',async()=>{
   const s=await seed(200),prior=await old(s,202,'signed','signed'),a=await reserve(s);
   const before=(await query('select * from esign_submissions where id=$1',[prior.id])).rows[0];
   await bind(a,s,prior,{replacement_of:prior.id,signer_name:'Corrected Synthetic'});await pending(a);const result=await finish(a);
   assert.deepEqual((await query('select * from esign_submissions where id=$1',[prior.id])).rows[0],before);
   assert.equal((await query('select replacement_of from esign_submissions where id=$1',[result.id])).rows[0].replacement_of,prior.id);
  });
  await t('missing database reservation storage fails before any send can be reserved',async()=>{
   const s=await seed(210);await db.exec('alter table esign_send_attempts rename to esign_send_attempts_unavailable');
   try{await denied(()=>reserve(s),/does not exist/);}finally{await db.exec('alter table esign_send_attempts_unavailable rename to esign_send_attempts');}
  });
  await t('only definitive provider rejection or pre-provider abort releases retry',async()=>{
   const s=await seed(220),a=await reserve(s);await rpc('cr_reject_esign_send',[a.id,'pre_provider_abort',false]);
   const next=await reserve(s);await bind(next,s);await pending(next);
   await denied(()=>rpc('cr_reject_esign_send',[next.id,'provider_timeout',true]),/cannot be released/);
   await denied(()=>rpc('cr_reject_esign_send',[next.id,null,true]),/cannot be released/);
   await denied(()=>rpc('cr_reject_esign_send',[next.id,'definitive_provider_rejection',null]),/cannot be released/);
   await rpc('cr_reject_esign_send',[next.id,'definitive_provider_rejection',true]);assert.ok((await reserve(s)).id);
  });
  await t('owner reconciliation requires exact expired evidence and records decision',async()=>{
   const s=await seed(230),a=await reserve(s);await bind(a,s);await pending(a);await rpc('cr_hold_esign_send',[a.id,'provider_timeout']);
   await denied(()=>rpc('cr_reconcile_expired_esign_send',[a.id,agent,'provider123','2020-01-01T00:00:00Z']),/active owner/);
   await denied(()=>rpc('cr_reconcile_expired_esign_send',[a.id,owner,'',null]),/verified expired/);
   const done=await rpc('cr_reconcile_expired_esign_send',[a.id,owner,'provider123','2020-01-01T00:00:00Z']);
   assert.equal(done.resolution_code,'provider_expired');assert.equal(done.reconciled_provider_submission_id,'provider123');assert.equal(done.resolved_by,owner);
   assert.ok((await reserve(s)).id);
  });
  await t('private identity and raw provider payload cannot enter attempt context or finalization',async()=>{
   const s=await seed(240),a=await reserve(s);
   await denied(()=>bind(a,s,null,{ssn:'000000000'}),/Unsupported/);
   await denied(()=>bind(a,s,null,{dob:'1990-01-01'}),/Unsupported/);
   await denied(()=>bind(a,s,null,{signer_name:{ssn:'000000000'}}),/Invalid/);
   await bind(a,s);await pending(a);await denied(()=>finish(a,{raw_payload:{values:{ssn:'000000000'}}}),/Unsupported/);
  });
  await t('ambiguous legacy signatures cannot be assumed to belong to the visible claim',async()=>{
   const s=await seed(250);await query("insert into claims values($1,$2,$3,$4,'mva','new')",[id(252),s.lead,firm,campaign]);
   await query("insert into esign_submissions(firm_id,lead_id,campaign_id,provider,status) values($1,$2,$3,'docuseal','signed')",[firm,s.lead,campaign]);
   const a=await reserve(s);await denied(()=>bind(a,s),/unassigned legacy/);
  });
  await t('owner can recover a known submission after the initiating user is deactivated',async()=>{
   const s=await seed(260),a=await reserve(s);await bind(a,s);await pending(a);await rpc('cr_hold_esign_send',[a.id,'provider_timeout']);
   await query('update app_users set active=false where id=$1',[agent]);
   try{await denied(()=>finish(a),/active intake/);assert.ok((await finish(a,{},owner)).id);}
   finally{await query('update app_users set active=true where id=$1',[agent]);}
  });
  await t('prior retirement uncertainty can hold reserved without permitting a provider retry',async()=>{
   const s=await seed(270),a=await reserve(s);
   await denied(()=>rpc('cr_hold_esign_send',[a.id,'provider_timeout']),/cannot be marked/);
   const held=await rpc('cr_hold_esign_send',[a.id,'prior_expiry_unconfirmed']);assert.equal(held.state,'uncertain');assert.equal(held.provider_started_at,null);
   await denied(()=>pending(a),/cannot start/);await denied(()=>reserve(s),/already pending/);await denied(()=>finish(a,{},owner),/no pending provider/);
  });
  await t('uncertain passenger creation stays locked before target binding or provider start',async()=>{
   const s=await seed(330),a=await reserve(s,'pending-child',0);
   const held=await rpc('cr_hold_esign_send',[a.id,'passenger_creation_unconfirmed']);assert.equal(held.state,'uncertain');assert.equal(held.target_claim_id,null);
   await denied(()=>reserve(s,'pending-child',0),/already pending/);await denied(()=>rpc('cr_reject_esign_send',[a.id,'pre_provider_abort',false]),/cannot be released/);
  });
  await t('same-campaign multi-matter parents cannot create duplicate legacy passenger keys',async()=>{
   const s=await seed(280);await query("insert into claims values($1,$2,$3,$4,'mva','new')",[id(282),s.lead,firm,campaign]);
   await denied(()=>reserve(s,'same_person',0),/parent matter is ambiguous/);
  });
  const emergency=async(s,n,status='signed',date='2030-01-01T00:00:00Z')=>{
   await query('insert into signable_documents values($1,$2,$3,$4,$5,$6)',[id(n),s.lead,firm,status,JSON.stringify({emergency:{claim_id:s.claim,campaign_id:campaign}}),date]);return id(n);
  };
  await t('exact newer signed emergency can be re-signed without modifying original evidence',async()=>{
   const s=await seed(290),prior=await old(s,292),doc=await emergency(s,293),a=await reserve(s);
   await bind(a,s,prior,{},doc);await pending(a);await finish(a);
   assert.equal((await query('select status from esign_submissions where id=$1',[prior.id])).rows[0].status,'sent');
   assert.equal((await query('select emergency_document_id from esign_send_attempts where id=$1',[a.id])).rows[0].emergency_document_id,doc);
  });
  await t('foreign, old and unsigned emergencies cannot bypass prior agreement guard',async()=>{
   const s=await seed(300),foreign=await seed(310),prior=await old(s,302),a=await reserve(s);
   const foreignDoc=await emergency(foreign,312);await denied(()=>bind(a,s,prior,{},foreignDoc),/no longer current/);
   const stale=await emergency(s,303,'signed','2020-01-01T00:00:00Z');await denied(()=>bind(a,s,prior,{},stale),/no longer current/);
   const unsigned=await emergency(s,304,'sent');await denied(()=>bind(a,s,prior,{},unsigned),/no longer current/);
  });
  await t('emergency becoming unsigned after binding or superseded during provider create leaves hold',async()=>{
   const s=await seed(320),prior=await old(s,322),doc=await emergency(s,323),a=await reserve(s);await bind(a,s,prior,{},doc);
   await query("update signable_documents set status='cancelled' where id=$1",[doc]);await denied(()=>pending(a),/emergency agreement changed/);
   await query("update signable_documents set status='signed' where id=$1",[doc]);await pending(a);
   await emergency(s,324,'signed','2031-01-01T00:00:00Z');await denied(()=>finish(a),/emergency agreement changed/);
   assert.equal((await rpc('cr_pending_esign_send',[s.claim,null])).state,'provider_pending');
  });
  await t('NETFLY amendment permits internal INNO agent only on exact TMP secondary campaign',async()=>{
   await db.exec(`alter table firms add column slug text;
     alter table app_users add column firm_id uuid;
     alter table campaigns add column name text;
     alter table campaigns add column path text;
     alter table campaigns add column esign_required boolean;
     update firms set slug='inno' where id='${firm}';
     update firms set slug='tmp' where id='${otherFirm}';
     update app_users set firm_id='${firm}' where id='${agent}';
     update campaigns set name='NETFLY ONTAKE',path='secondary',esign_required=false where id='${otherCampaign}';`);
   await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/0127_netfly_emergency_esign_scope.sql'),'utf8'));
   const netfly=await seed(350,{firm:otherFirm,campaign:otherCampaign});
   assert.ok((await reserve(netfly)).id);
   const foreignFirm=id(360),foreignCampaign=id(361);
   await query('insert into firms(id,slug) values($1,$2)',[foreignFirm,'foreign']);
   await query("insert into campaigns(id,firm_id,active,name,path,esign_required) values($1,$2,true,'NETFLY ONTAKE','secondary',false)",[foreignCampaign,foreignFirm]);
   const foreign=await seed(362,{firm:foreignFirm,campaign:foreignCampaign});
   await denied(()=>reserve(foreign),/outside the intake pilot/);
   await denied(()=>reserve(netfly,null,null,disabled),/active intake user/);
   await denied(()=>reserve(netfly,null,null,id(4)),/active intake user/);
  });
  console.log(`${checks} passed`);
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
