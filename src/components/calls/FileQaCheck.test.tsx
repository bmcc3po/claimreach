import assert from 'node:assert/strict';
import { createRuntime, one, text } from '../contact-saves.harness';
const props = { leadId: 'lead', claimId: 'claim', revision: '1', unsaved: false };
const report = { claimId: 'claim', fingerprint: 'saved', findings: [{ id: 'date', level: 'review', message: 'Check the dates', field: 'firstAt', evidence: ['Treatment: before crash'] }], narrative: 'complete', sent: false };
function mount(extra = {}) { const rt = createRuntime(); const view = rt.mount(rt.load('src/components/calls/FileQaCheck.tsx').default, { ...props, ...extra }); return { rt, view }; }
function click(view: any) { view.act(() => one(view.tree, n => n.type === 'button' && text(n) === 'I’m done — check my file', 'check').props.onClick()); }
async function main() {
  const good = mount(); good.rt.replyWith(() => ({ status: 200, body: { report } }));
  click(good.view); await good.rt.settle();
  assert.deepEqual(good.rt.posts().map(p => p.body.op), ['check', 'story']);
  assert.equal(good.rt.posts()[1].body.fingerprint, 'saved');
  assert.match(text(good.view.tree), /Check the dates/); assert.match(text(good.view.tree), /does not approve or send/);
  good.view.rerender({ ...props, revision: '2' }); assert.doesNotMatch(text(good.view.tree), /Check the dates/);
  const waiting = mount(); waiting.rt.hold(); click(waiting.view); waiting.view.rerender({ ...props, claimId: 'other' });
  await waiting.rt.release({ status: 200, body: { report } }); assert.doesNotMatch(text(waiting.view.tree), /Check the dates/);
  assert.equal(waiting.rt.posts().length, 1, 'Old file response must not start a story check');
  const pending = mount({ unsaved: true }); assert.equal(one(pending.view.tree, n => n.type === 'button', 'button').props.disabled, true);
  click(pending.view); assert.equal(pending.rt.posts().length, 0);
  const failed = mount(); failed.rt.replyWith(() => ({ status: 503, body: { error: 'Audit did not save' } }));
  click(failed.view); await failed.rt.settle(); assert.match(text(failed.view.tree), /Audit did not save/); assert.doesNotMatch(text(failed.view.tree), /complete —/);
  const done = mount(); done.rt.replyWith(() => ({ status: 200, body: { report: { ...report, sent: true } } }));
  click(done.view); await done.rt.settle(); assert.equal(done.rt.posts().length, 1);
  assert.match(text(done.view.tree), /Already sent/);
  const gone = mount(); gone.rt.hold(); click(gone.view); gone.view.unmount();
  await gone.rt.release({ status: 200, body: { report } }); assert.equal(gone.rt.posts().length, 1);
  console.log('File QA component: sequential checks, revision/matter invalidation, unsaved, audit failure, sent and unmount scenarios passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
