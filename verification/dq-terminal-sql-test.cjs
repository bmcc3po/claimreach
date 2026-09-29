const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.statuses (key text primary key, label text, track text, phase text,
        tone text, qualify text, is_final boolean, requires_esign boolean, unlocks_firm boolean, updated_at timestamptz);
      create table public.leads (id text primary key, firm_id text, qa_pending boolean, wip_pending boolean, qa_entered_at timestamptz);
      create table public.claims (id text primary key, lead_id text, firm_id text, status text, qualification text, dq_reason_key text);
      insert into statuses values
        ('external_dq_review','old','intake','in_qa','warn','undetermined',true,false,false,null),
        ('signed_qa','QA','esign','in_qa','warn','undetermined',false,true,false,null),
        ('signed_wip','WIP','esign','in_qa','warn','undetermined',false,true,false,null);
      insert into leads values
        ('closed','f',true,true,'2026-09-01Z'), ('qa','f',true,false,'2026-09-01Z'),
        ('wip','f',true,true,'2026-09-01Z'), ('unrelated','f',true,true,'2026-09-01Z'),
        ('cross-firm','f',true,true,'2026-09-01Z');
      insert into claims values
        ('c1','closed','f','external_dq_review','pending',null),
        ('c2','qa','f','external_dq_review','pending',null),
        ('c3','qa','f','signed_qa','clear',null),
        ('c4','wip','f','external_dq_review','pending',null),
        ('c5','wip','f','signed_wip','clear',null),
        ('c6','cross-firm','f','external_dq_review','pending',null),
        ('c7','cross-firm','other-firm','signed_qa','clear',null);
    `);
    const migration = fs.readFileSync(path.join(app, 'supabase/migrations/0119_dq_stays_closed.sql'), 'utf8');
    assert.ok(fs.readFileSync(path.join(app, 'RUN_THESE_MIGRATIONS.sql'), 'utf8').includes(migration.trim()), 'aggregate SQL must include exact migration');
    await db.exec(migration);
    const first = await db.query('select * from leads order by id');
    const by = Object.fromEntries(first.rows.map(r => [r.id, r]));
    assert.equal(by.closed.qa_pending, false); assert.equal(by.closed.wip_pending, false); assert.equal(by.closed.qa_entered_at, null);
    assert.equal(by.qa.qa_pending, true); assert.equal(by.qa.wip_pending, false); assert.ok(by.qa.qa_entered_at);
    assert.equal(by.wip.qa_pending, false); assert.equal(by.wip.wip_pending, true); assert.ok(by.wip.qa_entered_at);
    assert.equal(by.unrelated.qa_pending, true); assert.equal(by.unrelated.wip_pending, true); assert.ok(by.unrelated.qa_entered_at);
    assert.equal(by['cross-firm'].qa_pending, false); assert.equal(by['cross-firm'].wip_pending, false);
    const cat = (await db.query("select * from statuses where key='external_dq_review'")).rows[0];
    assert.equal(cat.phase, 'terminal'); assert.equal(cat.qualify, 'disqualify'); assert.equal(cat.label, 'DQ: reason missing');
    const closed = (await db.query("select * from claims where status='external_dq_review'")).rows;
    assert.ok(closed.every(c => c.qualification === 'dq' && c.dq_reason_key === null));
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from leads order by id')).rows, first.rows);
    console.log('ok DQ migration: closed flags, sibling QA/WIP, unrelated and cross-firm safety, idempotence');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
