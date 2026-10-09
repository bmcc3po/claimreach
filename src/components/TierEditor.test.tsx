import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as tiers from '../lib/tiers';
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'TierEditor.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
type Mode = 'ok' | 'error' | 'network' | 'html' | 'falseOk';
function fixture(initial: Mode) {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], writes: any[] = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
  };
  const exports: any = {};
  new Function('require', 'exports', 'fetch', code)((id: string) => id === 'react' ? hooks : id === 'react/jsx-runtime' ? jsx : tiers, exports, async (_url: string, init: any) => {
    writes.push(JSON.parse(init.body)); if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode === 'ok' || mode === 'html', json: async () => { if (mode === 'html') throw new SyntaxError('HTML'); return mode === 'ok' || mode === 'falseOk' ? { ok: true } : { error: 'Synthetic failure' }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ claimId: 'synthetic', claimType: 'mva' }); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const button = (label: string) => nodes().find(n => n.type === 'button' && text(n) === label);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); return { render, nodes, text, button, flush, writes, mode: (value: Mode) => { mode = value; } };
}
async function main() {
  for (const mode of ['error', 'network', 'html', 'falseOk'] as const) {
    const f = fixture(mode); f.button('2').props.onClick(); f.render();
    const send = f.button('Save tier').props.onClick; send(); send(); f.render();
    assert.equal(f.nodes().find(n => n.type === 'fieldset').props.disabled, true);
    await f.flush(); assert.equal(f.writes.length, 1); assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.ok(!f.text().includes('Saved ✓')); assert.equal(f.button('2').props['aria-pressed'], true);
    f.mode('ok'); f.button('Save tier').props.onClick(); await f.flush(); assert.ok(f.text().includes('Saved ✓'));
    f.button('3').props.onClick(); f.render(); assert.ok(!f.text().includes('Saved ✓'));
  }
  console.log('Tier editor: failed/uncertain/malformed saves retain selection, no false Saved, retry and duplicate suppression passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
