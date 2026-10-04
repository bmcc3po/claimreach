// Offline only: actual React renderers and engine callbacks, no network or records.
// Run with tsx src/components/calls/intake-parity.test.tsx
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CallEngine, type CallProps } from '../../lib/mva-call/engine';
import { QUESTION_ORDER, questionPhase } from '../../lib/mva-call/question-spine';
import { sectionOf } from '../../lib/mva-call/intake';
import { INTAKE_STEPS, savedCallView } from '../../lib/mva-call/step-layout';
import { openLine } from './scripts';
import CallView from './CallView';
import PostCallReview from './PostCallReview';

// tsx honors the app's preserve JSX setting with the classic transform.
(globalThis as any).React = React;
const api = { sendAgreement() {}, sendPax() {}, completeAgreement() {}, resendLink() {}, sendText() {}, saveDispo() {}, home() {}, ask() {} };
const isoAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function make() {
  const props: CallProps = { callerName: 'Synthetic Caller', callerPhone: '2025550100', callerEmail: 'caller@example.invalid', agentName: 'Test Agent', firmSpoken: 'Synthetic Firm', textFrom: '2025550101', startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: true, status: 'ready', pax: {} } };
  const e = new CallEngine(props, api);
  e.setState({ phase: 'story', story: { ...e.state.story, city: 'Las Vegas, NV', when: 'Pick a date', date: isoAgo(120), seat: 'Other', seatOther: 'Bicycle', fault: 'Caller', police: 'Came out' }, body: { ...e.state.body, pain: ['Neck'], done: { pain: true, seen: true }, painNote: 'Synthetic pain detail', seen: ['ER'], providers: ['Synthetic clinic'], firstAt: isoAgo(119), lastAt: isoAgo(50), stretch: 'Yes', willing: 'No', coverage: 'Full coverage', rep: 'Yes', repUnhappy: "The PNC says they're unhappy with them", repKind: 'Fender bender, low limits' } });
  e.renderVals().addPerson();
  e.setPerson(0, 'name', 'Synthetic Passenger'); e.setPerson(0, 'age', 'Adult'); e.setPerson(0, 'hurt', 'Yes'); e.setPerson(0, 'rel', 'Friend'); e.setPerson(0, 'wantsRep', 'Yes');
  return e;
}
const modes = ['guided', 'full', 'chore', 'form', 'steps'];
function render(e: CallEngine, mode: string, id?: string) {
  e.setView(mode);
  if (id) { e.setFi({ sec: sectionOf(id), cq: id, edit: id, target: id }); if (mode === 'guided') e.go(questionPhase(id)); }
  const v = { ...e.renderVals(), leadId: 'synthetic', saveText: 'Saved', ssnRequireFull: false };
  return renderToStaticMarkup(<CallView v={v} />);
}
function question(html: string, id: string) {
  const at = html.indexOf(`data-question-id="${id}"`);
  assert.ok(at >= 0, `${id} rendered`);
  const start = html.lastIndexOf('<div', at);
  const tags = /<\/?div\b[^>]*>/g; tags.lastIndex = start;
  let depth = 0; let tag: RegExpExecArray | null;
  while ((tag = tags.exec(html))) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`Unclosed question ${id}`);
}
const text = (html: string) => html.replace(/<button[^>]*class="fi-q-done"[^>]*>Done<\/button>/g, '').replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/✓/g, '').replace(/\s+/g, ' ').trim();
const fields = (html: string) => Array.from(html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)).map(m => m[0]).filter(tag => /aria-label=/.test(tag)).map(tag => ({ label: tag.match(/aria-label="([^"]*)"/)?.[1], type: tag.match(/type="([^"]*)"/)?.[1] || 'text', value: tag.match(/value="([^"]*)"/)?.[1] || '' }));
let passed = 0;
function test(name: string, body: () => void) { body(); console.log('ok', name); passed++; }

test('post-call review shows the same editable answers and missing links without call scripts', () => {
  const e = make(); e.setView('chore');
  e.renderVals().fi.sections[0].questions[0].c.field.set({ target: { value: 'Rear ended at a stoplight.' } });
  const v = { ...e.renderVals(), leadNo: 'SYN-1', identityStatus: '', f: e.renderVals().f };
  const html = renderToStaticMarkup(<PostCallReview v={v} />);
  assert.ok(html.includes('Rear ended at a stoplight.') && html.includes('Accident story notes'));
  assert.ok(html.includes('Show missing answers') && html.includes('Next: review PDFs &amp; send →'));
  assert.ok(!html.includes('Say it with') && !html.includes('Tell me what happened.') && !html.includes('Stay on the line'));
});

test('every applicable question renders the same text, options, child fields and requirements in all actual call views', () => {
  const e = make();
  const ids = e.renderVals().fi.sections.flatMap((s: any) => s.questions.map((q: any) => q.id));
  assert.ok(ids.includes('providers') && ids.includes('report') && ids.includes('carrier') && ids.includes('car') && ids.includes('notes'));
  for (const id of ids) {
    const variants = modes.map(mode => question(render(e, mode, id), id));
    for (let i = 1; i < variants.length; i++) {
      assert.equal(text(variants[i]), text(variants[0]), `${id}: ${modes[i]} question text`);
      assert.deepEqual(fields(variants[i]), fields(variants[0]), `${id}: ${modes[i]} fields`);
      assert.equal(variants[i].match(/data-question-required="([^"]*)"/)?.[1], variants[0].match(/data-question-required="([^"]*)"/)?.[1]);
    }
  }
});

test('representation followups, good-case condition and send gate agree in every view', () => {
  const e = make();
  for (const mode of modes) {
    const html = text(question(render(e, mode, 'rep'), 'rep'));
    assert.ok(html.includes("The PNC says they're unhappy with them") && html.includes('Good case') && html.includes('Fender bender, low limits') && html.includes('The firm charges these back.'));
    assert.ok(e.renderVals().sendWarnText.includes('Only a good case'));
  }
  e.set('body', 'repKind', 'Good case');
  for (const mode of modes) assert.ok(!text(question(render(e, mode, 'rep'), 'rep')).includes('The firm charges these back.'));
  e.set('body', 'repUnhappy', null);
  for (const mode of modes) assert.ok(!text(question(render(e, mode, 'rep'), 'rep')).includes('Fender bender, low limits'));
});

test('passenger question stays early; saved details appear only after caller signature in every view', () => {
  const e = make();
  const before = JSON.stringify(e.persistable().car);
  for (const mode of modes) {
    e.setState({ phase: 'car' });
    const early = question(render(e, mode, 'people'), 'people');
    assert.match(text(early), /Who else was in the car with you/);
    assert.match(text(early), /Yes — details later/);
    assert.match(early, /Passenger&#x27;s name/);
    assert.match(text(early), /circle back to Synthetic Passenger/);
    assert.doesNotMatch(early, /Their own cell|Their own email|Relationship|Wants representation|date of birth/);
    e.jumpTo('file');
    assert.doesNotMatch(render(e, mode), /aria-label="Passenger details and agreements"/);
  }
  assert.equal(JSON.stringify(e.persistable().car), before, 'hidden fields keep saved answers');
  e.setState({ send: { ...e.state.send, status: 'signed' } });
  const followup = (mode: string) => { e.jumpTo('file'); return render(e, mode); };
  for (const mode of modes) {
    const html = followup(mode);
    assert.match(html, /aria-label="Passenger details and agreements"/);
    for (const value of ['Relationship', 'Their own cell', 'Their own email', 'Wants representation', 'Willing to treat', 'Home address']) assert.ok(text(html).includes(value), mode + ': ' + value);
    assert.equal((html.match(/aria-label="Passenger&#x27;s name"/g) || []).length, 1);
  }
  e.setPerson(0, 'age', 'Under 18');
  for (const mode of modes) {
    const html = followup(mode);
    assert.ok(!text(html).includes('Their own email')); assert.ok(text(html).includes('parent or guardian'));
  }
  e.setPerson(0, 'hurt', 'No');
  for (const mode of modes) assert.ok(!text(followup(mode)).includes('Wants representation'));
});

test('name-only passenger survives reopen, never implies consent, and returns after caller signing', () => {
  const e = make(); e.setState({ car: { justMe: false, people: [] } });
  const q = () => e.renderVals().fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === 'people');
  q().c.others.pick();
  assert.equal(e.state.car.people.length, 1, 'yes immediately offers a name field');
  q().c.people[0].setName({ target: { value: 'Billy Bob' } });
  assert.equal(q().answered, true);
  assert.equal(e.state.car.people[0].hurt, null);
  assert.equal(e.state.car.people[0].wantsRep, null);
  assert.equal(e.renderVals().paxSend.length, 0, 'a name does not authorize an agreement');
  const saved = JSON.parse(JSON.stringify(e.persistable()));
  const fresh = new CallEngine({ ...e.props, esign: { ...e.props.esign, status: 'signed' }, saved }, api);
  fresh.jumpTo('file');
  for (const mode of modes) {
    const html = render(fresh, mode);
    assert.match(text(html), /You mentioned Billy Bob. Were they hurt, and would they like our help/);
    assert.match(html, /value="Billy Bob"/);
    assert.doesNotMatch(html, /Send Billy Bob&#x27;s agreement/);
  }
  assert.equal(fresh.state.car.people[0].pid, saved.car.people[0].pid);
  fresh.renderVals().people[0].hurts.find((o: any) => o.label === 'Yes').pick();
  fresh.renderVals().people[0].wantsReps.find((o: any) => o.label === 'Yes').pick();
  assert.match(render(fresh, 'steps'), /Send Billy Bob&#x27;s agreement/);
});

test('pain soreness script, notes, date validation and conditional omissions match', () => {
  const e = make();
  e.set('body', 'pain', ["Says they're fine"]);
  for (const mode of modes) {
    const html = text(question(render(e, mode, 'pain'), 'pain'));
    assert.ok(html.includes("I'm glad it wasn't worse")); assert.ok(!html.includes('Pain notes'));
  }
  e.set('body', 'coverage', 'No insurance'); e.set('body', 'seen', ['Not yet']);
  for (const mode of modes) {
    const html = render(e, mode, 'coverage');
    const ids = e.renderVals().fi.sections.flatMap((s: any) => s.questions.map((q: any) => q.id));
    assert.ok(!ids.includes('uim') && !ids.includes('firstAt') && !ids.includes('lastAt'));
    assert.ok(!html.includes('data-question-id="uim"'));
  }
});

test('changing view preserves the exact optional or branch question and all saved answers', () => {
  for (const id of ['providers', 'rep', 'people', 'carrier', 'notes', 'when']) {
    const e = make(); render(e, 'form', id);
    const answers = JSON.stringify({ story: e.persistable().story, body: { ...e.persistable().body, focus: null }, car: e.persistable().car, send: e.persistable().send, file: e.persistable().file });
    for (const mode of ['guided', 'full', 'chore', 'form', 'steps', 'guided']) {
      e.setView(mode); const v = e.renderVals();
      assert.equal(v.fi.target, id, `${id}: ${mode} target`);
      if (mode === 'guided') assert.equal(v.fi.guided.q.id, id);
      assert.equal(JSON.stringify({ story: e.persistable().story, body: { ...e.persistable().body, focus: null }, car: e.persistable().car, send: e.persistable().send, file: e.persistable().file }), answers);
    }
  }
});

test('Guided Next visits optional controls in the same order as the other views and never advances an invisible File step in Simple form', () => {
  const e = make(); e.setView('guided'); e.go('story'); e.setFi({ cq: 'notes' });
  const visited: string[] = [];
  for (let i = 0; i < 40 && e.state.phase !== 'money'; i++) { const v = e.renderVals(); assert.ok(v.fi.guided); visited.push(v.fi.guided.q.id); v.next.go(); }
  const live = QUESTION_ORDER.filter(id => e.fiInfo(id).applies);
  assert.deepEqual(visited, live);
  e.setState({ phase: 'send', send: { ...e.state.send, status: 'signed' } });
  const html = render(e, 'form');
  assert.ok(html.includes('Finish the agreement') && html.includes('Date of birth'));
  assert.ok(!html.includes('Next: Finish the agreement'));
});

test('Another number selector exists in all views and survives record rebind', () => {
  for (const mode of modes) {
    const e = make(); e.go('send');
    assert.ok(text(render(e, mode)).includes('Another number'), `${mode} has alternate recipient selector`);
    e.renderVals().textTo[1].pick(); e.renderVals().f.phone.set({ target: { value: '2025550199' } });
    assert.equal(e.persistable().send.toOther, true);
    const saved = e.persistable();
    const fresh = new CallEngine({ ...e.props, saved }, api);
    assert.equal(fresh.state.send.phone, '2025550199'); assert.equal(fresh.state.send.toOther, true);
    assert.ok(render(fresh, mode).includes('value="2025550199"'));
  }
});

test('custom insurer, providers, pain notes and passenger child callbacks retain original save paths', () => {
  const e = make();
  const q = (id: string) => e.renderVals().fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === id);
  q('carrier').c.query.set({ target: { value: 'Synthetic insurance' } }); q('carrier').c.opts.find((o: any) => o.label.startsWith('Use ')).pick();
  q('providers').c.draft.set({ target: { value: 'Second synthetic clinic' } }); q('providers').c.add();
  q('pain').c.note.set({ target: { value: 'New synthetic note' } });
  q('people').c.people[0].email.set({ target: { value: 'passenger@example.invalid' } });
  q('people').c.people[0].wantsReps.find((o: any) => o.label === 'No').pick();
  const saved = e.persistable();
  assert.equal(saved.file.carrier, 'Synthetic insurance'); assert.equal(saved.body.providers[1], 'Second synthetic clinic'); assert.equal(saved.body.painNote, 'New synthetic note');
  assert.equal(saved.car.people[0].email, 'passenger@example.invalid'); assert.equal(saved.car.people[0].wantsRep, 'No'); assert.ok(!('ssn' in saved.file));
  for (const mode of modes) assert.ok(text(question(render(e, mode, 'carrier'), 'carrier')).includes('Synthetic insurance'), `${mode}: saved custom insurer remains visible`);
});

test('validated question position restores on a second device without accepting unknown or mismatched identifiers', () => {
  const e = make(); render(e, 'form', 'providers');
  const saved = JSON.parse(JSON.stringify(e.persistable()));
  assert.equal(saved.atQuestion, 'providers');
  for (const mode of modes) {
    const fresh = new CallEngine({ ...e.props, saved }, api); fresh.setView(mode);
    assert.equal(fresh.renderVals().fi.target, 'providers');
    if (mode === 'guided') assert.equal(fresh.renderVals().fi.guided.q.id, 'providers');
  }
  for (const atQuestion of ['unknown-field', 'people']) {
    const fresh = new CallEngine({ ...e.props, saved: { ...saved, atQuestion } }, api);
    assert.equal(fresh.state.fi.cq, null);
  }
});

test('invalid visit date has the same validation message and unanswered state everywhere', () => {
  const e = make();
  e.set('body', 'firstAt', isoAgo(140));
  const q = e.renderVals().fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === 'firstAt');
  assert.ok(q.c.date.why); assert.equal(q.answered, false);
  for (const mode of modes) assert.ok(text(question(render(e, mode, 'firstAt'), 'firstAt')).includes(q.c.date.why));
});

test('five stages cover the canonical spine exactly once and render only the active groups', () => {
  assert.deepEqual([...INTAKE_STEPS.flatMap(step => step.questions)].sort(), [...QUESTION_ORDER].sort());
  const e = make(); e.setView('steps');
  const rendered: string[] = [];
  for (let index = 0; index < INTAKE_STEPS.length; index++) {
    e.renderVals().fi.step.items[index].go();
    const html = render(e, 'steps');
    const ids = Array.from(html.matchAll(/data-question-id="([^"]+)"/g), match => match[1]);
    const expected = INTAKE_STEPS[index].questions.filter(id => e.fiInfo(id).applies);
    assert.deepEqual(ids, expected, `stage ${index + 1} only renders its applicable questions`);
    rendered.push(...ids);
    assert.ok(html.includes(`Step ${index + 1} of 5`));
    assert.ok(!html.includes('aria-label="Call steps"'), 'no obsolete eight-phase navigation');
    assert.ok(!html.includes('Next section:'), 'no ungrouped section next action');
    if (index === 0) assert.ok(text(html).includes(openLine(e.callerFirst(), 'Test', 'Synthetic Firm')));
    if (index === 3) assert.ok(html.includes("Their details and agreement come after your caller’s signature is verified"));
    if (index === 4) assert.ok(html.includes('DOB and SSN are optional before sending') && html.includes('Send the agreement'));
  }
  assert.deepEqual([...rendered].sort(), QUESTION_ORDER.filter(id => e.fiInfo(id).applies).sort());
});

test('stage back/next, view switching and device restore keep answers and split vehicle/passenger positions', () => {
  const e = make(); e.setView('steps');
  e.renderVals().fi.step.items[0].go();
  const answers = () => JSON.stringify({ story: e.persistable().story, body: e.persistable().body, car: e.persistable().car, file: e.persistable().file, send: e.persistable().send });
  const original = answers();
  for (let index = 0; index < 4; index++) { assert.equal(e.renderVals().fi.step.index, index); e.renderVals().fi.step.next.go(); }
  for (let index = 4; index > 0; index--) { assert.equal(e.renderVals().fi.step.index, index); e.renderVals().fi.step.back.go(); }
  assert.equal(answers(), original);
  assert.equal(e.renderVals().fi.step.back, null);
  for (const [id, expected] of [['car', 2], ['people', 3], ['notes', 0]] as const) {
    render(e, 'steps', id);
    for (const mode of ['form', 'chore', 'steps']) e.setView(mode);
    assert.equal(e.renderVals().fi.step.index, expected);
    const fresh = new CallEngine({ ...e.props, saved: e.persistable() }, api);
    fresh.setView('steps');
    assert.equal(fresh.renderVals().fi.step.index, expected, `${id} restores to its screen`);
  }
  e.renderVals().fi.step.items[4].go();
  e.setView('form'); e.setView('steps');
  assert.equal(e.renderVals().fi.step.id, 'retainer', 'stale passenger question never hides Retainer');
  assert.equal(savedCallView('steps'), 'steps'); assert.equal(savedCallView('form'), 'form');
  assert.equal(savedCallView('guided'), 'chore'); assert.equal(savedCallView(null), 'chore');
});

test('step layout keeps notes, missing-question jumps and signed passenger documents accessible', () => {
  const e = make(); e.setView('steps');
  e.renderVals().fi.step.items[3].go();
  e.renderVals().fi.quick.draft.set({ target: { value: 'Synthetic quick note from passenger stage' } });
  e.renderVals().fi.quick.save();
  assert.match(e.persistable().story.text, /Synthetic quick note from passenger stage/);
  e.renderVals().fi.missing.find((item: any) => item.id === 'check').go();
  assert.equal(e.renderVals().fi.step.index, 2);
  assert.ok(render(e, 'steps').includes('data-question-id="check"'));
  e.renderVals().fi.step.items[4].go();
  e.setState({ send: { ...e.state.send, status: 'signed' } });
  const v = { ...e.renderVals(), openFile() {}, ssnRequireFull: false };
  const html = renderToStaticMarkup(<CallView v={v} />);
  assert.ok(html.includes('Next: review the signed retainer'));
  assert.ok(html.includes('Refresh signed copy'));
  assert.ok(html.includes('Synthetic Passenger'));
  assert.ok(html.includes('Walk') || html.includes('Before you hang up, say'));
});

console.log(`${passed} intake rendering parity tests passed`);
