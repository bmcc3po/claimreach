import assert from 'node:assert/strict';
import { mapLawRulerPresign, previewLawRulerPresignMerge, type PresignOptions, type PresignValue } from './lawruler-presign';
import { QUESTION_PATHS } from './mva-call/question-spine';
import { CallEngine, BODYQ } from './mva-call/engine';

const opts: PresignOptions = { asOfDate: '2026-09-28', slashDateOrder: 'MDY' };
const map = (p: Record<string, PresignValue>, o: Partial<PresignOptions> = {}) => mapLawRulerPresign(p, { ...opts, ...o });
const patch = (p: Record<string, PresignValue>) => previewLawRulerPresignMerge(map(p), {}).patch;
const warned = (m: ReturnType<typeof map>, code: string) => m.warnings.some(w => w.code === code);
let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log('ok', name); }

t('exact token aliases only; excluded/nested tabs and display names never become answers', () => {
  const m = map({ '<<Custom4121>>': 'Passenger', custom4127: 'Other Vehicle', Custom_4137: 'Yes', 'Who was at fault': 'Caller at fault (DQ)', PostSign: { Custom4140: 'Yes' }, DNU: 'Yes', Custom9999: 'Yes' });
  assert.deepEqual(previewLawRulerPresignMerge(m, {}).patch, { 'story.seat': 'Passenger', 'story.fault': 'Other driver' });
  assert.equal(m.evidence.length, 2);
});
t('absent/blank/unexpanded tokens do not fabricate answers', () => {
  const m = map({ Custom4121: null, Custom4124: ' ', Custom4130: '<<Custom4130>>', Custom4131: [], Custom4141: '{{Custom4141}}', Custom4123: ' {{ Summary }} ' });
  assert.deepEqual(m.evidence, []); assert.deepEqual(m.candidates, []);
});
t('both placeholder styles embedded in text remain evidence only, including bound contact names', () => {
  for (const placeholder of ['<<Custom4141>>', '{{Custom4141}}']) {
    const value = `Unexpanded: ${placeholder}`;
    const m = map({ Custom4141: value, Custom4130: value, Custom4125: value, Custom4126: 'NV', name_field: value }, { contactBindings: [{ sourceKey: 'name_field', column: 'claimant_name', sourceLabel: 'Full Name' }] });
    assert.deepEqual(m.candidates, []); assert.deepEqual(m.contacts, []); assert.ok(warned(m, 'unexpanded_placeholder'));
    assert.equal(m.evidence.find(e => e.token === 'Custom4141')?.raw, value);
  }
  const name = map({ name_field: '{{Full Name}}' }, { contactBindings: [{ sourceKey: 'name_field', column: 'claimant_name', sourceLabel: 'Full Name' }] });
  assert.deepEqual(name.evidence, []); assert.deepEqual(name.contacts, []);
});
t('alias collision holds answer and retains both raw originals', () => {
  const m = map({ Custom4121: 'Driver', '<<Custom4121>>': 'Passenger' });
  assert.equal(m.evidence.length, 2); assert.equal(m.candidates.length, 0); assert.ok(warned(m, 'conflicting_aliases'));
});
t('dates validate calendar, source convention, bounds and explicit preview clock', () => {
  assert.equal(patch({ Custom4124: '09/14/2026' })['story.date'], '2026-09-14');
  assert.equal(patch({ Custom4124: '2024-02-29' })['story.date'], '2024-02-29');
  for (const date of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-09-29', 'Today', '9/28/26', '2026-09-14T00:00:00Z', '1989-12-31']) assert.equal(map({ Custom4124: date }).candidates.length, 0, date);
  assert.equal(map({ Custom4124: '03/04/2026' }, { slashDateOrder: undefined }).candidates.length, 0);
  assert.equal(map({ Custom4124: '03/04/2026' }, { slashDateOrder: 'DMY' }).candidates[0].changes['story.date'], '2026-04-03');
  assert.throws(() => map({}, { asOfDate: '2026-02-30' }), /asOfDate/);
});
t('accident location is an atomic verified city/state pair; no mailing fallback or numeric guessing', () => {
  assert.deepEqual(patch({ Custom4125: 'Las Vegas', Custom4126: 'NEVADA' }), { 'story.city': 'Las Vegas, NV' });
  const invalidLocations: Record<string, PresignValue>[] = [{ Custom4125: 'Las Vegas', State: 'Nevada' }, { Custom4126: 'NV' }, { Custom4125: 'Las Vegas', Custom4126: '12' }, { Custom4125: 'Las Vegas, CA', Custom4126: 'NV' }];
  for (const p of invalidLocations) assert.equal(map(p).candidates.length, 0);
  assert.equal(map({ Custom4125: 'Las Vegas', Custom4126: '12' }, { stateValueMap: { '12': 'NEVADA' } }).candidates[0].changes['story.city'], 'Las Vegas, NV');
});
t('seat exact choices and Other explanation retain approved values', () => {
  for (const choice of ['Driver', 'Passenger', 'Pedestrian', 'Other']) assert.equal(patch({ Custom4121: choice })['story.seat'], choice);
  assert.deepEqual(patch({ Custom4121: 'Other', Custom4122: 'Cyclist' }), { 'story.seat': 'Other', 'story.seatOther': 'Cyclist' });
  assert.ok(warned(map({ Custom4121: 'Other' }), 'missing_other_explanation'));
  assert.equal(map({ Custom4121: 'driver' }).candidates.length, 0);
});
t('fault maps only equivalent choices and does not return disposition changes', () => {
  assert.deepEqual(patch({ Custom4127: 'Caller at fault (DQ)' }), { 'story.fault': 'Caller' });
  assert.deepEqual(patch({ Custom4127: 'Other Vehicle' }), { 'story.fault': 'Other driver' });
  for (const fault of ['Same Vehicle Driver (if PNC is passenger)', 'Other']) assert.equal(map({ Custom4127: fault, Custom4128: 'Original explanation' }).candidates.length, 0);
});
t('narratives remain verbatim, do not infer answers, and conflicting originals need merge review', () => {
  const narrative = '  Driver had no insurance. Neck pain.\nNo lawyer.  ';
  assert.deepEqual(patch({ Custom4141: narrative }), { 'story.text': narrative });
  assert.deepEqual(patch({ Custom4123: narrative }), { 'story.text': narrative });
  const m = map({ Custom4123: 'Summary A', Custom4141: 'Account B' });
  assert.equal(m.candidates.length, 0); assert.equal(m.evidence.length, 2); assert.ok(warned(m, 'narrative_conflict'));
  assert.equal(map({ Custom4141: 'A', '<<Custom4141>>': 'B', Custom4123: 'C' }).candidates.length, 0);
});
t('injury prose does not manufacture body chips or confirmation flags', () => {
  assert.deepEqual(patch({ Custom4129: 'Yes', Custom4130: 'Neck and left arm' }), { 'body.painNote': 'Neck and left arm' });
});
t('known checkbox arrays and exact singleton/JSON array encodings normalize safely', () => {
  for (const v of [['Primary Care Physician', 'Chiropractor', 'Urgent Care'], '["Primary Care Physician","Chiropractor","Urgent Care"]']) {
    assert.deepEqual(patch({ Custom4131: v }), { 'body.seen': ['Own doctor', 'Chiropractor', 'Urgent care'], 'body.done.seen': true });
  }
  assert.deepEqual(patch({ Custom4131: 'NO TREATMENT' }), { 'body.seen': ['Not yet'], 'body.done.seen': true });
  assert.deepEqual(patch({ Custom4131: ['Chiropractor', 'Chiropractor'] })['body.seen'], ['Chiropractor']);
});
t('ambiguous checkbox delimiters, unknown values, Hospital and contradictory no-treatment are held', () => {
  for (const v of ['Chiropractor,Urgent Care', 'Chiropractor;Urgent Care', 'Chiropractor|Urgent Care', '1', '[invalid]', '[]', 'Hospital', ['Hospital', 'Chiropractor'], ['NO TREATMENT', 'Chiropractor'], ['ER'], [true], { Chiropractor: true }]) {
    const m = map({ Custom4131: v as PresignValue }); assert.equal(m.candidates.length, 0, JSON.stringify(v)); assert.ok(m.warnings.length, JSON.stringify(v));
    assert.deepEqual(m.evidence[0].raw, v);
  }
});
t('treatment dates do not imply treatment type; invalid order and no-treatment conflict are held', () => {
  assert.equal(patch({ Custom4132: '2026-09-15' })['body.firstAt'], '2026-09-15');
  const invalidDates: Record<string, PresignValue>[] = [{ Custom4124: '2026-09-14', Custom4132: '2026-09-13' }, { Custom4132: '2026-09-16', Custom4133: '2026-09-15' }, { Custom4131: 'NO TREATMENT', Custom4132: '2026-09-15' }];
  for (const p of invalidDates) {
    const m = map(p); assert.ok(m.warnings.length); assert.ok(!m.candidates.some(c => ['first_treatment', 'last_treatment', 'treatment'].includes(c.id)));
  }
  assert.equal(map({ Custom4132: '1999-12-31' }).candidates.length, 0);
});
t('explicit UM/UIM and injury-only payment have exact destination enums', () => {
  assert.deepEqual(patch({ Custom4137: 'Yes', Custom4140: 'No' }), { 'body.uim': 'Yes', 'body.check': 'No' });
  assert.equal(patch({ Custom4140: 'Yes' })['body.check'], 'Yes, for injuries');
  for (const v of [true, false, 1, 0, 'true', 'N', 'Not sure']) assert.equal(map({ Custom4137: v }).candidates.length, 0);
  assert.equal(map({ Custom4137: 'No', Custom4138: 'PNC unsure' }).candidates.length, 0);
});
t('semantic mismatch facts remain evidence, never false answers or script-triggered actions', () => {
  const p = { Custom4120: 'No', Custom4129: 'No', Custom4134: 'Yes', Custom4135: 'Yes', Custom4136: 'Yes', Custom4138: 'Both no = DQ', Custom4139: 'Yes', Custom4143: 'Sent it', Custom4144: 'They signed', Custom4119: 'Opening', Custom4142: 'Transition' };
  const m = map(p); assert.equal(m.candidates.length, 0); assert.equal(m.evidence.length, Object.keys(p).length); assert.equal(m.warnings.length, Object.keys(p).length);
});
t('verified contact bindings produce metadata proposals only and never split legal names', () => {
  const contactBindings: PresignOptions['contactBindings'] = [
    { sourceKey: 'full_name_field', column: 'claimant_name', sourceLabel: 'Full Name' },
    { sourceKey: 'birth_field', column: 'dob', sourceLabel: 'Date of Birth' },
    { sourceKey: 'unit_field', column: 'mail_addr2', sourceLabel: 'Mailing Address2' },
    { sourceKey: 'state_field', column: 'mail_state', sourceLabel: 'State' },
  ];
  const m = map({ full_name_field: 'Dr. Mary Van Der Test Jr.', birth_field: '02/29/2000', unit_field: 'Unit #4', state_field: 'NEVADA', City: 'Unbound city' }, { contactBindings });
  assert.deepEqual(m.contacts.map(c => [c.column, c.value]), [['claimant_name', 'Dr. Mary Van Der Test Jr.'], ['dob', '2000-02-29'], ['mail_addr2', 'Unit #4'], ['mail_state', 'NV']]);
  assert.deepEqual(m.candidates, []); assert.equal(m.evidence.length, 4);
  const bad = map({ birth_field: '02/30/2000' }, { contactBindings }); assert.equal(bad.contacts.length, 0); assert.equal(bad.evidence[0].raw, '02/30/2000');
});
t('absent-only preview never changes inputs and preserves present blanks/false/arrays', () => {
  const m = map({ Custom4121: 'Driver', Custom4131: 'Chiropractor', Custom4137: 'Yes' });
  const original = JSON.stringify(m);
  const current = { story: { seat: null }, body: { uim: '', seen: [], done: { seen: false } } };
  assert.deepEqual(previewLawRulerPresignMerge(m, current).patch, {});
  assert.equal(JSON.stringify(m), original); assert.deepEqual(current.body.done, { seen: false });
  assert.equal(previewLawRulerPresignMerge(m, {}).decisions.filter(d => d.status === 'eligible').length, 3);
});
t('populated siblings block partial question merges; changed date never pairs with old when', () => {
  const m = map({ Custom4124: '2026-09-14' });
  assert.deepEqual(previewLawRulerPresignMerge(m, { story: { when: 'Yesterday' } }).patch, {});
  assert.deepEqual(previewLawRulerPresignMerge(m, { story: { date: '2026-09-15' } }).patch, {});
  assert.deepEqual(previewLawRulerPresignMerge(m, { story: { when: 'Pick a date' } }).patch, { 'story.date': '2026-09-14' });
});
t('explicit cleared path or parent wins; nonobject parent cannot be replaced', () => {
  const m = map({ Custom4137: 'Yes' });
  for (const clearedPaths of [['body.uim'], ['body']]) assert.deepEqual(previewLawRulerPresignMerge(m, {}, { clearedPaths, untouchedPaths: ['body.uim'] }).patch, {});
  for (const body of [null, false, '', []]) assert.deepEqual(previewLawRulerPresignMerge(m, { body }).patch, {});
});
t('only explicit untouched provenance permits blank defaults, never nonblank override', () => {
  const m = map({ Custom4137: 'Yes' });
  assert.deepEqual(previewLawRulerPresignMerge(m, { body: { uim: null } }, { untouchedPaths: ['body.uim'] }).patch, { 'body.uim': 'Yes' });
  for (const uim of ['No', false]) assert.deepEqual(previewLawRulerPresignMerge(m, { body: { uim } }, { untouchedPaths: ['body.uim'] }).patch, {});
});
t('same-value replay is a no-op with inspected leaf expectations', () => {
  const m = map({ Custom4137: 'Yes' });
  const p = previewLawRulerPresignMerge(m, { body: { uim: 'Yes' } });
  assert.deepEqual(p.patch, {}); assert.equal(p.decisions[0].status, 'same'); assert.deepEqual(p.decisions[0].expected['body.uim'], { exists: true, value: 'Yes' });
});
t('merge review checks treatment dates against preserved local accident and no-treatment answers', () => {
  const m = map({ Custom4132: '2026-09-14' });
  for (const current of [{ story: { date: '2026-09-15' } }, { body: { seen: ['Not yet'] } }]) assert.deepEqual(previewLawRulerPresignMerge(m, current).patch, {});
  assert.deepEqual(previewLawRulerPresignMerge(map({ Custom4124: '2026-09-20' }), { body: { firstAt: '2026-09-15' } }).patch, {});
});
t('all generated paths belong to actual question spine and load across all four engine views', () => {
  const m = map({ Custom4124: '2026-08-10', Custom4125: 'Las Vegas', Custom4126: 'NEVADA', Custom4121: 'Passenger', Custom4127: 'Other Vehicle', Custom4130: 'Original injury detail', Custom4131: '["Chiropractor"]', Custom4132: '2026-08-12', Custom4133: '2026-09-26', Custom4137: 'Yes', Custom4140: 'No', Custom4141: 'Original accident account' });
  const p = previewLawRulerPresignMerge(m, {}).patch;
  const saved: any = { phase: 'body' };
  for (const [path, value] of Object.entries(p)) {
    assert.ok(Object.values(QUESTION_PATHS).flat().includes(path));
    const keys = path.split('.'); let into = saved;
    for (const key of keys.slice(0, -1)) into = into[key] ||= {};
    into[keys.at(-1)!] = value;
  }
  let effects = 0;
  const api = { sendAgreement: () => effects++, sendPax: () => effects++, completeAgreement: () => effects++, resendLink: () => effects++, sendText: () => effects++, saveDispo: () => effects++, home: () => effects++, ask: () => effects++ };
  const e = new CallEngine({ callerName: 'Synthetic Tester', agentName: 'Test Agent', firmSpoken: 'Test Firm', textFrom: '', startedAt: 0, saved, reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { status: 'ready', configured: false, pax: {} } }, api);
  for (const view of ['guided', 'full', 'qa', 'form']) {
    e.setView(view); e.renderVals();
    assert.equal(e.state.story.city, 'Las Vegas, NV'); assert.equal(e.state.story.seat, 'Passenger');
    assert.deepEqual(e.state.body.seen, ['Chiropractor']); assert.equal(e.answered(e.state.body, BODYQ.find((q: any) => q.key === 'seen')), true);
    assert.equal(e.state.body.rep, null); assert.equal(e.state.body.stretch, null); assert.equal(e.state.body.painNote, 'Original injury detail');
    assert.equal(e.state.send.status, 'ready'); assert.equal(e.state.dispo.saved, false);
  }
  assert.equal(effects, 0);
});
console.log(`${passed} PRESIGN mapping tests passed`);
