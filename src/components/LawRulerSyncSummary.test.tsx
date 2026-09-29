import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LawRulerSyncSummary from './LawRulerSyncSummary';
(globalThis as any).React = React;
let count = 0, failed = 0;
function check(name: string, fn: () => void) { try { fn(); count++; console.log('ok', name); } catch (e) { failed++; console.error('FAIL', name, '\n', e); } }
const render = (imported: any) => renderToStaticMarkup(<LawRulerSyncSummary imported={imported} />);
check('no import renders no empty panel', () => { assert.equal(render(null), ''); });
check('source HTML is escaped, multiline text preserved, long answers wrap and no links execute', () => {
  const html = render({ sourceStatus: '<img src=x onerror=alert(1)>', presign: { evidence: { a: { token: 'Custom4141', raw: '<script>alert(1)</script>\nSecond line' } }, provenance: {}, review: 1 } });
  assert.ok(!html.includes('<script>') && !html.includes('<img'));
  assert.match(html, /&lt;script&gt;/); assert.match(html, /white-space:pre-wrap/); assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /<details>/); assert.match(html, /Second line/);
});
check('external signing report remains unverified and pending document errors are visible once', () => {
  const html = render({ sourceStatus: 'Signed', sourceSignedReported: true, originalRetainerStored: false, pendingMissing: ['Original needed'], lastSync: { document_result: { errors: ['Original needed'] } } });
  assert.match(html, /has not been independently verified/); assert.match(html, /Original retainer still needed/);
  assert.equal((html.match(/Original needed/g) || []).length, 1);
});
check('current structured-intake import failure is visible even if prior evidence exists', () => {
  const html = render({ sourceStatus: 'Signed', presign: { evidence: {}, provenance: { 'story.seat': {} }, review: 0 }, lastSync: { intake_result: { outcome: 'failed', retry_required: true, error: 'Synthetic intake import failed; retry this event.' } } });
  assert.match(html, /Synthetic intake import failed/);
});
check('unsupported object-array source values remain inspectable instead of object-object placeholders', () => {
  const html = render({ presign: { evidence: { a: { token: 'Custom4131', raw: [{ unexpected: 'Urgent Care' }] } }, provenance: {}, review: 1 } });
  assert.match(html, /unexpected/); assert.match(html, /Urgent Care/); assert.ok(!html.includes('[object Object]'));
});
console.log(`${count} passed, ${failed} failed`); if (failed) process.exitCode = 1;
