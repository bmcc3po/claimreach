import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual DeskPanel/FileTab handlers and hook ownership without a
// browser or network. Each remounted FileTab gets a fresh hook store, while its
// parent Desk keeps the per-matter draft across tools and claim changes.
type Element = { type: any; props: any };
type Instance = { hooks: any[]; next: number };
let active: Instance;
const React = {
  createElement: (type: any, props: any, ...children: any[]): Element => ({ type, props: { ...props, children } }),
  useState(initial: any) {
    const owner = active, index = owner.next++;
    if (!(index in owner.hooks)) owner.hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.hooks[index], (update: any) => { owner.hooks[index] = typeof update === 'function' ? update(owner.hooks[index]) : update; }];
  },
  useRef(initial: any) { const [ref] = React.useState(() => ({ current: initial })); return ref; },
  useId() { const [id] = React.useState('test-disclosure'); return id; },
  useEffect() {},
  useMemo: (read: () => any) => read(),
};
const source = fs.readFileSync(path.join(__dirname, 'DeskPanel.tsx'), 'utf8');
const moduleObject = { exports: {} as any };
const fileData = { lead: { lead_no: 'TMP-TEST', campaign: 'Synthetic' }, status: { key: 'new' }, agreements: [], notes: [], docs: [], history: [] };
let releaseSave: (value: any) => void = () => {};
const posted: any[] = [];
const response = (body: any, ok = true) => ({ ok, json: async () => body });
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
vm.runInNewContext(code, {
  React, exports: moduleObject.exports, module: moduleObject,
  require: (name: string) => name === 'react' ? React : { default: () => null, REBS: [], REB_GROUPS: [], LINES: [] },
  fetch: (url: string, options?: any) => {
    if (url === '/api/notes') { posted.push(JSON.parse(options.body)); return new Promise(resolve => { releaseSave = resolve; }); }
    assert.match(url, /^\/api\/calls\/file\?/); return Promise.resolve(response(fileData));
  },
  console, URLSearchParams,
});
const DeskPanel = moduleObject.exports.default;
const desk: Instance = { hooks: [], next: 0 };
const render = (instance: Instance, component: any, props: any) => { active = instance; instance.next = 0; return component(props) as Element; };
function find(tree: any, predicate: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate); if (found) return found; } return; }
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}
const text = (node: any): string => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : String(node ?? '');
const button = (tree: Element, label: string) => { const node = find(tree, n => n.type === 'button' && text(n) === label); assert.ok(node, label); return node; };
const props: any = { v: {}, tab: 'file', setTab: (tab: string) => { props.tab = tab; }, phase: 'open', fill: (s: string) => s, lead: null, preview: { href: null, checks: [] }, focusLines: null, phones: [], leadId: 'lead-A', claimId: 'claim-A', story: { city: '', crash: null } };
const deskTree = () => render(desk, DeskPanel, props);
const fileElement = () => { const node = find(deskTree(), n => n.type?.name === 'FileTab'); assert.ok(node); return node; };
const fileTree = () => { const node = fileElement(); return render({ hooks: [fileData], next: 0 }, node.type, node.props); };
const edit = (value: string) => find(fileTree(), n => n.type === 'textarea' && n.props['aria-label'] === 'Add a note')!.props.onChange({ target: { value } });

edit('Unsaved first matter note');
button(fileTree(), 'Case').props.onClick();
props.tab = 'texts';
assert.equal(find(deskTree(), n => n.type?.name === 'FileTab'), undefined, 'File effects are unmounted while another tool is open');
props.tab = 'file';
assert.equal(fileElement().props.noteDraft.body, 'Unsaved first matter note');
assert.equal(fileElement().props.noteDraft.scope, 'case');
props.claimId = 'claim-B';
assert.equal(fileElement().props.noteDraft.body, '', 'a different matter on the same lead starts empty');
edit('Separate second matter note');
props.claimId = 'claim-A';
assert.equal(fileElement().props.noteDraft.body, 'Unsaved first matter note');
props.leadId = 'lead-B';
assert.equal(fileElement().props.noteDraft.body, '', 'a different lead also cannot inherit the draft');
props.leadId = 'lead-A';
console.log('ok notes and scope survive tab remounts and remain isolated by lead and claim');

async function saveChecks() {
  const saving = button(fileTree(), 'Save note').props.onClick();
  assert.equal(fileElement().props.noteDraft.saving, true);
  props.tab = 'texts'; deskTree(); props.tab = 'file';
  assert.equal(button(fileTree(), 'Saving').props.disabled, true, 'returning to File cannot double-submit an in-flight note');
  edit('New text entered while the earlier note saves');
  props.claimId = 'claim-B';
  releaseSave(response({ ok: true })); await saving;
  assert.equal(fileElement().props.noteDraft.body, 'Separate second matter note', 'old save cannot clear the newly selected matter');
  props.claimId = 'claim-A';
  assert.equal(fileElement().props.noteDraft.body, 'New text entered while the earlier note saves', 'successful save cannot discard newer typing');
  assert.equal(fileElement().props.noteDraft.saving, false);
  assert.equal(posted[0].claim_id, 'claim-A');
  assert.equal(posted[0].scope, 'case');
  const cleanSave = button(fileTree(), 'Save note').props.onClick();
  releaseSave(response({ ok: true })); await cleanSave;
  assert.equal(fileElement().props.noteDraft.body, '', 'the exact successfully saved draft clears');
  edit('Retain me after a failed save');
  const failedSave = button(fileTree(), 'Save note').props.onClick();
  releaseSave(response({ error: 'Synthetic save rejected' }, false)); await failedSave;
  props.tab = 'texts'; deskTree(); props.tab = 'file';
  assert.equal(fileElement().props.noteDraft.body, 'Retain me after a failed save');
  assert.equal(fileElement().props.noteDraft.error, 'Synthetic save rejected');
  assert.match(text(fileTree()), /Synthetic save rejected/);
  console.log('ok in-flight, successful and failed saves preserve the correct matter and newer edits');

  let tree = deskTree();
  const more = find(tree, n => n.type === 'button' && /cc-desk-more/.test(n.props.className || ''))!;
  let focusCount = 0;
  more.props.ref.current = { focus: () => { focusCount++; } };
  more.props.onClick(); tree = deskTree();
  let prevented = false;
  find(tree, n => n.props.className === 'cc-side-top')!.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(find(deskTree(), n => n.type === 'button' && /cc-desk-more/.test(n.props.className || ''))!.props['aria-expanded'], false);
  assert.ok(prevented && focusCount === 1, 'Escape from the disclosure closes More and restores focus');
  console.log('ok More Escape works while focus remains on its disclosure');

  props.claimId = 'claim-B'; tree = fileTree();
  const print = find(tree, n => n.type === 'a' && text(n) === 'Print or email')!;
  assert.equal(print.props.href, '/app/TMP-TEST/print?claim=claim-B');
  const focused: string[] = [];
  find(tree, n => n.type === 'textarea' && n.props['aria-label'] === 'Add a note')!.props.ref.current = {
    focus: () => focused.push('focus'), scrollIntoView: () => focused.push('scroll'),
  };
  button(tree, 'Add note').props.onClick();
  assert.deepEqual(focused, ['focus', 'scroll']);
  console.log('ok File shortcuts retain exact matter scope and land on the note editor');
}
saveChecks().catch(error => { console.error(error); process.exitCode = 1; });
