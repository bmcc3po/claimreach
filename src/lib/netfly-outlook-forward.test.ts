import assert from 'node:assert/strict';
import { extractNetflyEmail, netflyContactNameKey, planHandoffFields } from './netfly-handoff';
import { netflyAgreementPdf } from './netfly-agreement-import';

const link = 'https://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001?locale=en-US';
// The observed Outlook/iPhone forwarding shape, with fictional client details.
const note = `Forwarding Agent
Office: 2025550188
Begin forwarded message:
From: Marketer <sender@netflydigital.com>
Subject: Re: New Signing - GA! Synthetic Gimenez
Hi Team,
Here are the agent notes:
Client: Synthetic Giménez
City: Lawrenceville, Georgia
Date of Accident: 09/26/2026
Accident Type: Auto accident — rear-ended
At Fault: No
Representation: No prior representation
Accident Summary
The fictional client was rear-ended while stopped. Both parties had insurance.
Injuries/Treatment
Back pain. Visited urgent care on the day of the accident.
From: NETFLY Signings <no-reply@example.test<mailto:no-reply@example.test>>
To: <office@example.test<mailto:office@example.test>>
Contact Information:
Synthetic Gimenez
client@example.test<mailto:client@example.test>
+12025550146
The Signed Agreement:
${link}<https://shared.outlook.example.test/link>
Accident Details:
Campaign State: GA , City: Lawrenceville, Accident Type: Auto Accident
Agent Comments:
Note:
Office: 2025550188`;

async function main() {
  const result = extractNetflyEmail(note);
  assert.equal(result.fields.confirmed_name, 'Synthetic Giménez');
  assert.equal(result.fields.confirmed_phone, '2025550146');
  assert.equal(result.fields.confirmed_email, 'client@example.test');
  assert.equal(result.fields.accident_date, '2026-09-26');
  assert.equal(result.fields.accident_city, 'Lawrenceville');
  assert.equal(result.fields.accident_state, 'GA');
  assert.match(result.fields.incident_story, /^The fictional client was rear-ended/);
  assert.match(result.fields.other_pain, /^Back pain/);
  assert.deepEqual(result.agreementLinks, [link]);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.fields.fault, undefined, 'a source note is not a legal conclusion');
  assert.deepEqual(planHandoffFields(note, { confirmed_phone: '2025550111' }, ['confirmed_phone']).fields, {});
  const mismatch = extractNetflyEmail(note.replace('\nSynthetic Gimenez\n', '\nSynthetic Gomez\n'));
  assert.equal(mismatch.fields.confirmed_phone, undefined); assert.equal(mismatch.fields.confirmed_email, undefined);
  assert.deepEqual(mismatch.agreementLinks, []);
  assert.notEqual(netflyContactNameKey('Synthetic Gimenez'), netflyContactNameKey('Synthetic Gomez'));
  const conflictingMailto = extractNetflyEmail(note.replace('<mailto:client@example.test>', '<mailto:different@example.test>'));
  assert.equal(conflictingMailto.fields.confirmed_email, undefined, 'conflicting visible and linked emails are not guessed');
  const pdf = '%PDF-1.7\n' + 'NONBINDING SYNTHETIC '.repeat(20) + '\n%%EOF';
  let calls = 0;
  const fetcher = (async (url: any) => {
    calls++;
    if (String(url).includes('/download?')) return Response.json({ url: 'https://storage.googleapis.com/leadgen-proposals-estimates/location/location00001/documents/document00001/signed.pdf' });
    if (String(url).includes('/public?')) return Response.json({ document: { _id: 'document00001', locationId: 'location00001', status: 'completed',
      recipients: [{ role: 'signer', hasCompleted: true, firstName: 'Synthetic', lastName: 'Gimenez' }] } });
    return new Response(pdf);
  }) as typeof fetch;
  assert.ok((await netflyAgreementPdf(link, result.fields.confirmed_name, fetcher)).bytes.length);
  calls = 0;
  await assert.rejects(() => netflyAgreementPdf(link, 'Synthetic Gomez', fetcher), /different client/);
  assert.equal(calls, 1, 'a different signer prevents the PDF download');
  console.log('NETFLY Outlook/iPhone forward: accented name, contact, story, date, location, signed PDF and preserved answers passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
