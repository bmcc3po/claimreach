import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';

const source = fs.readFileSync(path.resolve(__dirname, 'automation-exec.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function main() {
for (const type of ['send_sms', 'send_email']) {
  const step = { type, config: { body: 'Synthetic message', subject: 'Synthetic email' } };
  const db = new FakeDb({
    automation_queue_due: [{ id: 'queued', run_id: 'run', automation_id: 'automation', lead_id: 'lead', firm_id: 'firm', step_index: 0, stop_conditions: [], steps: [step, { type: 'create_task' }] }],
    automation_runs: [{ id: 'run', state: 'active', started_at: '2026-09-28T00:00:00Z' }],
    automation_queue: [{ id: 'queued', state: 'pending' }],
    automation_events: [],
    leads: [{ id: 'lead', firm_id: 'firm', phone: '2025550100' }],
  });
  const mods: Record<string, any> = {
    '@/lib/supabase-server': { supabaseAdmin: () => db },
    '@/lib/automation-engine': { clampToWindow: (date: Date) => date },
    '@/lib/claim-status': { setClaimStatusForLeads: async () => ({ ok: true }) },
    '@/lib/audit': { recordAudit: async () => {} },
  };
  const exp: any = {};
  new Function('require', 'exports', 'fetch', code)((name: string) => {
    assert.ok(name in mods, `Unexpected module ${name}`);
    return mods[name];
  }, exp, async () => { throw new Error('No unauthenticated self-send should occur.'); });
  const result = await exp.drainQueue('https://synthetic.invalid');
  assert.deepEqual(result, { ran: 0, stopped: 1 });
  assert.equal(db.tables.automation_queue[0].state, 'failed');
  assert.equal(db.tables.automation_runs[0].state, 'stopped');
  assert.match(db.tables.automation_runs[0].stop_reason, /not configured/);
  assert.equal(db.tables.automation_queue.length, 1, 'no next step may be scheduled');
  assert.equal(db.tables.automation_events[0].kind, 'error');
  console.log(`ok ${type} does not advance an automation without delivery`);
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
