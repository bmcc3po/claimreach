import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as suggestions from './netfly-note-suggestions';
import * as handoff from './netfly-handoff';

let reply = '';
const modules: Record<string, any> = {
  './ai-relay': { askRelay: async () => reply },
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
  reply = 'not JSON';
  assert.equal((await loaded.netflyEmailSuggestions(note)).available, false);
  reply = '';
  assert.equal((await loaded.netflyEmailSuggestions(note)).available, false);
  console.log('NETFLY narrative enrichment: protected facts, current-call questions and unavailable helper passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
