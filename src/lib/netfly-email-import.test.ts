import assert from 'node:assert/strict';
import { FakeDb } from './test-fake-db';
import { importNetflyEmail, netflyEmailCampaign } from './netfly-email-import';
import { type ReceivedEmail } from './resend-inbound';

class EmailDb extends FakeDb {
  blobs = new Map<string, Uint8Array>();
  rpc = async () => ({ data: `TMP-${this.tables.leads.length + 1}`, error: null });
  storage = { from: (_bucket: string) => ({
    upload: async (path: string, data: Uint8Array) => {
      if (this.blobs.has(path)) return { error: { statusCode: '409' } };
      this.blobs.set(path, data); return { error: null };
    },
    download: async (path: string) => ({ data: new Blob([this.blobs.get(path)! as BlobPart]), error: null }),
  }) };
  from(table: string) {
    const q = super.from(table), insert = q.insert.bind(q);
    q.insert = patch => insert({ updated_at: '2026-10-02T00:00:00Z', archived_at: null, ...patch });
    return q;
  }
}
const email: ReceivedEmail = { id: 'email-1', message_id: 'msg-1', from: 'marketer@netflydigital.com',
  to: ['netfly@example.resend.app'], subject: 'Synthetic test only', created_at: '2026-10-02T00:00:00Z',
  text: 'Client/Driver: Synthetic Test\nAccident Date: 09/04/2026\nLocation: Kansas City, Missouri – Highway 70\nCase #: TEST-1', html: null,
  attachments: [{ id: 'pdf-1', filename: 'retainer.pdf', content_type: 'application/pdf' }] };
const campaign = { id: 'camp', firm_id: 'firm' };
const pdf = '%PDF-1.7\n' + 'Synthetic test only '.repeat(10) + '\n%%EOF';
const fetcher = (async (url: any) => String(url).startsWith('https://api.resend.com/')
  ? Response.json({ download_url: 'https://inbound-cdn.resend.com/test.pdf', size: pdf.length }) : new Response(pdf)) as typeof fetch;
const database = () => new EmailDb({ leads: [], claims: [], case_documents: [], firms: [{ id: 'firm', slug: 'tmp', name: 'Example, Second & Third' }],
  campaigns: [{ ...campaign, name: 'NETFLY ONTAKE', case_type: 'mva', path: 'secondary', active: true, esign_required: false, firms: { slug: 'tmp' } }] });

async function main() {
  const wrongFirm = database();
  await assert.rejects(() => importNetflyEmail(wrongFirm, campaign, { ...email,
    text: 'Accident Intake Note – Other Law FL\n' + email.text }, 'test-key', fetcher), /different or unrecognized/);
  assert.equal(wrongFirm.tables.leads.length, 0, 'wrong-firm mail cannot create a lead');
  assert.equal(wrongFirm.tables.claims.length, 0); assert.equal(wrongFirm.blobs.size, 0, 'wrong-firm PDFs never enter receiving firm storage');
  const namedFirm = database();
  await importNetflyEmail(namedFirm, campaign, { ...email, text: 'Accident Intake Note – Example Law\n' + email.text }, 'test-key', fetcher);
  assert.equal(namedFirm.tables.leads.length, 1, 'matching shorthand firm name is accepted');
  const linkedDb = database();
  const linked = await importNetflyEmail(linkedDb, campaign, { ...email, attachments: [], text: `${email.text}
Representation: Synthetic Test has not retained an attorney.
Subject: New Signing! Synthetic Test
Contact Information:
Synthetic Test
client@example.test
+12025550146
The Signed Agreement:
https://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001?locale=en-US
Accident Details:
Note:
Office: 2025550188
sender@netflydigital.com` }, 'test-key', (async () => { throw new Error('A viewer link must not trigger an arbitrary download'); }) as typeof fetch);
  assert.equal(linkedDb.tables.leads[0].phone, '2025550146');
  assert.equal(linkedDb.tables.leads[0].email, 'client@example.test');
  assert.equal(linked.partial, true);
  assert.ok(linked.warnings.includes('Signed PDF missing'));
  assert.ok(linked.warnings.some(warning => /representation note/.test(warning)));
  assert.equal(linkedDb.tables.case_documents.length, 1, 'viewer link is source evidence, not an attached signed PDF');
  assert.equal(linkedDb.tables.claims[0].answers.netfly_secondary.review.status, 'in_progress');
  const db = database();
  assert.equal((await netflyEmailCampaign(db)).id, 'camp');
  db.tables.campaigns.push({ ...db.tables.campaigns[0], id: 'foreign', firm_id: 'another-firm' });
  assert.equal((await netflyEmailCampaign(db)).id, 'camp', 'receiving resolves within the configured firm');
  const first = await importNetflyEmail(db, campaign, email, 'test-key', fetcher);
  assert.equal(first.created, true); assert.equal(first.partial, true); assert.equal(first.retry_required, false);
  assert.equal(db.tables.leads[0].phone, null, 'missing client phone does not reject the lead');
  assert.equal(db.tables.leads[0].perm_text, false, 'incoming mail does not consent to texts');
  assert.equal(db.tables.case_documents.length, 2, 'both original email and PDF preserved');
  assert.equal(db.tables.claims[0].answers.netfly_secondary.fields.accident_date, '2026-09-04');
  assert.equal(db.tables.claims[0].answers.netfly_secondary.review.status, 'in_progress', 'PDF never auto-approved');
  const again = await importNetflyEmail(db, campaign, email, 'test-key', fetcher);
  assert.equal(again.lead_id, first.lead_id); assert.equal(db.tables.leads.length, 1); assert.equal(db.tables.case_documents.length, 2);
  const forwarded = await importNetflyEmail(db, campaign, { ...email, id: 'email-2', message_id: 'forward-2' }, 'test-key', fetcher);
  assert.equal(forwarded.lead_id, first.lead_id, 'exact repeated case note reuses file');
  assert.equal(db.tables.case_documents.filter(d => d.doc_type === 'netfly_signed_retainer').length, 1);
  const partialDb = database();
  const failed = await importNetflyEmail(partialDb, campaign, email, 'test-key', (async () => new Response('outage', { status: 503 })) as typeof fetch);
  assert.equal(failed.retry_required, true); assert.equal(partialDb.tables.leads.length, 1, 'PDF failure keeps visible partial lead');
  const retry = await importNetflyEmail(partialDb, campaign, email, 'test-key', fetcher);
  assert.equal(retry.retry_required, false); assert.equal(partialDb.tables.leads.length, 1); assert.equal(partialDb.tables.case_documents.length, 2);
  partialDb.tables.leads[0].archived_at = '2026-10-02T01:00:00Z';
  await assert.rejects(() => importNetflyEmail(partialDb, campaign, email, 'test-key', fetcher), /archived/);
  const failedDb = database();
  failedDb.failOn = op => op.table === 'case_documents' && op.kind === 'insert' ? 'outage' : null;
  await assert.rejects(() => importNetflyEmail(failedDb, campaign, email, 'test-key', fetcher), /file entry failed/);
  failedDb.failOn = () => null;
  await importNetflyEmail(failedDb, campaign, email, 'test-key', fetcher);
  assert.equal(failedDb.tables.leads.length, 1, 'retry after storage/DB split recovers same file');
  const blank = database();
  await importNetflyEmail(blank, campaign, { ...email, text: '', attachments: [] }, 'test-key', fetcher);
  assert.equal(blank.tables.leads.length, 1); assert.match(blank.tables.leads[0].claimant_name, /name needed/);
  const viewerDb = database();
  const viewerBody = `${email.text}\nInjuries & Treatment: Treated at Synthetic Clinic on 09/05/2026.\nContact Information:\nSynthetic Test\nclient@example.test\n2025550146\nThe Signed Agreement:\nhttps://go.easyclaimcenter.com/documents/v1/00000000-0000-4000-8000-000000000001\nAccident Details:`;
  const viewerFetcher = (async (url: any) => String(url).startsWith('https://services.leadconnectorhq.com/')
    ? String(url).includes('/download?') ? Response.json({ url: 'https://storage.googleapis.com/leadgen-proposals-estimates/location/location00001/documents/document00001/signed.pdf' })
      : Response.json({ document: { _id: 'document00001', locationId: 'location00001', status: 'completed', recipients: [{ role: 'signer', firstName: 'Synthetic', lastName: 'Test', hasCompleted: true }] } })
    : new Response(pdf)) as typeof fetch;
  const enrich = async () => ({ available: true, suggestions: [
    { id: 'seen_doctor', value: 'Yes', evidence: 'Treated at Synthetic Clinic', label: '' },
    { id: 'first_provider', value: 'Synthetic Clinic', evidence: 'Treated at Synthetic Clinic', label: '' },
    { id: 'first_visit', value: '2026-09-05', evidence: '09/05/2026', label: '' },
    { id: 'perm_text', value: 'Yes', evidence: 'Treated at Synthetic Clinic', label: '' },
  ] });
  const viaLink = await importNetflyEmail(viewerDb, campaign, { ...email, id: 'viewer-mail', text: viewerBody, attachments: [] }, 'test-key', viewerFetcher, enrich);
  assert.equal(viaLink.partial, false, 'the provided email shape imports contact, notes and linked completed PDF');
  assert.equal(viewerDb.tables.case_documents.filter(row => row.doc_type === 'netfly_signed_retainer').length, 1);
  const savedFields = viewerDb.tables.claims[0].answers.netfly_secondary;
  assert.equal(savedFields.fields.first_provider, 'Synthetic Clinic'); assert.equal(savedFields.fields.first_visit, '2026-09-05');
  assert.equal(savedFields.fields.perm_text, undefined); assert.equal(savedFields.imported_fields.first_provider.confirmed, false);
  savedFields.fields.first_provider = 'Agent corrected clinic';
  const amended = await importNetflyEmail(viewerDb, campaign, { ...email, id: 'amended-mail', text: viewerBody.replace('Case #: TEST-1', 'Case #: TEST-2'), attachments: [] }, 'test-key', viewerFetcher, enrich);
  assert.equal(amended.lead_id, viaLink.lead_id, 'same original agreement keeps later note revisions on the same file');
  assert.equal(viewerDb.tables.claims[0].answers.netfly_secondary.fields.first_provider, 'Agent corrected clinic');
  const outlookDb = database();
  const outlookBody = viewerBody.replace('Client/Driver: Synthetic Test', 'Client/Driver: Synthétic Test')
    .replace('client@example.test', 'client@example.test<mailto:client@example.test>')
    .replace('Accident Details:', 'Accident Details:\nState: , City: Kansas city, Accident Type: Auto Accident');
  const outlookEmail = { ...email, id: 'outlook-mail', from: 'Brett <BCurry@turnbullfirm.com>', text: outlookBody, attachments: [] };
  const outlook = await importNetflyEmail(outlookDb, campaign, outlookEmail, 'test-key', viewerFetcher, enrich);
  assert.equal(outlook.partial, false); assert.equal(outlook.retry_required, false);
  assert.equal(outlookDb.tables.leads[0].claimant_name, 'Synthétic Test');
  assert.equal(outlookDb.tables.leads[0].phone, '2025550146'); assert.equal(outlookDb.tables.leads[0].email, 'client@example.test');
  const outlookFields = outlookDb.tables.claims[0].answers.netfly_secondary.fields;
  assert.equal(outlookFields.accident_city, 'Kansas City'); assert.equal(outlookFields.accident_state, 'MO');
  assert.equal(outlookFields.road, 'Highway 70'); assert.equal(outlookFields.accident_date, '2026-09-04');
  assert.equal(outlookFields.first_provider, 'Synthetic Clinic'); assert.equal(outlookFields.first_visit, '2026-09-05');
  assert.equal(outlookDb.tables.claims[0].answers.netfly_secondary.review.status, 'in_progress');
  assert.equal(outlookDb.tables.leads[0].perm_text, false);
  assert.equal(outlookDb.tables.case_documents.filter(row => row.doc_type === 'netfly_signed_retainer').length, 1);
  assert.ok([...outlookDb.blobs.values()].some(bytes => new TextDecoder().decode(bytes).includes(outlookBody)), 'the complete forwarded source is preserved');
  await importNetflyEmail(outlookDb, campaign, outlookEmail, 'test-key', viewerFetcher, enrich);
  assert.equal(outlookDb.tables.leads.length, 1); assert.equal(outlookDb.tables.claims.length, 1);
  assert.equal(outlookDb.tables.case_documents.length, 2, 'replay preserves one source email and one completed PDF');
  const isolation = database();
  isolation.tables.leads.push({ id: 'foreign', firm_id: 'different', campaign_id: 'camp', lawruler_ref_no: '123', claimant_name: 'Synthetic Test' });
  const scoped = await importNetflyEmail(isolation, campaign, { ...email, text: email.text + '\nLawRuler Lead ID: 123' }, 'test-key', fetcher);
  assert.notEqual(scoped.lead_id, 'foreign');
  console.log('NETFLY import: partial files, PDFs, replay, forwarding, failure recovery, archive and tenant tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
