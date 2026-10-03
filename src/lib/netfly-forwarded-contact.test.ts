import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import HandoffEvidence from '../components/netfly/HandoffEvidence';
import { approvedAgreementUrl, extractNetflyEmail, planHandoffFields } from './netfly-handoff';
import { NETFLY_FIELD_IDS } from './netfly-ontake';

const link = 'https://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001?locale=en-US';
// The production email's layout, using only fictional identifying details.
const sample = `Hi Team,
Here are the agent notes:
Accident Intake Note – Example Law
Client/Driver: Synthetic Jordan
Accident Date: 09/04/2026
Location: Kansas City, Missouri – Highway 70
Case #: TEST-240
Passengers: None
Airbags: Did not deploy
Accident Summary: The fictional car stopped accelerating and was rear-ended with its hazards on.
Insurance: Both parties are believed to be insured. The client now has the other driver's information.
Injuries & Treatment: Unable to fully pursue treatment.
Representation: Synthetic Jordan has not retained an attorney.
Next Steps: Ready for recommended next steps.

From: Marketer <sender@netflydigital.com>
To: Staff <intake@example.test>
Cc: Other Staff <other@example.test>
Date: Wed, 30 Sep 2026 01:26:01 +0500
Subject: New Signing! Synthetic Jordan
We've secured another client for you!
Contact Information:

Synthetic Jordan
client@example.test
+12025550146
The Signed Agreement:

${link}
Accident Details:
State: , City: Kansas city, Accident Type: Auto Accident
Agent Comments:
Note:
Our closer called the office.
Marketer
Administrative Manager
Office: 202.555.0188
sender@netflydigital.com`;

const result = extractNetflyEmail(sample);
assert.equal(result.fields.confirmed_name, 'Synthetic Jordan');
assert.equal(result.fields.confirmed_phone, '2025550146');
assert.equal(result.fields.confirmed_email, 'client@example.test');
assert.equal(result.fields.accident_date, '2026-09-04');
assert.equal(result.fields.accident_city, 'Kansas City');
assert.equal(result.fields.accident_state, 'MO');
assert.equal(result.fields.road, 'Highway 70');
assert.equal(result.fields.police_report, 'TEST-240');
assert.equal(result.fields.passengers, 'No');
assert.equal(result.fields.seen_doctor, undefined);
assert.equal(result.fields.other_lawyer_signed, undefined);
assert.ok(result.candidates.every(candidate => NETFLY_FIELD_IDS.has(candidate.id)));
assert.deepEqual(result.agreementLinks, [link]);
assert.equal(result.warnings.length, 1);
assert.match(result.warnings[0], /representation note/);
assert.deepEqual(planHandoffFields(sample, { confirmed_phone: '2025550111', confirmed_email: 'existing@example.test' }, ['confirmed_phone', 'confirmed_email']).fields, {});

const mismatch = extractNetflyEmail(sample.replace('\nSynthetic Jordan\nclient@', '\nDifferent Client\nclient@'));
assert.equal(mismatch.fields.confirmed_phone, undefined);
assert.equal(mismatch.fields.confirmed_email, undefined);
assert.deepEqual(mismatch.agreementLinks, []);
assert.match(mismatch.warnings[0], /different client/);
const withoutNotes = extractNetflyEmail(sample.slice(sample.indexOf('From:')));
assert.equal(withoutNotes.fields.confirmed_name, 'Synthetic Jordan');
assert.equal(withoutNotes.fields.confirmed_phone, '2025550146');
assert.equal(withoutNotes.fields.confirmed_email, 'client@example.test');
const noContact = extractNetflyEmail(sample.replace(/Contact Information:[\s\S]*?The Signed Agreement:/, 'The Signed Agreement:'));
assert.equal(noContact.fields.confirmed_phone, undefined);
assert.equal(noContact.fields.confirmed_email, undefined, 'never borrow sender or recipient contacts');
const multiple = extractNetflyEmail(sample.replace('+12025550146', '+12025550146\n+12025550147\nalternate@example.test'));
assert.equal(multiple.fields.confirmed_phone, undefined, 'ambiguous contact needs review');
assert.equal(multiple.fields.confirmed_email, undefined);
const html = extractNetflyEmail(sample.replace(link, `<a href="${link}">View agreement</a>`).split('\n').map(line => `<p>${line}</p>`).join(''));
assert.deepEqual(html.agreementLinks, [link]);
assert.equal(html.fields.confirmed_email, 'client@example.test');
const secondLink = link.replace('000000000001', '000000000002');
assert.deepEqual(extractNetflyEmail(sample + `\nContact Information:\nDifferent Client\nThe Signed Agreement:\n${secondLink}`).agreementLinks, [link]);
for (const bad of ['javascript:alert(1)', 'http://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001', link.replace('go.easyclaimcenter.com', 'go.easyclaimcenter.com.attacker.test'), link.replace('https://', 'https://user:password@'), link + '&redirect=https://attacker.test']) assert.equal(approvedAgreementUrl(bad), null);
const view = renderToStaticMarkup(createElement(HandoffEvidence, { note: sample }));
assert.ok(view.includes('Open NETFLY agreement'));
assert.ok(view.includes('Import signed PDF from email'));
assert.ok(view.includes('no-referrer'));
assert.ok(view.includes('representation note'));
assert.ok(!renderToStaticMarkup(createElement(HandoffEvidence, { note: sample, hasPdf: true })).includes('Download PDF'));
console.log('NETFLY forwarded contact blocks, agreement evidence, conflicting notes and preserved answers passed');
