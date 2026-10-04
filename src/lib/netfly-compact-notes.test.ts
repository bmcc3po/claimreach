import assert from 'node:assert/strict';
import { compactNotesRequest, expandCompactNotes } from './netfly-compact-notes';

const notes = 'Went to TEST Clinic on 09/27/2026. No ambulance. No passengers. Already in care.';
const req = compactNotesRequest(notes, {});
const index = (id: string) => req.fields.findIndex(f => f.id === id);
const choice = (id: string, value: string) => req.fields[index(id)].choices!.indexOf(value);
const raw = [
  [index('seen_doctor'), choice('seen_doctor', 'Yes'), 0],
  [index('first_provider'), 'TEST Clinic', 0],
  [index('first_visit'), '2026-09-27', 0],
  [index('ambulance'), choice('ambulance', 'No'), 1],
  [index('passengers'), choice('passengers', 'No'), 2],
];
const rows = expandCompactNotes(raw, req, notes, {});
assert.equal(rows.length, 5);
assert.equal(rows[0].evidence, req.sources[0]);
assert.equal(rows[3].value, 'No');
assert.ok(rows.every(r => notes.includes(r.evidence)));
assert.deepEqual(expandCompactNotes(raw, req, notes, {seen_doctor:'No'}).map(r=>r.id), ['passengers'], 'current parent and existing answers remain authoritative');
for (const bad of [null, {}, [[-1,'bad',0]], [[999,'bad',0]], [[index('road'),'bad',999]], [[index('road'),'bad',-1]], [[index('road'),'bad',1.5]], [[index('passengers'),999,0]], [[index('passengers'),'No',0]], [[index('first_visit'),null,0]], [[index('first_visit'),'2026-02-30',0]], [[index('road'),'bad',0,'extra']]]) {
  assert.deepEqual(expandCompactNotes(bad,req,notes,{}),[]);
}
assert.deepEqual(expandCompactNotes([[index('care_today_setting'),1,0]],req,notes,{care_today:'Already in care'}),[]);
assert.equal(expandCompactNotes([[index('incident_story'),null,0]],req,notes,{})[0].value,req.sources[0]);
assert.equal(expandCompactNotes(raw,req,'A changed note.',{}).length,0, 'indexes cannot manufacture source evidence');
assert.equal(expandCompactNotes([...raw,raw[0]],req,notes,{}).length,5);
const filtered=compactNotesRequest(notes,{seen_doctor:'Yes',first_provider:'Saved clinic',police_report_unavailable:'Not available yet',dob:'private'});
assert.ok(!filtered.fields.some(f=>['first_provider','seen_doctor','police_report','dob','ssn','fault','confirmed_phone'].includes(f.id)));
assert.ok(!JSON.stringify(filtered.payload).includes('private'));
assert.equal(filtered.payload.existing.seen_doctor,'Yes');
console.log('NETFLY compact notes: source indexes, choices, dates, protected fields, dependencies, replay and malformed output passed');
