import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
// Test-only renderer is installed outside the application, alongside tsx.
const rendererRequire = createRequire(require.resolve('react-test-renderer'));
const React = rendererRequire('react');
const { create, act } = require('react-test-renderer');
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../components/netfly/NetflySendPacket.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exportsObject: any = {};
new Function('require', 'exports', compiled)((id: string) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return rendererRequire(id);
  if (id === 'next/link') return { default: (props: any) => React.createElement('a', props) };
  if (id === '../calls/FileQaCheck') return { default: () => null };
  throw new Error(id);
}, exportsObject);
let packet = { errors: ['Read back NETFLY’s note and choose Details match or Record changes.', 'Open the signed PDF and record your review.'], documents: [], to: 'firm@example.test', cc: [], snapshot: 'a'.repeat(64), case_url: '/case', sent_at: null, can_send: true, dispatch: null as any };
let pending: ((value: any) => void) | null = null;
let hold = false, posts = 0, navigations = 0;
globalThis.fetch = (async (_url: any, options: any) => {
  if (options?.method === 'POST') { posts++; return { ok: true, json: async () => ({ ok: true }) }; }
  if (hold) return new Promise(resolve => { pending = resolve; });
  return { ok: true, json: async () => packet };
}) as any;
const props = { fileKey: 'TMP-TEST', revision: '1', signedDocuments: [], unsaved: false, onReviewSteps: () => navigations++ };
let root: any;
const checkbox = () => root.root.findByType('input');
const button = (text: string) => root.root.findAllByType('button').find((node: any) => node.children.join('').includes(text));
async function main() {
  await act(async () => { root = create(React.createElement(exportsObject.default, props)); });
  assert.equal(checkbox().props.disabled, true, 'missing persisted reviews block final acknowledgment');
  assert.equal(button('SEND TO FIRM').props.disabled, true);
  await act(async () => { button('Go to saved review steps').props.onClick(); });
  assert.equal(navigations, 1); assert.equal(posts, 0, 'navigation never saves acknowledgments or sends');
  packet = { ...packet, errors: [] };
  await act(async () => { button('Refresh delivery status').props.onClick(); });
  assert.equal(checkbox().props.disabled, false);
  await act(async () => { checkbox().props.onChange({ target: { checked: true } }); });
  assert.equal(button('SEND TO FIRM').props.disabled, false);
  hold = true;
  await act(async () => { button('Refresh delivery status').props.onClick(); });
  assert.equal(checkbox().props.checked, false, 'refresh invalidates final confirmation');
  assert.equal(checkbox().props.disabled, true, 'old preview cannot be acknowledged during refresh');
  await act(async () => { await button('SEND TO FIRM').props.onClick(); });
  assert.equal(posts, 0, 'handler also refuses stale preview');
  hold = false;
  await act(async () => { pending!({ ok: true, json: async () => ({ ...packet, dispatch: { state: 'uncertain' } }) }); });
  assert.equal(checkbox().props.disabled, true, 'uncertain delivery remains locked');
  packet = { ...packet, can_send: false };
  await act(async () => { button('Refresh delivery status').props.onClick(); });
  assert.equal(checkbox().props.disabled, true);
  assert.ok(JSON.stringify(root.toJSON()).includes('This account cannot send'));
  await act(async () => { root.unmount(); });
  console.log('NETFLY send controls: missing reviews, navigation, refreshed readiness, stale preview, uncertain delivery and permissions passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
