import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import * as statuses from './statuses';

const db = new FakeDb({ leads: [], sla_settings: [] });
const from = db.from.bind(db);
// Equivalent PostgREST NOT IS NULL used by the alert reader.
db.from = ((table: string) => {
  const query: any = from(table);
  query.not = (column: string, operator: string, value: unknown) => {
    assert.equal(operator, 'is'); assert.equal(value, null);
    return query.neq(column, null);
  };
  return query;
}) as typeof db.from;
const exports_: any = {};
const modules: Record<string, any> = {
  '@/lib/supabase-server': { supabaseAdmin: () => db }, './statuses': statuses,
};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, 'alerts.ts'), 'utf8'),
  { compilerOptions: { target: 9, module: 1 } }).outputText)
  ((key: string) => { assert.ok(key in modules, key); return modules[key]; }, exports_);

(async () => {
  for (const state of ['signed_dropped', 'dq', 'dead', 'delivered', 'signed_wip']) {
    db.tables.leads = [{ id: 'closed', lead_no: 'TEST-CLOSED', claimant_name: 'Synthetic Client',
      archived_at: null, created_at: '2020-01-01', signed_at: '2020-01-02',
      qa_entered_at: '2020-01-02', qa_pending: true, claims: [{ status: state }] }];
    assert.deepEqual(await exports_.computeAlerts(db), [], `${state} must not reappear from stale QA flags`);
  }
  // A different matter still requiring QA must remain visible.
  db.tables.leads[0].claims = [{ status: 'signed_dropped' }, { status: 'signed_qa' }];
  assert.equal((await exports_.computeAlerts(db)).filter((a: any) => a.kind === 'qa_stuck').length, 1);
  db.tables.leads[0].claims = [{ status: 'signed_grievous' }];
  assert.equal((await exports_.computeAlerts(db)).filter((a: any) => a.kind === 'qa_stuck').length, 1);
  db.tables.statuses = [{ ...statuses.DEFAULT_STATUSES.find(s => s.key === 'qa'), key: 'custom_review' }];
  db.tables.leads[0].claims = [{ status: 'custom_review' }];
  assert.equal((await exports_.computeAlerts(db)).filter((a: any) => a.kind === 'qa_stuck').length, 1);
  db.tables.leads[0].archived_at = '2026-10-01';
  assert.deepEqual(await exports_.computeAlerts(db), []);
  console.log('Alert regressions: terminal/delivered/WIP stale flags excluded; sibling QA retained; archived excluded.');
})().catch(error => { console.error(error); process.exitCode = 1; });
