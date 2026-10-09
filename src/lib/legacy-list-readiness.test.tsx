import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as statuses from './statuses';
import ReadError from '../components/ReadError';

const catalog = [...statuses.DEFAULT_STATUSES, { ...statuses.DEFAULT_STATUSES.find(s => s.key === 'signed_approved')!, key: 'custom_retainer', active: false }];
const leads = ['new', 'contacting', 'esign_sent', 'signed_wip', 'signed_approved', 'delivered', 'signed_dropped', 'dq', 'custom_retainer', 'signed_grievous', 'external_signed_review'].map((status, i) => ({ id: `case-${i}`, lead_no: `TEST-${i}`, updated_at: '2026-09-01T00:00:00Z', claims: [{ status, supervisor_flag: status === 'dq' }] }));
async function fixture(page: string, fail = '', empty = false, rows = leads) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app', page, 'page.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const queries: any[] = [];
  const from = (table: string) => {
    const query: any = { table, filters: [] }; queries.push(query);
    const builder: any = {};
    for (const method of ['select', 'order', 'limit', 'eq', 'is', 'in']) builder[method] = (...args: any[]) => { query.filters.push([method, ...args]); return builder; };
    const result = () => ({ data: fail === table ? null : table === 'app_users' ? (page.includes('team') ? (empty ? [{ role: 'firm' }] : [{ id: 'synthetic', full_name: 'Fictional Alexandria Montgomery', role: 'agent' }]) : { role: 'firm', firm_id: 'synthetic-firm' }) : table === 'firms' ? { name: 'Synthetic Firm' } : table === 'statuses' ? catalog : table === 'leads' ? (empty ? [] : rows) : table === 'claims' ? rows.flatMap(l => l.claims.map(c => ({ ...c, lead_id: l.id }))) : [], error: fail === table ? { message: 'Synthetic DB error' } : null });
    builder.maybeSingle = async () => result(); builder.then = (resolve: any) => Promise.resolve(result()).then(resolve); return builder;
  };
  const exports: any = {};
  const modules: Record<string, any> = {
    'react/jsx-runtime': jsx, '@/lib/supabase-server': { supabaseServer: async () => ({ from }) }, '@/lib/auth-user': { authUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    '@/lib/statuses': statuses, '@/components/ReadError': { default: ReadError }, 'next/link': { default: ({ children, ...props }: any) => jsx.jsx('a', { ...props, children }) },
    '@/components/BoardCard': { default: () => null }, '@/components/ReportsView': { default: () => null }, '@/components/LeadsView': { default: () => null },
  };
  new Function('require', 'exports', code)((id: string) => { if (!modules[id]) throw new Error(`Unexpected dependency: ${id}`); return modules[id]; }, exports);
  const tree = await exports.default();
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  return { tree, queries, nodes, html: () => renderToStaticMarkup(tree) };
}

async function main() {
  for (const [page, tables] of [
    ['(firm)/portal', ['leads', 'statuses']], ['(firm)/portal/cases', ['leads', 'claims']], ['(firm)/portal/reports', ['leads', 'claims', 'statuses']], ['(internal)/team', ['app_users']],
  ] as [string, string[]][]) {
    for (const table of tables) {
      const f = await fixture(page, table); assert.equal(f.tree.type, ReadError); assert.match(f.html(), /role="alert"/); assert.match(f.html(), /Try again/); assert.ok(!f.html().includes('Nothing needs attention')); assert.ok(!f.html().includes('No team members'));
    }
    const f = await fixture(page, '', true); assert.notEqual(f.tree.type, ReadError);
    for (const q of f.queries.filter(q => q.table === 'leads')) assert.ok(q.filters.some((x: any[]) => x[0] === 'is' && x[1] === 'archived_at' && x[2] === null));
  }
  const home = await fixture('(firm)/portal');
  assert.deepEqual(home.nodes().filter(n => n.props?.className === 'kv').map(n => n.props.children), [11, 3, 3, 6]);
  assert.match(home.html(), /Waiting for review \(1\+ days\)/);
  assert.ok(!home.html().includes('Flagged for attention')); // terminal DQ flag does not reopen work
  const team = await fixture('(internal)/team', '', true); assert.match(team.html(), /No team members yet/);
  const cap = await fixture('(firm)/portal', '', false, Array(500).fill(leads[0])); assert.match(cap.html(), /500 most recently updated/);
  const report = await fixture('(firm)/portal/reports', '', false, Array(2000).fill(leads[0])); assert.match(report.html(), /may not include every case/);
  if (process.argv.includes('--fixtures')) {
    const views = { legacyhome: home.html(), legacyteam: (await fixture('(internal)/team')).html(), legacyerror: (await fixture('(firm)/portal', 'leads')).html() };
    fs.writeFileSync('work/legacy-html.ts', `export const legacyHtml: Record<string,string> = ${JSON.stringify(views)};`);
  }
  console.log('Legacy read views: eight read failures never become empty/zero success; canonical custom/retired/signed/declined counts, terminal flags, archive predicates and limits passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
