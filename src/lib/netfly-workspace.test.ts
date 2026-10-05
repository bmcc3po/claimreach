import assert from 'node:assert/strict';
import { netflyWorkspaceCall } from './netfly-workspace';
import { NETFLY_FIELDS } from './netfly-ontake';

const claim = { claim_type: 'netfly_secondary', updated_at: '2026-10-05T12:00:00Z', answers: {
  netfly_secondary: { fields: { seen_doctor: 'Yes', first_provider: 'TEST Clinic', final_notes: 'Synthetic call notes', unknown_field: 'Ignore', confirmed_email: '' }, call_close: { completion: 'complete', by_name: 'TEST Agent' } },
  mva_call: { first_provider: 'Wrong workflow' }, first_provider: 'Earlier generic answer',
} };
const original = JSON.stringify(claim);
const call = netflyWorkspaceCall('TMP TEST/1', claim)!;
assert.equal(call.href, '/app/netfly/TMP%20TEST%2F1');
assert.equal(call.answered, 3);
assert.equal(call.rows.find(row => row.k === NETFLY_FIELDS.find(f => f.id === 'first_provider')!.label)?.v, 'TEST Clinic');
assert.ok(!JSON.stringify(call).includes('Earlier generic') && !JSON.stringify(call).includes('Wrong workflow') && !JSON.stringify(call).includes('Ignore'));
assert.equal(call.hasOld, false, 'owner stays on the canonical answer summary, not the older questionnaire');
assert.equal(call.agent, 'TEST Agent'); assert.equal(call.dispo, 'Ontake complete');
assert.equal(JSON.stringify(claim), original, 'display must not rewrite answers');
assert.equal(netflyWorkspaceCall('TMP', { ...claim, claim_type: 'mva' }), null);
const sibling = netflyWorkspaceCall('TMP', { claim_type: 'netfly_secondary', answers: {} })!;
assert.deepEqual(sibling.rows, [], 'never borrow another matter’s answers');
assert.equal(sibling.agent, null); assert.equal(sibling.dispo, null);
assert.equal(netflyWorkspaceCall('TMP', { claim_type: 'netfly_secondary', answers: { netfly_secondary: { call_close: { completion: 'incomplete' } } } })?.dispo, 'Callback to finish');
console.log('NETFLY owner summary: canonical answers, welcome-call link, empty/sibling safety and no writes passed');
