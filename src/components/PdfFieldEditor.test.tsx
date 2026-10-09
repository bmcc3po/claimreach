import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'PdfFieldEditor.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
type Mode = 'ok' | 'server' | 'network' | 'html' | 'unauthorized' | 'falseOk';
async function fixture(initial: Mode) {
  let cursor = 0, tree: any, mode = initial;
  const slots: any[] = [], effects: any[] = [], writes: any[] = [];
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(fn: any) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
    useCallback(fn: any) { return fn; },
  };
  const exports: any = {};
  const fetchMock = async (_url: string, init: any) => {
    const body = init?.body && JSON.parse(init.body);
    if (!body || body.op === 'signed_url') return { ok: true, json: async () => body ? { url: 'synthetic' } : {} };
    writes.push(body);
    if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode === 'ok' || mode === 'html', status: mode === 'unauthorized' ? 401 : 500,
      json: async () => { if (mode === 'html') throw new SyntaxError('not JSON'); return mode === 'ok' || mode === 'falseOk' ? { ok: true } : { error: 'Synthetic save failure' }; } };
  };
  const windowMock = { pdfjsLib: { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 840, height: 1080 }), render: () => ({ promise: Promise.resolve() }), getTextContent: async () => ({ items: [] }) }) }) }) } };
  new Function('require', 'exports', 'fetch', 'window', 'document', code)((id: string) => id === 'react' ? hooks : jsx, exports, fetchMock, windowMock, { createElement: () => ({ getContext: () => ({}) }) });
  const render = () => { cursor = 0; tree = exports.default({ templateId: 'synthetic', initialFields: [{ id: 'field', type: 'signature', page: 1, role: 'client', xPct: 10, yPct: 10, wPct: 20, hPct: 7 }], onClose: () => {} }); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const save = () => nodes().find(n => n.type === 'button' && /Save layout|Saving/.test(text(n)));
  const edit = (name: string) => { nodes().find(n => n.props?.['aria-label'] === 'PDF template name').props.onChange({ target: { value: name } }); tree.props.onChange(); render(); };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); assert.equal(save().props.disabled, true); effects.forEach(fn => fn()); await flush();
  return { render, nodes, text, save, edit, flush, writes, mode: (value: Mode) => { mode = value; } };
}
async function main() {
  for (const mode of ['server', 'network', 'html', 'unauthorized', 'falseOk'] as const) {
    const f = await fixture(mode); f.edit('Unsaved synthetic layout'); f.save().props.onClick(); f.render();
    assert.equal(f.nodes().find(n => n.type === 'fieldset').props.disabled, true);
    await f.flush(); assert.ok(!f.text().includes('Saved.'));
    assert.equal(f.nodes().find(n => n.props?.['aria-label'] === 'PDF template name').props.value, 'Unsaved synthetic layout');
    assert.equal(f.writes[0].fields[0].id, 'field'); assert.equal(f.save().props.disabled, false);
    f.mode('ok'); f.save().props.onClick(); await f.flush(); assert.match(f.text(), /Saved\./);
    f.edit('New draft'); assert.ok(!f.text().includes('Saved.'));
  }
  const f = await fixture('ok'), save = f.save().props.onClick; save(); save(); await f.flush(); assert.equal(f.writes.length, 1);
  console.log('PDF editor save: failure/session/malformed/false-success recovery, draft preservation, retry, loading guard and duplicate prevention passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

