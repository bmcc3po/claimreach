// Run against an ephemeral in-memory PostgreSQL instance. Never connects to Supabase.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table claims(id uuid primary key,lead_id uuid,firm_id uuid,campaign_id uuid,status text,updated_at timestamptz,dq_reason_key text,dq_reason text,qualification text);
 create table dq_reasons(key text primary key);
 create table intake_calls(id uuid primary key default gen_random_uuid(),firm_id uuid,campaign_id uuid,lead_id uuid,claim_id uuid,agent_id uuid,agent_name text,caller_id text,first_name text,call_type text,answers jsonb,disposition text,dispo_reasons text[],reason text,dispo_note text,status text,ended_at timestamptz,updated_at timestamptz);
 create table leads(id uuid primary key,firm_id uuid,perm_call boolean,perm_text boolean,perm_email boolean);
 create table contact_points(lead_id uuid,kind text,status text);`);
 await db.exec(fs.readFileSync('supabase/migrations/0130_marketer_dq_explanations.sql','utf8'));
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.query(`insert into claims(id,lead_id,firm_id,campaign_id,status,updated_at) values($1,$2,$3,$4,'new','2026-10-19T12:00:00Z')`,[id(1),id(2),id(3),id(4)]);
 await db.query(`insert into intake_calls(id,firm_id,campaign_id,lead_id,claim_id,status) values($1,$2,$3,$4,$5,'live')`,[id(5),id(3),id(4),id(2),id(1)]);
 await db.exec(`insert into dq_reasons values('other');`);
 const row={firm_id:id(3),campaign_id:id(4),lead_id:id(2),claim_id:id(1),disposition:'dq',dispo_reasons:['other'],reason:'Other'};
 const args=[id(1),id(2),id(3),'2026-10-19T12:00:00Z','dq','other','Client is already represented.',id(5),row];
 const call=(a=args)=>db.query(`select cr_save_dq_call($1,$2,$3,$4,$5,$6,$7,$8,$9)`,a);
 const unchanged=async()=>{assert.equal((await db.query('select status,dq_explanation from claims')).rows[0].status,'new');assert.equal((await db.query('select status,dispo_note from intake_calls')).rows[0].status,'live');};
 for(const [ix,v] of [[2,id(9)],[3,'2026-10-18T12:00:00Z'],[5,'invalid'],[6,'   \n\t   '],[6,'..........'],[7,id(9)],[8,{...row,claim_id:id(9)}]]){const a=[...args];a[ix]=v;await assert.rejects(()=>call(a));await unchanged();}
 await db.exec(`create function fail_claim() returns trigger language plpgsql as $$ begin raise exception 'synthetic claim failure after call write'; end $$; create trigger fail before update on claims for each row execute function fail_claim();`);
 await assert.rejects(()=>call(),/synthetic claim failure/);await unchanged();
 await db.exec('drop trigger fail on claims;');
 await db.exec(`create function fail_call() returns trigger language plpgsql as $$ begin raise exception 'synthetic call failure'; end $$; create trigger fail before update on intake_calls for each row execute function fail_call();`);
 await assert.rejects(()=>call(),/synthetic call failure/);await unchanged();await db.exec('drop trigger fail on intake_calls;');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>call(),/permission denied/);await db.exec('reset role');}
 await call();assert.deepEqual((await db.query('select status,dq_explanation from claims')).rows[0],{status:'dq',dq_explanation:args[6]});assert.deepEqual((await db.query('select status,dispo_note from intake_calls')).rows[0],{status:'ended',dispo_note:args[6]});
 await assert.rejects(()=>call(),/Matter changed/);
 await db.close();console.log('PASS: PostgreSQL DQ transaction, whitespace, reasons, scope, stale writes, both rollback directions, and browser-role denial');
})().catch(e=>{console.error(e);process.exitCode=1;});
