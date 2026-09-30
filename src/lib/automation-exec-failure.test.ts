import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { FakeDb } from './test-fake-db';
import { manualIntakeStatusAllowed, isSignedKey } from './statuses';
import * as transitionGuard from './intake-status-guard';

const source = fs.readFileSync(path.resolve(__dirname, 'automation-exec.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function main() {
for (const type of ['send_sms', 'send_email']) {
  const step = { type, config: { body: 'Synthetic message', subject: 'Synthetic email' } };
  const db = new FakeDb({
    automation_queue_due: [{ id: 'queued', run_id: 'run', automation_id: 'automation', lead_id: 'lead', firm_id: 'firm', step_index: 0, stop_conditions: [], steps: [step, { type: 'create_task' }] }],
    automation_runs: [{ id: 'run', automation_id: 'automation', lead_id: 'lead', firm_id: 'firm', current_step: 0, state: 'active', started_at: '2026-09-28T00:00:00Z' }],
    automation_queue: [{ id: 'queued', state: 'pending', run_at: '2026-01-01T00:00:00Z', run_id: 'run', automation_id: 'automation', lead_id: 'lead', firm_id: 'firm', step_index: 0 }],
    automations: [{ id: 'automation', active: true, firm_id: 'firm', steps: [step, { type: 'create_task' }], stop_conditions: [] }],
    automation_events: [],
    leads: [{ id: 'lead', firm_id: 'firm', phone: '2025550100' }],
  });
  const mods: Record<string, any> = {
    '@/lib/supabase-server': { supabaseAdmin: () => db },
    '@/lib/automation-engine': { automationStepRunAt: (_step: any, date: Date) => date, clampToWindow: (date: Date) => date, loadAutomationTarget: async () => ({ lead: db.tables.leads[0], claim: { id: 'claim', status: 'new' }, soleClaim: true, blocked: null }) },
    '@/lib/claim-status': { setClaimStatusForLeads: async () => ({ ok: true }) },
    '@/lib/statuses': { manualIntakeStatusAllowed, isSignedKey },
    '@/lib/intake-status-guard': transitionGuard,
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
