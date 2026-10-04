import assert from 'node:assert/strict';
import { FakeDb } from '../test-fake-db';
import { REHEARSAL_PACKET, rehearsalKey, rehearsalRoot, rehearsalTemplates, rehearsalRecipientAllowed, readRehearsal, syntheticName } from './rehearsal';

const root = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const lead = { id: root, firm_id: 'firm', external_id: null };
const rows = [{ key: 'OTHER', template_id: 'real' }, { key: rehearsalKey(root), template_id: 'synthetic' }, { key: rehearsalKey(other), template_id: 'someone-else' }];
const contacts = { version: 1, phone: '+12025550100', emails: ['owner@example.test'] };
async function main() {
  assert.equal(rehearsalRoot({ id: other, external_id: `${root}:pax:friend-1` }), root);
  assert.equal(rehearsalRoot({ id: other, external_id: `${root}:pax:bad/key` }), other);
  assert.deepEqual(rehearsalTemplates(rows, lead), { rehearsal: true, templates: [{ key: 'OTHER', template_id: 'synthetic' }] });
  assert.deepEqual(rehearsalTemplates(rows, { id: other, external_id: `${root}:pax:friend-1` }).templates, [{ key: 'OTHER', template_id: 'synthetic' }]);
  assert.deepEqual(rehearsalTemplates(rows, { id: 'ordinary' }), { rehearsal: false, templates: [{ key: 'OTHER', template_id: 'real' }] });
  assert.equal(rows[0].template_id, 'real');
  assert.equal(syntheticName(' test Driver '), true);
  assert.equal(syntheticName('Testerman Client'), false);
  assert.equal(rehearsalRecipientAllowed(contacts, 'Text', '(202) 555-0100'), true);
  for (const phone of ['2025550101', '+442025550100', '', '100', '+120255501001234567'])
    assert.equal(rehearsalRecipientAllowed(contacts, 'Text', phone), false, phone);
  assert.equal(rehearsalRecipientAllowed(contacts, 'Email', 'OWNER@example.test'), true);
  assert.equal(rehearsalRecipientAllowed(contacts, 'Email', 'owner+alias@example.test'), false);
  assert.equal(rehearsalRecipientAllowed(contacts, 'Other', 'owner@example.test'), false);
  assert.equal(rehearsalRecipientAllowed({}, 'Text', '2025550100'), false);
  const db = new FakeDb({
    esign_templates: [{ key: rehearsalKey(root), firm_id: 'firm', campaign_id: 'campaign', provider: 'docuseal' }],
    leads: [{ ...lead, campaign_id: 'campaign', vendor_fields: { signing_rehearsal: contacts } }],
  });
  assert.deepEqual(await readRehearsal(db, lead, 'campaign'), contacts);
  assert.equal(await readRehearsal(db, { ...lead, firm_id: 'foreign' }, 'campaign'), null);
  assert.equal(await readRehearsal(db, lead, 'foreign-campaign'), null);
  assert.deepEqual(await readRehearsal(db, { ...lead, id: other, external_id: `${root}:pax:friend-2` }, 'campaign'), contacts);
  db.failOn = op => op.table === 'esign_templates' ? 'read failure' : null;
  await assert.rejects(readRehearsal(db, lead, 'campaign'));
  db.failOn = () => null; db.tables.leads[0].vendor_fields = {};
  await assert.rejects(readRehearsal(db, lead, 'campaign'));
  assert.match(REHEARSAL_PACKET.name, /NONBINDING/);
  assert.deepEqual(REHEARSAL_PACKET.fields.find(f => f.name === 'Client Signature')?.areas?.map(a => a.page), [1, 2, 3]);
  console.log('Rehearsal template isolation, passenger scope, approved recipients and failed reads passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
