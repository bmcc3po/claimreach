const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/0124_atomic_drip_reminders.sql'),'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [firm,other,lead,claim,campaign,rule,enrollment]=[1,2,3,4,5,6,7].map(id);
let checks=0;
(async()=>{
 const db=new PGlite();
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.leads(id uuid primary key,firm_id uuid,archived_at timestamptz,case_type text,signed_at timestamptz,perm_call bool,perm_text bool,perm_email bool,comms_monitored bool,comms_safe_channels jsonb);
  create table public.claims(id uuid primary key,lead_id uuid,firm_id uuid,claim_type text,campaign_id uuid,status text);
  create table public.campaigns(id uuid primary key,firm_id uuid,case_type text,active bool);
  create table public.statuses(key text primary key,active bool,phase text,is_final bool,unlocks_firm bool,qualify text);
  create table public.esign_submissions(id uuid primary key,lead_id uuid,firm_id uuid,claim_id uuid,voided_at timestamptz,signed_at timestamptz,status text);
  create table public.lead_activity(id uuid primary key,lead_id uuid,firm_id uuid,created_at timestamptz,meta jsonb);
  create table public.communications(id uuid primary key,lead_id uuid,firm_id uuid,direction text,occurred_at timestamptz);
  create table public.drip_rules(id uuid primary key,firm_id uuid,name text,channel text,every_days int,active bool,campaign text,fire_once bool);
  create table public.drip_enrollments(id uuid primary key default gen_random_uuid(),firm_id uuid,lead_id uuid,rule_id uuid,next_due date,last_sent timestamptz,active bool,created_at timestamptz default now());
  create table public.notes(id uuid primary key default gen_random_uuid(),firm_id uuid,lead_id uuid,claim_id uuid,author_name text,scope text,body text);
 `);
 await db.exec(migration);
 const check=async(name,fn)=>{await fn();checks++;console.log('ok',name);};
 async function seed(){
  await db.exec('truncate leads,claims,campaigns,statuses,esign_submissions,lead_activity,communications,drip_rules,drip_enrollments,notes');
  await db.query(`insert into leads values($1,$2,null,'mva',null,true,true,true,false,'[]')`,[lead,firm]);
  await db.query(`insert into claims values($1,$2,$3,'mva',$4,'new')`,[claim,lead,firm,campaign]);
  await db.query(`insert into campaigns values($1,$2,'mva',true)`,[campaign,firm]);
  await db.exec(`insert into statuses values('new',true,'pre_qa',false,false,'undetermined'),('signed_grievous',true,'in_qa',false,false,'undetermined'),('dq',true,'terminal',true,false,'disqualify'),('external_dq_review',true,'terminal',true,false,'disqualify'),('test',true,'terminal',true,false,'undetermined')`);
  await db.query(`insert into drip_rules values($1,$2,'Synthetic reminder','call_reminder',3,true,null,false)`,[rule,firm]);
  await db.query(`insert into drip_enrollments values($1,$2,$3,$4,'2020-01-01',null,true,'2019-01-01')`,[enrollment,firm,lead,rule]);
 }
 const inspect=async()=> (await db.query(`select cr_check_drip_enrollment($1,'2020-01-01') result`,[enrollment])).rows[0].result;
 const fire=async()=> (await db.query(`select cr_fire_drip_reminder($1,'2020-01-01') result`,[enrollment])).rows[0].result;
 const notes=async()=> (await db.query('select * from notes')).rows;
 await check('only service role can execute inspection, reminder or enrollment; fixed search paths',async()=>{
  for(const fn of ['cr_check_drip_enrollment(uuid,date)','cr_fire_drip_reminder(uuid,date)','enroll_drips_for_lead(uuid,uuid)']){
   for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,fn])).rows[0].ok,role==='service_role');
   const p=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn])).rows[0];assert.equal(p.prosecdef,true);assert.ok(p.proconfig.some(x=>x.startsWith('search_path=')));
  }
 });
 await seed();
 await check('one note and one date advance across duplicate concurrent requests',async()=>{
  assert.equal((await inspect()).allowed,true);
  const results=await Promise.all([fire(),fire()]);assert.equal(results.filter(r=>r.fired).length,1);
  assert.equal((await notes()).length,1);assert.equal((await notes())[0].claim_id,claim);assert.match((await notes())[0].body,/No call or message was sent/);
  assert.equal((await fire()).fired,false);
 });
 await seed();
 await check('one-shot deactivates without altering any other enrollment',async()=>{
  await db.exec('update drip_rules set fire_once=true'); assert.equal((await fire()).fired,true);
  assert.equal((await db.query('select active from drip_enrollments')).rows[0].active,false);
 });
 await seed();
 await check('note failure rolls back the schedule and reports failure',async()=>{
  await db.exec(`create function fail_note()returns trigger language plpgsql as $$begin raise exception 'synthetic storage unavailable';end$$;create trigger fail_note before insert on notes for each row execute function fail_note()`);
  await assert.rejects(fire(),/synthetic/);assert.equal((await notes()).length,0);assert.equal((await db.query('select last_sent from drip_enrollments')).rows[0].last_sent,null);
  await db.exec('drop trigger fail_note on notes');
 });
 await seed();
 await check('schedule failure rolls back the already inserted note',async()=>{
  await db.exec(`create function fail_schedule()returns trigger language plpgsql as $$begin raise exception 'synthetic schedule unavailable';end$$;create trigger fail_schedule before update on drip_enrollments for each row execute function fail_schedule()`);
  await assert.rejects(fire(),/synthetic/);assert.equal((await notes()).length,0);assert.equal((await db.query('select last_sent from drip_enrollments')).rows[0].last_sent,null);
  await db.exec('drop trigger fail_schedule on drip_enrollments');
 });
 for(const [name,sql,values] of [
  ['disabled rule','update drip_rules set active=false',[]],
  ['other campaign','update drip_rules set campaign=\'motel6\'',[]],
  ['wrong rule firm','update drip_rules set firm_id=$1',[other]],
  ['wrong enrollment firm','update drip_enrollments set firm_id=$1',[other]],
  ['archived','update leads set archived_at=now()',[]],
  ['wrong claimant firm','update leads set firm_id=$1',[other]],
  ['different case type','update claims set claim_type=\'motel_trafficking\'',[]],
  ['inactive campaign','update campaigns set active=false',[]],
  ['wrong campaign firm','update campaigns set firm_id=$1',[other]],
  ['signed','update claims set status=\'signed_grievous\'',[]],
  ['DQ','update claims set status=\'dq\'',[]],
  ['DQ missing reason','update claims set status=\'external_dq_review\'',[]],
  ['test','update claims set status=\'test\'',[]],
  ['unknown status','update claims set status=\'mystery\'',[]],
  ['contact permission off','update leads set perm_call=false',[]],
  ['unsafe contact','update leads set comms_monitored=true,comms_safe_channels=\'["Email"]\'',[]],
  ['invalid safe channels','update leads set comms_monitored=true,comms_safe_channels=\'{}\'',[]],
  ['missing enrollment clock','update drip_enrollments set created_at=null',[]],
  ['future due date','update drip_enrollments set next_due=current_date+1',[]],
  ['invalid interval','update drip_rules set every_days=0',[]],
  ['SMS unwired','update drip_rules set channel=\'sms\'',[]],
  ['email unwired','update drip_rules set channel=\'email\'',[]],
 ])await check(name+' remains held without notes or advances',async()=>{await seed();await db.query(sql,values);assert.equal((await inspect()).allowed,false);assert.equal((await fire()).fired,false);assert.equal((await notes()).length,0);assert.equal((await db.query('select last_sent from drip_enrollments')).rows[0].last_sent,null);});
 await check('hidden sibling makes a lead-scoped enrollment ambiguous',async()=>{await seed();await db.query('insert into claims values($1,$2,$3,\'motel_trafficking\',null,\'new\')',[id(20),lead,firm]);assert.equal((await fire()).fired,false);});
 await check('signature evidence stops follow-up before status callback completes',async()=>{await seed();await db.query('insert into esign_submissions values($1,$2,$3,$4,null,now(),\'signed\')',[id(20),lead,firm,claim]);assert.equal((await fire()).fired,false);});
 await check('inbound since enrollment stops; old and other-firm inbound do not',async()=>{await seed();await db.query('insert into communications values($1,$2,$3,\'inbound\',\'2018-01-01\'),($4,$2,$5,\'inbound\',now())',[id(20),lead,firm,id(21),other]);assert.equal((await inspect()).allowed,true);await db.query('insert into communications values($1,$2,$3,\'inbound\',now())',[id(22),lead,firm]);assert.equal((await fire()).fired,false);});
 await check('new stop signal after inspection is rechecked by atomic action',async()=>{await seed();assert.equal((await inspect()).allowed,true);await db.exec('update claims set status=\'dq\'');assert.equal((await fire()).fired,false);assert.equal((await notes()).length,0);});
 await check('external hold persists until an explicit reviewed release',async()=>{await seed();const meta={source:'lawruler',event:'mva_status_reconciliation',claim_id:claim,campaign_id:campaign,acquisition_hold:true};await db.query('insert into lead_activity values($1,$2,$3,\'2020-01-01\',$4)',[id(20),lead,firm,meta]);assert.equal((await inspect()).allowed,false);await db.query('insert into lead_activity values($1,$2,$3,\'2020-01-02\',$4)',[id(21),lead,firm,{...meta,acquisition_hold:false}]);assert.equal((await inspect()).allowed,false);await db.query('insert into lead_activity values($1,$2,$3,\'2020-01-03\',$4)',[id(22),lead,firm,{...meta,acquisition_hold:false,hold_release_reviewed:true}]);assert.equal((await inspect()).allowed,true);});
 await check('enrollment refuses cross-firm/archived files and concurrent duplicate requests',async()=>{await seed();await db.exec('truncate drip_enrollments');await assert.rejects(db.query('select enroll_drips_for_lead($1,$2)',[lead,other]),/cannot be enrolled/);await Promise.all([db.query('select enroll_drips_for_lead($1,$2)',[lead,firm]),db.query('select enroll_drips_for_lead($1,$2)',[lead,firm])]);assert.equal((await db.query('select count(*)::int n from drip_enrollments')).rows[0].n,1);await db.exec('update leads set archived_at=now()');await assert.rejects(db.query('select enroll_drips_for_lead($1,$2)',[lead,firm]),/cannot be enrolled/);});
 await check('migration reapplies without changing existing enrollments',async()=>{const before=(await db.query('select * from drip_enrollments')).rows;await db.exec(migration);assert.deepEqual((await db.query('select * from drip_enrollments')).rows,before);});
 await db.close();console.log(`${checks} isolated drip scheduler SQL checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
