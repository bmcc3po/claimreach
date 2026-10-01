const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/0129_shared_call_presence.sql'), 'utf8'));
  const phone = '7025550101';
  const agent = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const reserve = async (id, name) => (await db.query('select public.cr_reserve_call_phone($1,$2,$3) as result', [phone, id, name])).rows[0].result;
  const event = async (sid, state) => db.query('select public.cr_record_call_presence($1,$2,$3,$4,$5)', [sid, phone, state, 'Alex', 'alex@example.invalid']);
  const live = async () => (await db.query('select state, ended_at from public.cr_call_presence where call_sid = $1', ['sid-one'])).rows[0];

  assert.equal((await reserve(agent, 'Alex')).reserved, true, 'first agent reserves');
  assert.equal((await reserve(other, 'Jordan')).reserved, false, 'second agent cannot race the first');
  await event('sid-one', 'ringing');
  await event('sid-one', 'connected');
  assert.equal((await live()).state, 'connected', 'provider answer is shared');
  await event('sid-one', 'ended');
  assert.equal((await live()).state, 'ended', 'provider completion clears live status');
  assert.ok((await live()).ended_at);
  await event('sid-one', 'ringing');
  assert.equal((await live()).state, 'ended', 'late ringing event cannot resurrect call');
  assert.equal((await reserve(other, 'Jordan')).reserved, true, 'completion releases original reservation');
  await event('sid-one', 'ended');
  assert.equal((await reserve(agent, 'Alex')).reserved, false, 'duplicate completion cannot release a newer reservation');
  const access = (await db.query("select has_table_privilege('authenticated','public.cr_call_presence','select') as can_read, has_function_privilege('authenticated','public.cr_reserve_call_phone(text,uuid,text)','execute') as can_reserve")).rows[0];
  assert.equal(access.can_read, false);
  assert.equal(access.can_reserve, false);
  console.log('call presence SQL: reservation race, lifecycle ordering, release, privileges pass');
})().catch((error) => { console.error(error); process.exitCode = 1; });
