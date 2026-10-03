import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as suggestions from './netfly-note-suggestions';
import * as handoff from './netfly-handoff';

let reply = '', requested: any;
const modules: Record<string, any> = {
  './ai-relay': { askRelay: async (_system: string, user: string) => { requested = JSON.parse(user); return reply; } },
  './netfly-note-suggestions': suggestions,
  './netfly-handoff': handoff,
};
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, 'netfly-email-suggestions.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded: any = {};
new Function('require', 'exports', compiled)((id: string) => { assert.ok(modules[id], id); return modules[id]; }, loaded);

async function main() {
  const note = 'Client: Synthetic Client\nTreatment Received: No\nHealth Insurance: Example Health\nNext Steps: Ask about care today.';
  reply = JSON.stringify({ suggestions: [
    { id: 'health_insured', value: 'Yes', evidence: 'Health Insurance: Example Health' },
    { id: 'seen_doctor', value: 'Yes', evidence: 'Treatment Received: No' },
    { id: 'care_today', value: 'Already in care', evidence: 'Ask about care today' },
    { id: 'confirmed_phone', value: '2025550123', evidence: 'Synthetic Client' },
  ] });
  const result = await loaded.netflyEmailSuggestions(note);
  assert.equal(result.available, true);
  assert.deepEqual(result.suggestions.map((row: any) => row.id), ['health_insured'], 'email helper cannot overwrite explicit facts, answer today’s care question, or invent identity');
  const treatment = 'Injuries & Treatment: The client went to TEST Urgent Care on 09/27/2026. No ambulance transported them.';
  reply = JSON.stringify({ suggestions: [
    { id: 'seen_doctor', value: 'Yes', evidence: 'went to TEST Urgent Care on 09/27/2026' },
    { id: 'first_provider', value: 'TEST Urgent Care', evidence: 'went to TEST Urgent Care' },
    { id: 'first_visit', value: '2026-09-27', evidence: 'on 09/27/2026' },
    { id: 'ambulance', value: 'No', evidence: 'No ambulance transported them' },
  ] });
  const completed = await loaded.netflyEmailSuggestions(treatment);
  assert.equal(completed.suggestions.length, 4, 'completed visit and no ambulance are compatible answers');
  assert.match(requested.fields.find((f: any) => f.id === 'seen_doctor').hint, /ER, urgent care/);
  assert.deepEqual(requested.fields.find((f: any) => f.id === 'first_provider').when, { id: 'seen_doctor', is: 'Yes' });
  assert.equal(suggestions.noteSuggestions(completed.suggestions, treatment, {}).length, 4, 'save validation must keep the dependent care fields together');
  reply = 'not JSON';
  assert.equal((await loaded.netflyEmailSuggestions(note)).available, false);
  reply = '';
  assert.equal((await loaded.netflyEmailSuggestions(note)).available, false);
  console.log('NETFLY narrative enrichment: protected facts, current-call questions and unavailable helper passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
