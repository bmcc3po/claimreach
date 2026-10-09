import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'BoardCard.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
type Mode = 'ok' | 'server' | 'network' | 'html' | 'falseOk';
function fixture(initial: Mode, canPost = true) {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], writes: any[] = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
  };
  const exports: any = {};
  new Function('require', 'exports', 'fetch', code)((id: string) => id === 'react' ? hooks : jsx, exports, async (_url: string, init: any) => {
    writes.push(JSON.parse(init.body)); if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode === 'ok' || mode === 'html', json: async () => { if (mode === 'html') throw new SyntaxError('HTML'); return mode === 'ok' || mode === 'falseOk' ? { ok: true } : { error: 'Synthetic failure' }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ board: { id: 'synthetic', title: 'Updates', description: null }, posts: [], canPost }); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const button = (label: string) => nodes().find(n => n.type === 'button' && text(n) === label);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); return { render, nodes, text, button, flush, writes, mode: (value: Mode) => { mode = value; } };
}
async function main() {
  for (const mode of ['server', 'network', 'html', 'falseOk'] as const) {
    const f = fixture(mode); f.button('+ Post').props.onClick(); f.render(); assert.equal(f.button('Post').props.disabled, true);
    f.nodes().find(n => n.type === 'input').props.onChange({ target: { value: 'Synthetic title' } });
    f.nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: 'Synthetic post draft' } }); f.render();
    const post = f.button('Post').props.onClick; post(); post(); f.render(); assert.equal(f.nodes().find(n => n.type === 'fieldset').props.disabled, true);
    await f.flush(); assert.equal(f.writes.length, 1); assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.equal(f.nodes().filter(n => n.props?.className === 'post').length, 0);
    assert.equal(f.nodes().find(n => n.type === 'textarea').props.value, 'Synthetic post draft');
    f.button('Cancel').props.onClick(); f.render(); f.button('+ Post').props.onClick(); f.render(); assert.equal(f.nodes().find(n => n.type === 'textarea').props.value, 'Synthetic post draft');
    f.mode('ok'); f.button('Post').props.onClick(); await f.flush(); assert.equal(f.nodes().filter(n => n.props?.className === 'post').length, 1); assert.ok(!f.nodes().some(n => n.type === 'textarea'));
    f.button('+ Post').props.onClick(); f.render(); assert.equal(f.nodes().find(n => n.type === 'textarea').props.value, '');
  }
  assert.equal(fixture('ok', false).nodes().filter(n => n.type === 'button').length, 0);
  console.log('Bulletins: server/network/malformed failure retains draft, no invented post, retry, duplicates and read-only view passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
