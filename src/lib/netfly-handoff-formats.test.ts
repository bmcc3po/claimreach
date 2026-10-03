import assert from 'node:assert/strict';
import { extractNetflyEmail, handoffFirmMatches, handoffFirmNames, parseNetflyHandoff } from './netfly-handoff';
import { assertHandoffFirm, saveNetflyHandoff } from './netfly-handoff-save';
import { FakeDb } from './test-fake-db';

const note = `Accident Intake Note – Example Law
Client: Synthetic Client
City: Anchorage, AK
Date of Accident: 09/18/2026
Accident Type: Auto Accident (Hit-and-Run)
At Fault: No
Representation: No prior representation
Accident Summary
The other vehicle struck the driver's door and left the scene.
Witnesses gave statements. A police report was filed.
Injuries/Treatment
EMS transported the client to Example Hospital in Anchorage.
Representation
The client has now signed with Example Law.`;

async function main() {
  const result = extractNetflyEmail(note);
  assert.equal(result.fields.confirmed_name, 'Synthetic Client');
  assert.equal(result.fields.accident_date, '2026-09-18');
  assert.equal(result.fields.accident_city, 'Anchorage');
  assert.equal(result.fields.accident_state, 'AK');
  assert.equal(result.fields.incident_story, "The other vehicle struck the driver's door and left the scene. Witnesses gave statements. A police report was filed.");
  assert.match(result.rows.find(row => row.label === 'Injuries & Treatment')!.value, /^EMS transported/);
  assert.equal(result.fields.fault, undefined, 'marketer conclusions are source evidence, not approved answers');
  assert.equal(result.fields.police_report, undefined, 'a report being filed does not supply a report number');
  assert.equal(result.fields.seen_doctor, undefined, 'prose requires agent review, not a guessed answer');
  const enRoute = extractNetflyEmail(`Client: Synthetic Second\nDate of Accident: 10/01/2026\nCity: Austin, Texas\nAccident Summary\nStopped in traffic.\nInjuries & Treatment\nOn her way to the hospital.\nAdditional Information\nWrist pain.`);
  assert.equal(enRoute.fields.seen_doctor, undefined, 'on the way does not mean treatment completed');
  assert.equal(enRoute.fields.incident_story, 'Stopped in traffic.');
  assert.equal(enRoute.rows.find(row => row.label === 'Injuries & Treatment')!.value, 'On her way to the hospital.');
  assert.equal(enRoute.rows.find(row => row.label === 'Additional Information')!.value, 'Wrist pain.');
  assert.equal(parseNetflyHandoff('Client: First Client\nAccident Summary\nFirst account.\nClient: Second Client\nCase #: SECOND').some(row => row.label === 'Case #'), false, 'never borrow missing fields from another client');
  assert.deepEqual(handoffFirmNames(note), ['Example Law']);
  assert.deepEqual(handoffFirmNames('Representation: Previously spoke with Another Law.'), [], 'a former lawyer is not a routing declaration');
  assert.deepEqual(handoffFirmNames('**Law Firm:** Example Law\nFirm: Another Law'), ['Example Law', 'Another Law']);
  const firm = { name: 'Example, Second & Third', slug: 'est' };
  for (const name of ['Example Law', 'Example Second and Third', 'EST']) assert.equal(handoffFirmMatches(name, firm), true);
  for (const name of ['Other Law FL', 'Exam Law', 'Example Other Law', 'Law Firm']) assert.equal(handoffFirmMatches(name, firm), false);
  const db = new FakeDb({ firms: [{ id: 'firm', ...firm }], leads: [], claims: [] });
  await assertHandoffFirm(db, 'firm', note);
  await assertHandoffFirm(db, 'firm', 'Client: Partial file without firm heading');
  await assert.rejects(() => assertHandoffFirm(db, 'firm', note + '\nFirm: Another Law'), /different or unrecognized/);
  await assert.rejects(() => assertHandoffFirm(db, 'other', note), /verify the receiving firm/);
  await assert.rejects(() => saveNetflyHandoff(db, { firmId: 'firm', campaignId: 'camp', leadId: 'lead', claimId: 'claim' },
    note.replace('Example Law', 'Other Law FL'), [], { by: 'test', by_name: 'Test', channel: 'staff_entered' }), /different or unrecognized/);
  assert.equal(db.tables.leads.length, 0); assert.equal(db.tables.claims.length, 0);
  console.log('NETFLY real-world headings, source boundaries, partial notes and firm matching passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
