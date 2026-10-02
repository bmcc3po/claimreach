import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { extractNetflyEmail, parseNetflyHandoff, planHandoffFields, emailDate } from './netfly-handoff';
import { verifyResendWebhook, receiveAllowed, receivedPdf, cappedBytes, type ReceivedEmail } from './resend-inbound';
import { NETFLY_FIELD_IDS } from './netfly-ontake';
import { saveNetflyHandoff } from './netfly-handoff-save';
import { FakeDb } from './test-fake-db';

const sample = `From: Marketer <sender@netflydigital.com>
To: Intake <staff@innovativeintake.com>
Subject: New Signing! Synthetic Client
Client/Driver: Synthetic Client
Accident Date: 09/04/2026
Location: Kansas City, Missouri – Highway 70
Case #: SYN-240
Passengers: None
Accident Summary: The car stalled and was rear-ended.
More details on a second line.
Insurance: Both parties are believed to be insured.
Injuries & Treatment: Has pain; unable to fully pursue treatment.
Representation: No attorney retained.
Next Steps: Ready to follow recommendations.
Thanks,
Marketer
Phone: 2025550188
Email: sender@netflydigital.com`;

async function main() {
  const result = extractNetflyEmail(sample);
  assert.equal(result.fields.confirmed_name, 'Synthetic Client');
  assert.equal(result.fields.confirmed_phone, undefined, 'never copy sender phone');
  assert.equal(result.fields.confirmed_email, undefined, 'never copy sender or recipients');
  assert.equal(result.fields.accident_date, '2026-09-04');
  assert.equal(result.fields.accident_city, 'Kansas City');
  assert.equal(result.fields.accident_state, 'MO');
  assert.equal(result.fields.road, 'Highway 70');
  assert.equal(result.fields.passengers, 'No');
  assert.equal(result.fields.seen_doctor, undefined, 'limited treatment does not mean none');
  assert.equal(result.fields.fault, undefined, 'no automatic legal conclusions');
  assert.equal(result.fields.other_lawyer_signed, undefined);
  assert.ok(result.candidates.every(c => NETFLY_FIELD_IDS.has(c.id)), 'only canonical question IDs');
  assert.equal(result.fields.incident_story, 'The car stalled and was rear-ended. More details on a second line.');
  assert.equal(result.rows.at(-1)?.value, 'Ready to follow recommendations.', 'drop signatures');
  const markdown = extractNetflyEmail('**Client/Driver:** Synthetic Client\n**Client Phone:** +1 (202) 555-0123\n**Client Email:** client@example.test\n**Accident Date:** 09/04/2026');
  assert.equal(markdown.fields.confirmed_phone, '2025550123');
  assert.equal(markdown.fields.confirmed_email, 'client@example.test');
  assert.equal(extractNetflyEmail('<div><b>Client/Driver:</b> Synthetic Client</div><p>Accident Date: 09/04/2026</p>').fields.accident_date, '2026-09-04');
  assert.equal(parseNetflyHandoff('Client/Driver: New Name\nClient/Driver: Quoted Old Name')[0].value, 'New Name');
  assert.equal(emailDate('02/31/2026'), null);
  assert.equal(emailDate('09/04/26'), null, 'no guessed century');
  assert.deepEqual(planHandoffFields(sample, { police_report: 'AGENT-1', accident_date_unavailable: 'Not available yet' }, ['police_report', 'accident_date', 'passengers']).fields, { passengers: 'No' });

  const secret = 'whsec_' + Buffer.from('synthetic signing secret only').toString('base64');
  const raw = JSON.stringify({ type: 'email.received', data: { email_id: 'synthetic' } });
  const now = 1790990000000, stamp = String(now / 1000);
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`msg_test.${stamp}.${raw}`).digest('base64');
  const headers = new Headers({ 'svix-id': 'msg_test', 'svix-timestamp': stamp, 'svix-signature': `v1,${signature}` });
  assert.equal(await verifyResendWebhook(raw, headers, secret, now), true);
  assert.equal(await verifyResendWebhook(raw + ' ', headers, secret, now), false);
  assert.equal(await verifyResendWebhook(raw, headers, secret, now + 301000), false);
  assert.equal(await verifyResendWebhook(raw, headers, secret, now - 301000), false);
  assert.equal(await verifyResendWebhook(raw, new Headers(), secret, now), false);
  const email = { from: 'NETFLY <sender@netflydigital.com>', to: ['netfly@example.resend.app'], authentication: { dmarc: 'pass' } } as ReceivedEmail;
  assert.equal(receiveAllowed(email, 'netfly@example.resend.app', ['netflydigital.com']), null);
  assert.equal(receiveAllowed({ ...email, from: 'sender@netflydigital.com.attacker.test' }, 'netfly@example.resend.app', ['netflydigital.com']), 'unapproved_sender');
  assert.equal(receiveAllowed({ ...email, authentication: {} }, 'netfly@example.resend.app', ['netflydigital.com']), 'sender_authentication_unverified');
  assert.equal(receiveAllowed(email, 'different@example.resend.app', ['netflydigital.com']), 'different_recipient');
  assert.equal(receiveAllowed({ ...email, to: ['netfly@innovativeintake.com'], received_for: ['netfly@example.resend.app'] }, 'netfly@example.resend.app', ['netflydigital.com']), null);
  const payload = '%PDF-1.7\n' + 'synthetic '.repeat(20) + '\n%%EOF';
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: any, init?: RequestInit) => { assert.equal(init?.cache, undefined, "Cloudflare native fetch rejects Request.cache"); calls.push({ url: String(url), init });
    return String(url).startsWith('https://api.resend.com/') ? Response.json({ download_url: 'https://cdn.resend.app/receiving/email/attachments/pdf?signature=test', size: payload.length }) : new Response(payload); }) as typeof fetch;
  assert.equal((await receivedPdf('email-1', 'pdf-1', 'test-key', fetcher)).length, payload.length);
  assert.equal((calls[1].init?.headers as any)?.Authorization, undefined, 'API credential never goes to attachment CDN');
  assert.equal(calls[1].init?.redirect, 'error');
  let fetchCount = 0;
  await assert.rejects(() => receivedPdf('email-1', 'pdf-1', 'test-key', (async () => { fetchCount++; return Response.json({ download_url: 'https://127.0.0.1/private' }); }) as typeof fetch), /host/);
  assert.equal(fetchCount, 1, 'email cannot send a request to arbitrary hosts');
  await assert.rejects(() => cappedBytes(new Response('12345').body, 4), /size limit/);

  const db = new FakeDb({ leads: [{ id: 'lead', firm_id: 'firm', campaign_id: 'camp', phone: null, email: 'agent@example.test', claimant_name: 'Synthetic Client', archived_at: null }],
    claims: [{ id: 'claim', firm_id: 'firm', campaign_id: 'camp', lead_id: 'lead', updated_at: '2026-10-01T00:00:00Z', answers: { unrelated: { keep: true }, netfly_secondary: { fields: { police_report: 'AGENT-1' } } } }] });
  const scope = { firmId: 'firm', campaignId: 'camp', leadId: 'lead', claimId: 'claim' };
  const note = sample + '\nClient Phone: 2025550123\nClient Email: incoming@example.test';
  const selected = extractNetflyEmail(note).candidates.map(c => c.id);
  const saved = await saveNetflyHandoff(db, scope, note, selected, { by: 'test', by_name: 'Test', channel: 'staff_entered' });
  assert.ok(saved.applied.includes('confirmed_phone'));
  assert.equal(db.tables.leads[0].phone, '2025550123');
  assert.equal(db.tables.leads[0].email, 'agent@example.test');
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.police_report, 'AGENT-1');
  assert.deepEqual(db.tables.claims[0].answers.unrelated, { keep: true });
  assert.equal(db.tables.claims[0].answers.netfly_secondary.imported_fields.confirmed_phone.confirmed, false);
  await saveNetflyHandoff(db, scope, note, selected, { by: 'test', by_name: 'Test', channel: 'staff_entered' });
  assert.equal(db.tables.claims[0].answers.netfly_secondary.handoffs.length, 1);
  await assert.rejects(() => saveNetflyHandoff(db, { ...scope, firmId: 'other' }, note, selected, { by: 'x', by_name: 'x', channel: 'email' }), /contact/);
  db.failOn = op => op.table === 'claims' && op.kind === 'update' ? 'simulated outage' : null;
  await assert.rejects(() => saveNetflyHandoff(db, scope, note + '\nNew detail', selected, { by: 'x', by_name: 'x', channel: 'email' }), /could not be saved/);
  console.log('NETFLY email parser, signature, recipient, PDF and blank-field import tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

