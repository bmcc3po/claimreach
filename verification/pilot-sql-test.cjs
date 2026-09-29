// Isolated PostgreSQL check for 0115. No production connection or real client data.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const app = path.resolve(__dirname, '..');
const ids = {
  owner: '10000000-0000-4000-8000-000000000001',
  agent: '10000000-0000-4000-8000-000000000002',
  firmUser: '10000000-0000-4000-8000-000000000003',
  tmp: '20000000-0000-4000-8000-000000000001',
  tmt: '20000000-0000-4000-8000-000000000002',
  inno: '30000000-0000-4000-8000-000000000001',
  other: '30000000-0000-4000-8000-000000000002',
  live: '40000000-0000-4000-8000-000000000001',
  archived: '40000000-0000-4000-8000-000000000002',
  tmtLead: '40000000-0000-4000-8000-000000000003',
  liveClaim: '50000000-0000-4000-8000-000000000001',
  tmtClaim: '50000000-0000-4000-8000-000000000002',
};

let checks = 0;
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.role() returns text language sql stable as $$
        select current_setting('request.jwt.claim.role', true)
      $$;
      create table public.firms (id uuid primary key, slug text, lead_prefix text);
      create table public.app_users (id uuid primary key, firm_id uuid, role text,
        active boolean, email text, full_name text, perm_overrides jsonb);
      create table public.campaigns (id uuid primary key, firm_id uuid, name text,
        case_type text, active boolean);
      create table public.leads (id uuid primary key, firm_id uuid, campaign_id uuid,
        archived_at timestamptz, claimant_name text);
      create table public.claims (id uuid primary key, lead_id uuid, firm_id uuid,
        campaign_id uuid, answers jsonb);
      create table public.file_notes (id uuid primary key, lead_id uuid, claim_id uuid,
        firm_id uuid, body text);
      create table public.routing_rules (id uuid primary key, firm_id uuid, case_type text);
      create table public.statuses (id uuid primary key, label text);
      create table public.dq_reasons (id uuid primary key, label text);
      create table public.call_dispo_reasons (id uuid primary key, label text);
      create sequence public.global_lead_seq;
      create function public.is_internal() returns boolean language sql stable security definer
        set search_path = public, pg_temp as $$
          select exists (select 1 from app_users where id = auth.uid()
            and active and role in ('owner','admin','manager','agent','qa'))
        $$;
      create function public.m6_log_touch(uuid,text,text,text,uuid,text)
        returns uuid language plpgsql security definer set search_path = public as $$
        declare uid uuid := auth.uid();
        begin
          if uid is null then raise exception 'Sign in'; end if;
          return uid;
        end $$;
      grant usage on schema public, auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      grant usage on sequence public.global_lead_seq to authenticated;
      grant execute on all functions in schema auth, public to authenticated;
    `);
    for (const t of ['firms','app_users','campaigns','leads','claims','file_notes',
      'routing_rules','statuses','dq_reasons','call_dispo_reasons']) {
      await db.exec(`alter table public.${t} enable row level security;
        create policy baseline_all on public.${t} for all to authenticated
          using (true) with check (true);`);
    }
    await db.query(`insert into firms values ($1,'tmp','TMP'),($2,'tmt','TMT')`,
      [ids.tmp,ids.tmt]);
    await db.query(`insert into app_users values
      ($1,$4,'owner',true,'owner@example.invalid','Owner','{}'),
      ($2,$4,'agent',true,'agent@example.invalid','Agent','{}'),
      ($3,$5,'firm',true,'firm@example.invalid','Firm','{}')`,
      [ids.owner,ids.agent,ids.firmUser,ids.tmp,ids.tmt]);
    await db.query(`insert into campaigns values
      ($1,$3,'INNO MVA','mva',true),($2,$4,'TMT MVA','mva',true)`,
      [ids.inno,ids.other,ids.tmp,ids.tmt]);
    await db.query(`insert into leads values
      ($1,$4,$6,null,'Live'),($2,$4,$6,now(),'Archived'),
      ($3,$5,$7,null,'Other firm')`,
      [ids.live,ids.archived,ids.tmtLead,ids.tmp,ids.tmt,ids.inno,ids.other]);
    await db.query(`insert into claims values
      ($1,$3,$5,$7,'{}'),($2,$4,$6,$8,'{}')`,
      [ids.liveClaim,ids.tmtClaim,ids.live,ids.tmtLead,ids.tmp,ids.tmt,ids.inno,ids.other]);
    await db.query(`insert into file_notes values
      ('60000000-0000-4000-8000-000000000001',$1,$2,$4,'allowed'),
      ('60000000-0000-4000-8000-000000000002',$1,$3,$4,'wrong claim'),
      ('60000000-0000-4000-8000-000000000003',$1,$2,$5,'wrong firm')`,
      [ids.live,ids.liveClaim,ids.tmtClaim,ids.tmp,ids.tmt]);
    await db.exec(`insert into statuses values
      ('70000000-0000-4000-8000-000000000001','New');`);
    const migration = fs.readFileSync(path.join(app,'supabase/migrations/0115_inno_mva_staff_wall.sql'),'utf8');
    await db.exec(migration);
    async function check(name, fn) { await fn(); checks++; console.log('ok', name); }
    async function as(user, fn) {
      await db.query(`select set_config('request.jwt.claim.sub',$1,false),
        set_config('request.jwt.claim.role','authenticated',false)`, [user]);
      await db.exec('set role authenticated');
      try { return await fn(); }
      finally { await db.exec('reset role'); }
    }
    const names = (table) => db.query(`select * from ${table}`);
    await check('migration installs restrictive policies on every exposed table', async () => {
      const r = await db.query(`select tablename,count(*)::int n from pg_policies
        where policyname='cr_inno_mva_staff_wall' group by tablename`);
      assert.equal(r.rows.length,10);
      const p = await db.query(`select permissive from pg_policies
        where tablename='leads' and policyname='cr_inno_mva_staff_wall'`);
      assert.equal(p.rows[0].permissive,'RESTRICTIVE');
    });
    await check('agent reads only live INNO lead, claim, and matching note', () => as(ids.agent, async () => {
      assert.deepEqual((await names('leads')).rows.map(r=>r.id),[ids.live]);
      assert.deepEqual((await names('claims')).rows.map(r=>r.id),[ids.liveClaim]);
      assert.deepEqual((await names('file_notes')).rows.map(r=>r.body),['allowed']);
      assert.deepEqual((await names('campaigns')).rows.map(r=>r.id),[ids.inno]);
      assert.deepEqual((await names('firms')).rows.map(r=>r.id),[ids.tmp]);
    }));
    await check('agent cannot turn pilot lead into other firm or campaign', () => as(ids.agent, async () => {
      await assert.rejects(db.query('update leads set firm_id=$1 where id=$2',[ids.tmt,ids.live]));
      await assert.rejects(db.query('update leads set campaign_id=$1 where id=$2',[ids.other,ids.live]));
      await assert.rejects(db.query(`insert into leads values
        ('40000000-0000-4000-8000-000000000004',$1,$2,null,'Cross tenant')`,[ids.tmt,ids.other]));
      await assert.rejects(db.query(`insert into claims values
        ('50000000-0000-4000-8000-000000000004',$1,$2,$3,'{}')`,
        [ids.tmtLead,ids.tmt,ids.other]));
      assert.equal((await db.query('select firm_id from leads where id=$1',[ids.live])).rows[0].firm_id,ids.tmp);
    }));
    await check('agent may still update an active pilot file and add a matching note', () => as(ids.agent, async () => {
      const updated=await db.query(`update leads set claimant_name='Updated' where id=$1 returning id`,[ids.live]);
      assert.equal(updated.rows.length,1);
      const inserted=await db.query(`insert into file_notes values
        ('60000000-0000-4000-8000-000000000006',$1,$2,$3,'new') returning id`,
        [ids.live,ids.liveClaim,ids.tmp]);
      assert.equal(inserted.rows.length,1);
    }));
    await check('agent cannot bind note to wrong claim or firm', () => as(ids.agent, async () => {
      await assert.rejects(db.query(`insert into file_notes values
        ('60000000-0000-4000-8000-000000000004',$1,$2,$3,'bad')`,
        [ids.live,ids.tmtClaim,ids.tmp]));
      await assert.rejects(db.query(`insert into file_notes values
        ('60000000-0000-4000-8000-000000000005',$1,$2,$3,'bad')`,
        [ids.live,ids.liveClaim,ids.tmt]));
    }));
    await check('agent cannot change configuration or elevate own role', () => as(ids.agent, async () => {
      assert.equal((await db.query(`update campaigns set name='changed' where id=$1 returning id`,[ids.inno])).rows.length,0);
      assert.equal((await db.query(`update statuses set label='changed' returning id`)).rows.length,0);
      assert.equal((await db.query(`update app_users set role='owner' where id=$1 returning id`,[ids.agent])).rows.length,0);
      await assert.rejects(db.query(`insert into app_users values
        ('10000000-0000-4000-8000-000000000004',$1,'owner',true,'x','x','{}')`,[ids.tmp]));
      assert.equal((await db.query('select role from app_users where id=$1',[ids.agent])).rows[0].role,'agent');
    }));
    await check('agent cannot hard-delete or invoke Motel touch', () => as(ids.agent, async () => {
      const deleted = await db.query('delete from leads where id=$1 returning id',[ids.live]);
      assert.equal(deleted.rows.length,0);
      await assert.rejects(db.query(`select m6_log_touch($1,'no_answer','ad_hoc','call',null,null)`,[ids.live]));
    }));
    await check('owner retains all lead rows and configuration write access', () => as(ids.owner, async () => {
      assert.equal((await names('leads')).rows.length,3);
      const r=await db.query(`update campaigns set name='TMT MVA updated' where id=$1 returning id`,[ids.other]);
      assert.equal(r.rows.length,1);
      assert.equal((await db.query(`select m6_log_touch($1,'no_answer','ad_hoc','call',null,null) id`,[ids.live])).rows[0].id,ids.owner);
    }));
    console.log(`${checks} isolated pilot SQL checks passed`);
  } finally { await db.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
