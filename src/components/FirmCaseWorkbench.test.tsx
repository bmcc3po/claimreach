import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as questionnaire from '../lib/questionnaire';

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'FirmCaseWorkbench.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
type Mode = 'ok' | 'server' | 'network' | 'html' | 'forbidden';
function fixture(initial: Mode, locked = false) {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], writes: any[] = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
  };
  const exports: any = {};
  new Function('require', 'exports', 'fetch', code)((id: string) => id === 'react' ? hooks : id === 'react/jsx-runtime' ? jsx : id.includes('questionnaire') ? questionnaire : { default: 'fixture-component' }, exports, async (url: string, init: any) => {
    writes.push({ url, body: JSON.parse(init.body) });
    if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode === 'ok' || mode === 'html', status: mode === 'forbidden' ? 403 : 500,
      json: async () => { if (mode === 'html') throw new SyntaxError('HTML'); return mode === 'ok' ? (url === '/api/notes' ? { note: { id: 'synthetic-note' } } : { ok: true }) : { error: 'Synthetic server failure' }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ lead: { id: 'synthetic-lead', stage: 'signed_retained', phone: '+12025550123' }, claims: [{ id: 'synthetic-claim' }], callLogs: [], activity: [], locked }); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const button = (label: string) => nodes().find(n => n.type === 'button' && text(n) === label);
  const input = (placeholder: string) => nodes().find(n => n.props?.placeholder === placeholder);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); return { render, nodes, text, button, input, flush, writes, mode: (value: Mode) => { mode = value; } };
}
async function main() {
  for (const mode of ['server', 'network', 'html', 'forbidden'] as const) {
    for (const [action, placeholder, tab] of [
      ['Add note', 'Add a note to this case', 'Overview'],
      ['Send request', 'What do you need? (sent to the intake team)', 'Overview'],
      ['Send text', 'Message to the client (JustCall, comms-safety enforced)', 'Text client'],
    ]) {
      const f = fixture(mode); f.button(tab).props.onClick(); f.render();
      f.input(placeholder).props.onChange({ target: { value: 'Synthetic draft' } }); f.render();
      const send = f.button(action).props.onClick; send(); send(); f.render();
      assert.equal(f.nodes().find(n => n.type === 'fieldset').props.disabled, true);
      await f.flush(); assert.equal(f.input(placeholder).props.value, 'Synthetic draft'); assert.equal(f.writes.length, 1);
      assert.ok(f.text().includes('still here') || f.text().includes('Synthetic server failure'));
      f.mode('ok'); f.button(action).props.onClick(); await f.flush(); assert.equal(f.input(placeholder).props.value, '');
      assert.equal(f.writes[0].body.lead_id, 'synthetic-lead');
    }
    const f = fixture(mode); const stage = () => f.nodes().find(n => n.props?.['aria-label'] === 'Case stage');
    stage().props.onChange({ target: { value: 'declined' } }); await f.flush(); assert.equal(stage().props.value, 'signed_retained');
    f.mode('ok'); stage().props.onChange({ target: { value: 'declined' } }); await f.flush(); assert.equal(stage().props.value, 'declined');
  }
  const locked = fixture('ok', true); assert.equal(locked.nodes().filter(n => n.type === 'button').length, 0);
  console.log('Legacy firm view: note/request/text failures retain drafts, confirmed-only stage, retry, duplicate suppression and locked-view controls passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
