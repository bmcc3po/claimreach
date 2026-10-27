const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('/tmp/claimreach-test-tools/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table firms(id uuid primary key,slug text);
 create table campaigns(id uuid primary key,firm_id uuid,name text,case_type text,path text);
 create table leads(id uuid primary key,firm_id uuid,campaign_id uuid,lead_no text,created_at timestamptz default now(),updated_at timestamptz default now(),archived_at timestamptz,unique(firm_id,lead_no));`);
 await db.query("insert into firms values($1,'tmp'),($2,'other')",[id(1),id(2)]);
 await db.query("insert into campaigns values($1,$2,'NETFLY ONTAKE','mva','secondary')",[id(3),id(1)]);
 await db.query("insert into leads(id,firm_id,campaign_id,lead_no,created_at)values($1,$2,$3,'TMP-1200','2026-10-01'),($4,$2,$3,'TMP-1201','2026-10-02')",[id(4),id(1),id(3),id(5)]);
 await db.exec('-- 0131 NETFLY'+fs.readFileSync('RUN_THESE_MIGRATIONS.sql','utf8').split('-- 0131 NETFLY')[1]);
 const preview=()=>db.query('select cr_preview_netfly_numbers($1,$2) as preview',[id(1),id(3)]);
 const first=(await preview()).rows[0].preview;assert.equal(first.count,2);assert.deepEqual(first.mapping.map(r=>r.proposed_number),['NF-TMP1001','NF-TMP1002']);
 assert.deepEqual((await preview()).rows[0].preview,first,'preview neither consumes sequence nor renumbers rows');
 await assert.rejects(db.query('select cr_preview_netfly_numbers($1,$2)',[id(2),id(3)]),/Invalid NETFLY scope/);
 // Independent concurrent requests: sequence allocation remains unique.
 const created=await Promise.all(Array.from({length:20},(_,n)=>db.query('insert into leads(id,firm_id,campaign_id,lead_no)values($1,$2,$3,$4)returning id,lead_no,lead_no_aliases',[id(100+n),id(1),id(3),`TMP-${2000+n}`])));
 const numbers=created.map(r=>r.rows[0].lead_no);assert.equal(new Set(numbers).size,20);assert.equal(numbers[0],'NF-TMP1001');
 assert.equal(created[0].rows[0].lead_no_aliases[0],'TMP-2000');
 assert.equal((await preview()).rows[0].preview.mapping[0].proposed_number,'NF-TMP1021','new imports require a fresh preview');
 await db.query("update leads set lead_no='NF-TMP1100' where id=$1",[id(4)]);
 await db.query("update leads set lead_no_aliases='{}' where id=$1",[id(4)]);
 assert.deepEqual((await db.query('select lead_no_aliases from leads where id=$1',[id(4)])).rows[0].lead_no_aliases,['TMP-1200'],'renumber aliases cannot be erased by ordinary updates');
 assert.equal((await db.query("select has_function_privilege('authenticated','cr_preview_netfly_numbers(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.close();console.log('0131 local database: stable full-scope dry-run, tenant rejection, 20 concurrent allocations, alias retention and read-only preview passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
