import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'ProfileEditor.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function fixture(initial: 'ok' | 'server' | 'network' | 'html' | 'unauthorized') {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], writes: any[] = [];
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ||= { current: initial }; },
  };
  const exports: any = {};
  new Function('require', 'exports', 'fetch', code)((id: string) => id === 'react' ? hooks : jsx, exports, async (_url: string, init: any) => {
    writes.push(JSON.parse(init.body));
    if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode === 'ok' || mode === 'html', status: mode === 'unauthorized' ? 401 : mode === 'server' ? 500 : 200,
      json: async () => { if (mode === 'html') throw new SyntaxError('not JSON'); return mode === 'ok' ? { ok: true } : { error: 'Synthetic save failure' }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ me: { full_name: 'Fictional Intake Agent' }, email: 'qa@example.test' }); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(text).join('') : text(root.props?.children ?? null);
  const save = () => nodes().find(n => n.type === 'button' && /Save profile|Saved|Saving/.test(text(n)));
  const edit = (name: string) => { nodes().find(n => n.props?.id === 'profile-name').props.onChange({ target: { value: name } }); nodes().find(n => n.props?.className === 'card').props.onChange(); render(); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); return { render, nodes, text, save, edit, flush, writes, mode: (value: typeof mode) => { mode = value; } };
}
async function main() {
  for (const mode of ['server', 'network', 'html', 'unauthorized'] as const) {
    const f = fixture(mode); f.edit('My unsaved draft'); f.save().props.onClick(); f.render();
    assert.equal(f.nodes().find(n => n.type === 'fieldset').props.disabled, true);
    await f.flush(); assert.ok(f.nodes().some(n => n.props?.role === 'alert'));
    assert.ok(!f.text().includes('Saved ✓')); assert.equal(f.nodes().find(n => n.props?.id === 'profile-name').props.value, 'My unsaved draft');
    f.mode('ok'); f.save().props.onClick(); await f.flush(); assert.match(f.text(), /Saved ✓/);
    f.edit('New changes'); assert.ok(!f.text().includes('Saved ✓')); assert.equal(f.writes.length, 2);
  }
  const f = fixture('ok'), send = f.save().props.onClick; send(); send(); await f.flush(); assert.equal(f.writes.length, 1);
  const color = f.nodes().find(n => n.props?.['aria-label'] === 'Avatar color 2'); color.props.onClick(); f.render(); assert.ok(!f.text().includes('Saved ✓'));
  console.log('Profile save: server/network/malformed/session failures, draft preservation, retry, changed-field status and double-tap passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
