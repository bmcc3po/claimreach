import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
type Mode = 'ok' | 'error' | 'network' | 'html' | 'deferred';
async function fixture(component: 'CaseDocuments' | 'CaseMessages', initial: Mode) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, component + '.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let cursor = 0, tree: any, getMode = initial, postMode: Mode = 'ok', leadId = 'synthetic';
  const slots: any[] = [], effects: any[] = [], writes: any[] = [], pending: Array<() => void> = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
    useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const exports: any = {};
  new Function('require', 'exports', 'fetch', code)((id: string) => id === 'react' ? hooks : jsx, exports, async (_url: string, init: any) => {
    const mode = init?.method ? postMode : getMode;
    if (init?.method) writes.push(init.body);
    if (mode === 'deferred') await new Promise<void>(resolve => pending.push(resolve));
    if (mode === 'network') throw new TypeError('Failed to fetch');
    return { ok: mode !== 'error', json: async () => { if (mode === 'html') throw new SyntaxError('HTML'); return mode === 'error' ? { error: 'Synthetic failure' } : init?.method ? { ok: true, doc: { id: 'doc' } } : mode === 'deferred' ? { docs: [{ id: 'old', file_name: 'STALE_OLD_FILE' }], messages: [{ id: 'old', body: 'STALE_OLD_FILE' }] } : { docs: [], messages: [] }; } };
  });
  const render = () => { cursor = 0; tree = exports.default({ leadId, claimId: 'matter', me: 'Synthetic Agent' }); effects.splice(0).forEach(fn => fn()); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const button = (label: string) => nodes().find(n => n.type === 'button' && text(n) === label);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); await flush();
  return { render, nodes, text, button, flush, writes, get: (value: Mode) => { getMode = value; }, post: (value: Mode) => { postMode = value; }, switchLead: () => { leadId = 'new-lead'; render(); }, release: () => pending.splice(0).forEach(fn => fn()) };
}
async function main() {
  for (const component of ['CaseDocuments', 'CaseMessages'] as const) {
    const stale = await fixture(component, 'deferred'); stale.get('ok'); stale.switchLead(); await stale.flush(); stale.release(); await stale.flush(); assert.ok(!stale.text().includes('STALE_OLD_FILE'));
    for (const mode of ['error', 'network', 'html'] as const) {
      const f = await fixture(component, mode);
      assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.ok(!/No (documents|messages) yet/.test(f.text()));
      f.get('ok'); f.button(component === 'CaseDocuments' ? 'Retry loading documents' : 'Retry loading messages').props.onClick(); await f.flush();
      assert.match(f.text(), /No (documents|messages) yet/);
    }
  }
  const lateSend = await fixture('CaseMessages', 'ok');
  const message = () => lateSend.nodes().find(n => n.props?.['aria-label'] === 'Case message');
  message().props.onChange({ target: { value: 'Old file draft' } }); lateSend.render(); lateSend.post('deferred'); lateSend.button('Send').props.onClick();
  lateSend.switchLead(); await lateSend.flush(); message().props.onChange({ target: { value: 'New file draft' } }); lateSend.render(); lateSend.release(); await lateSend.flush(); assert.equal(message().props.value, 'New file draft');
  for (const mode of ['error', 'network', 'html'] as const) {
    const f = await fixture('CaseMessages', 'ok'); f.post(mode);
    const draft = () => f.nodes().find(n => n.props?.['aria-label'] === 'Case message');
    draft().props.onChange({ target: { value: 'Synthetic draft' } }); f.render();
    const send = f.button('Send').props.onClick; send(); send(); await f.flush();
    assert.equal(f.writes.length, 1); assert.equal(draft().props.value, 'Synthetic draft'); assert.equal(f.button('Send').props.disabled, false);
    f.button('Refresh messages').props.onClick(); await f.flush(); assert.equal(draft().props.value, 'Synthetic draft');
    f.post('ok'); f.button('Send').props.onClick(); await f.flush(); assert.equal(draft().props.value, '');
    const d = await fixture('CaseDocuments', 'ok'); d.post(mode);
    const input = () => d.nodes().find(n => n.props?.type === 'file');
    const choose = input().props.onChange, file = new File(['NONBINDING synthetic content'], 'synthetic.txt', { type: 'text/plain' });
    choose({ target: { files: [file], value: 'synthetic.txt' } }); choose({ target: { files: [file], value: 'synthetic.txt' } }); await d.flush();
    assert.equal(d.writes.length, 1); assert.equal(input().props.disabled, false); assert.ok(!d.text().includes('File uploaded.'));
    d.button('Refresh documents').props.onClick(); await d.flush(); assert.equal(d.writes.length, 1);
    d.post('ok'); input().props.onChange({ target: { files: [file], value: 'synthetic.txt' } }); await d.flush(); assert.match(d.text(), /File uploaded\./);
    assert.equal(d.writes[0].get('claim_id'), 'matter');
  }
  console.log('File panels: failed/empty loads distinguished, retry, message draft retention, upload recovery and duplicate suppression passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
