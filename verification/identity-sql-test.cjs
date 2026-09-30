// Isolated PostgreSQL permissions/transaction checks. Vault is an explicitly
// reversible TEST STUB here, not a test or replacement of Supabase encryption.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..');
const F='10000000-0000-4000-8000-000000000001', F2='10000000-0000-4000-8000-000000000002';
const L='20000000-0000-4000-8000-000000000001', L2='20000000-0000-4000-8000-000000000002';
const C='30000000-0000-4000-8000-000000000001', C2='30000000-0000-4000-8000-000000000002';
const A='40000000-0000-4000-8000-000000000001';
async function main() {
  const db = new PGlite(); let checks = 0;
  const check = async (name, fn) => { await fn(); checks++; console.log('ok',name); };
  const read = async (fn, args=[L,C,F]) => (await db.query(`select public.${fn}($1,$2,$3) as value`, args)).rows[0].value;
  const save = async (value, mode, version, ids=[L,C,F,A]) => (await db.query('select public.cr_save_identity($1,$2,$3,$4,$5,$6,$7) as value', [ids[0],ids[1],ids[2],value,mode,version,ids[3]])).rows[0].value;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema vault;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
      create view vault.decrypted_secrets as select id, reverse(convert_from(decode(secret,'base64'),'UTF8')) as decrypted_secret from vault.secrets;
      create function vault.create_secret(value text, secret_name text default null, description text default null) returns uuid language plpgsql as $$
        declare secret_id uuid;
        begin insert into vault.secrets(name,secret) values (secret_name, encode(convert_to(reverse(value),'UTF8'),'base64')) returning id into secret_id; return secret_id; end $$;
      create function vault.update_secret(secret_id uuid, value text, secret_name text default null, description text default null) returns void language plpgsql as $$
        begin update vault.secrets set secret=encode(convert_to(reverse(value),'UTF8'),'base64') where id=secret_id; end $$;
      create table public.firms(id uuid primary key);
      create table public.app_users(id uuid primary key, active boolean, role text);
      create table public.leads(id uuid primary key, firm_id uuid, archived_at timestamptz, ssn_last4 text);
      create table public.claims(id uuid primary key, lead_id uuid, firm_id uuid);
      create table public.lead_activity(id integer generated always as identity, firm_id uuid, lead_id uuid, kind text, actor uuid, body text, meta jsonb);
      insert into firms values ('${F}'),('${F2}');
      insert into app_users values ('${A}',true,'agent');
      insert into leads values ('${L}','${F}',null,null),('${L2}','${F2}',null,null);
      insert into claims values ('${C}','${L}','${F}'),('${C2}','${L2}','${F2}');
      create function public.fail_test_audit() returns trigger language plpgsql as $$
      begin if current_setting('test.fail_audit',true)='yes' then raise exception 'Synthetic audit failure'; end if; return new; end $$;
      create trigger test_audit before insert on public.lead_activity for each row execute function public.fail_test_audit();
      select set_config('request.jwt.claim.role','service_role',false);
    `);
    const migration=fs.readFileSync(path.join(app,'supabase/migrations/0120_secure_identity_capture.sql'),'utf8');
    assert.ok(fs.readFileSync(path.join(app,'RUN_THESE_MIGRATIONS.sql'),'utf8').includes(migration.trim()));
    await db.exec(migration);
    await check('new identity table has RLS and anonymous/authenticated have no table/RPC rights', async () => {
      assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.lead_identity_secrets'::regclass")).rows[0].relrowsecurity,true);
      for(const role of ['anon','authenticated']) {
        assert.equal((await db.query("select has_table_privilege($1,'public.lead_identity_secrets','SELECT') as ok",[role])).rows[0].ok,false);
        for(const fn of ['cr_identity_metadata(uuid,uuid,uuid)','cr_save_identity(uuid,uuid,uuid,text,text,integer,uuid)','cr_read_identity_for_signing(uuid,uuid,uuid)']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,'public.'+fn])).rows[0].ok,false);
      }
      await db.exec('set role authenticated');
      await assert.rejects(read('cr_read_identity_for_signing'), /permission denied/);
      await db.exec('reset role');
    });
    await check('privileged function checks service role and exact lead/claim/firm scope', async () => {
      await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
      await assert.rejects(read('cr_identity_metadata'), /Service access required/);
      await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
      for (const args of [[L,C,F2],[L,C2,F],[L2,C,F2]]) await assert.rejects(read('cr_identity_metadata',args),/scope unavailable/);
      assert.deepEqual(await read('cr_identity_metadata'),{saved:false,mode:null,version:0,saved_at:null});
      assert.equal(await read('cr_read_identity_for_signing'),null);
    });
    await check('save is atomic metadata-only and decrypted SSN is accessible only to the signing RPC', async () => {
      const result=await save('123456789','full',0);
      assert.equal(result.saved,true); assert.equal(result.version,1); assert.equal(result.mode,'full');
      assert.deepEqual(Object.keys(result).sort(),['mode','saved','saved_at','version']);
      assert.equal((await db.query('select ssn_last4 from leads where id=$1',[L])).rows[0].ssn_last4,'6789');
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'123456789',mode:'full',version:1});
      assert.deepEqual(await read('cr_identity_metadata'),result);
      const audit=(await db.query('select body,meta from lead_activity')).rows;
      assert.equal(audit.length,1); assert.ok(!JSON.stringify(audit).includes('123456789')); assert.ok(!JSON.stringify(audit).includes('6789'));
      const stored=(await db.query('select * from lead_identity_secrets')).rows;
      assert.ok(!JSON.stringify(stored).includes('123456789')); assert.ok(!JSON.stringify(stored).includes('6789'));
    });
    await check('stale save, invalid value, and full-to-last4 downgrade never discard saved full SSN', async () => {
      await assert.rejects(save('987654321','full',0),/version changed/);
      await assert.rejects(save('1234','full',1),/Invalid identity/);
      await assert.rejects(save('6789','last4',1),/cannot be reduced/);
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'123456789',mode:'full',version:1});
      assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1);
    });
    await check('update reuses one Vault secret and rolls back secret/last4/version if audit fails', async () => {
      await save('987654321','full',1);
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'987654321',mode:'full',version:2});
      await db.exec("select set_config('test.fail_audit','yes',false)");
      await assert.rejects(save('111223333','full',2),/Synthetic audit failure/);
      await db.exec("select set_config('test.fail_audit','no',false)");
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'987654321',mode:'full',version:2});
      assert.equal((await db.query('select ssn_last4 from leads where id=$1',[L])).rows[0].ssn_last4,'4321');
      assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1);
    });
    await check('first last-four capture can be upgraded, with no signing-state dependency', async () => {
      await save('2222','last4',0,[L2,C2,F2,A]);
      await save('111222222','full',1,[L2,C2,F2,A]);
      assert.deepEqual(await read('cr_read_identity_for_signing',[L2,C2,F2]),{ssn:'111222222',mode:'full',version:2});
    });
    await check('firm switch is blocked before it can strand an existing encrypted identity', async () => {
      await assert.rejects(db.query('update leads set firm_id=$1 where id=$2',[F2,L]), /Secure identity transfer is required/);
      assert.equal((await db.query('select firm_id from leads where id=$1',[L])).rows[0].firm_id,F);
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'987654321',mode:'full',version:2});
      // Ordinary same-firm updates remain valid.
      await db.query('update leads set firm_id=$1 where id=$2',[F,L]);
    });
    await check('inconsistent firm metadata fails closed instead of pretending the saved identity is absent', async () => {
      await db.query('update lead_identity_secrets set firm_id=$1 where lead_id=$2',[F2,L]);
      await assert.rejects(read('cr_identity_metadata'),/firm association requires review/);
      await assert.rejects(read('cr_read_identity_for_signing'),/firm association requires review/);
      await assert.rejects(save('111223333','full',2),/firm association requires review/);
      await db.query('update lead_identity_secrets set firm_id=$1 where lead_id=$2',[F,L]);
      assert.deepEqual(await read('cr_read_identity_for_signing'),{ssn:'987654321',mode:'full',version:2});
    });
    await check('archived or wrong-scope reads/writes fail before secret mutation', async () => {
      await assert.rejects(save('111223333','full',2,[L,C2,F,A]),/scope unavailable/);
      await db.query('update leads set archived_at=now() where id=$1',[L]);
      await assert.rejects(read('cr_read_identity_for_signing'),/scope unavailable/);
      await assert.rejects(save('111223333','full',2),/scope unavailable/);
    });
    console.log(`${checks} secure identity SQL checks passed (synthetic Vault stub)`);
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
