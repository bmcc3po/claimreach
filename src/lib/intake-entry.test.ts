import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { FakeDb } from './test-fake-db';
import * as links from './intake-links';
import { NETFLY_CAMPAIGN } from './netfly-ontake';

const id = '10000000-0000-4000-8000-000000000001';
assert.equal(links.currentIntakeHref(id, 'mva', 'INNO MVA'), `/app/${id}`);
assert.equal(links.currentIntakeHref(id, 'mva', NETFLY_CAMPAIGN), `/app/netfly/${id}`);
assert.equal(links.currentIntakeHref('TEST /1', 'mva', NETFLY_CAMPAIGN), '/app/netfly/TEST%20%2F1');
assert.equal(links.currentIntakeHref(id, 'motel_trafficking', NETFLY_CAMPAIGN), null);
assert.equal(links.currentIntakeHref(id, null, null), null);

const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/(internal)/intake/[id]/page.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
async function open(leadType: string, campaignType: string, campaignName: string, missing = false) {
  const db = new FakeDb({
    leads: missing ? [] : [{ id, firm_id: 'test-firm', case_type: leadType, campaign_id: 'test-campaign' }],
    campaigns: [{ id: 'test-campaign', name: campaignName, case_type: campaignType }],
    claims: [{ id: 'test-matter', lead_id: id, campaign_id: 'test-campaign', claim_type: campaignType, answers: { existing: 'preserve' } }],
    claim_properties: [],
  });
  const modules: Record<string, any> = {
    'react/jsx-runtime': jsx,
    'next/navigation': { redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); }, notFound: () => { throw new Error('NOT_FOUND'); } },
    '@/lib/supabase-server': { supabaseServer: async () => db },
    '@/components/IntakeSurface': { default: () => null },
    '@/lib/intake-links': links,
    '@/lib/forms': { resolveIntakeFields: async () => [] },
    '@/lib/questionnaire': { intakeForType: () => [] },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', compiled)((key: string) => {
    if (!(key in modules)) throw new Error(`Unstubbed ${key}`);
    return modules[key];
  }, module, module.exports);
  let result = 'legacy';
  try { await module.exports.default({ params: Promise.resolve({ id }) }); }
  catch (error: any) { result = error.message; }
  assert.ok(db.ops.every(op => op.kind === 'select'), 'old entry must not create or modify a matter before redirecting');
  assert.equal(db.tables.claims[0].answers.existing, 'preserve');
  return { result, tables: db.ops.map(op => op.table) };
}
async function main() {
  for (const [leadType, campaignType, name, expected] of [
    ['mva', 'mva', 'INNO MVA', `/app/${id}`],
    ['mva', 'mva', NETFLY_CAMPAIGN, `/app/netfly/${id}`],
    ['motel_trafficking', 'mva', NETFLY_CAMPAIGN, `/app/netfly/${id}`],
  ]) {
    const result = await open(leadType, campaignType, name);
    assert.equal(result.result, `REDIRECT:${expected}`);
    assert.deepEqual(result.tables, ['leads', 'campaigns']);
  }
  assert.equal((await open('motel_trafficking', 'motel_trafficking', 'Motel')).result, 'legacy');
  assert.equal((await open('mva', 'mva', NETFLY_CAMPAIGN, true)).result, 'NOT_FOUND');
  console.log('Intake entry: INNO/NETFLY campaign routing, legacy recovery before writes, other-work preservation and missing-file isolation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
