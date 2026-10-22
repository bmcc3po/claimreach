import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const rendererRequire = createRequire(require.resolve('react-test-renderer'));
const React = rendererRequire('react');
const { create, act } = require('react-test-renderer');
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../components/netfly/NetflyFile.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exportsObject: any = {};
new Function('require', 'exports', compiled)((id: string) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return rendererRequire(id);
  if (id.startsWith('@/lib/')) return require(path.resolve(__dirname, id.slice('@/lib/'.length)));
  if (id.endsWith('.css')) return {};
  return { default: (props: any) => React.createElement('div', null, props.children) };
}, exportsObject);
(globalThis as any).window = { setInterval: () => 1, clearInterval: () => {} };
(globalThis as any).document = { getElementById: () => null };
const detail = { actor_id: 'actor', actor_name: 'Synthetic Reviewer', actor_role: 'agent', canReview: true, can_archive: false, live_call: null,
  file: { id: 'lead', lead_no: 'TMP-TEST', claimant_name: 'Synthetic', phone: '', email: '' }, claim: { id: 'claim', status: 'new' },
  answers: { fields: {}, review: { status: 'in_progress' }, handoffs: [{ note: 'Synthetic client account', at: '', by_name: 'Synthetic' }] },
  retainer: [{ id: 'signed-pdf', file_name: 'test.pdf', created_at: '2026-10-01', url: 'https://example.test/test.pdf' }] };
let posts: any[] = [], saved = false, failSave = false;
globalThis.fetch = (async (_url: any, options: any) => {
  if (options?.method === 'POST') {
    const body = JSON.parse(options.body); posts.push(body);
    if (failSave) return { ok: false, json: async () => ({ error: 'Review was not saved. Refresh and retry.' }) };
    saved = true;
    return { ok: true, json: async () => ({ ok: true, review: { status: 'retainer_reviewed', retainer_reviewed_document_id: 'signed-pdf', by: 'actor' } }) };
  }
  return { ok: !saved, json: async () => saved ? { error: 'Refetch unavailable' } : detail };
}) as any;
let root: any;
const button = (text: string) => root.root.findAllByType('button').find((node: any) => node.children.join('').includes(text));
async function openReview() {
  await act(async () => { root = create(React.createElement(exportsObject.default, { fileKey: 'TMP-TEST' })); });
  await act(async () => { button('Review &').props.onClick(); });
  await act(async () => { button('Open signed PDF here').props.onClick(); });
  const label = root.root.findAllByType('label').find((node: any) => node.children.some((child: any) => typeof child === 'string' && child.includes('I checked the signed')));
  await act(async () => { label.findByType('input').props.onChange({ target: { checked: true } }); });
  assert.equal(posts.length, 0, 'opening/checking alone never claims persisted review');
}
async function main() {
  await openReview();
  assert.ok(JSON.stringify(root.toJSON()).includes('Client-details verification is not saved'));
  await act(async () => { button('Record signed-PDF review').props.onClick(); });
  assert.deepEqual(posts[0], { op: 'review', file: 'TMP-TEST', status: 'retainer_reviewed', document_id: 'signed-pdf', note: '' });
  assert.ok(JSON.stringify(root.toJSON()).includes('Signed PDF reviewed.'), 'server-acknowledged review remains visible when refetch fails');
  assert.ok(JSON.stringify(root.toJSON()).includes('Refetch unavailable'));
  await act(async () => { root.unmount(); });
  saved = false; failSave = true; posts = [];
  await openReview();
  await act(async () => { button('Record signed-PDF review').props.onClick(); });
  assert.ok(JSON.stringify(root.toJSON()).includes('Review was not saved.'));
  assert.ok(!JSON.stringify(root.toJSON()).includes('Signed PDF reviewed.'));
  assert.equal(button('Record signed-PDF review').props.disabled, false, 'failed review can be retried by the actual reviewer');
  await act(async () => { root.unmount(); });
  console.log('NETFLY review controls: explicit persistence, exact document, successful acknowledgment with failed refetch and failed-save retry passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
