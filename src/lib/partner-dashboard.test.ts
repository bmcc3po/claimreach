import assert from 'node:assert/strict';
import { buildPartnerRows } from './partner-dashboard';
import { isPartnerIdentity, partnerMayUsePath } from './partner-access';
import { DEFAULT_STATUSES } from './statuses';

const ref = { partner_key: 'pr-digital', source_system: 'lawruler', source_lead_id: '266951', firm_id: 'tmp' };
const lead = { id: 'lead-one', firm_id: 'tmp', lawruler_ref_no: '266951', source_system: 'lawruler',
  lead_no: 'TMP-1203', claimant_name: 'Synthetic Person', phone: '2025550100', email: 'test@example.invalid',
  lawruler_created_at: '2026-09-28T10:00:00Z', first_dialed_at: '2026-09-28T10:07:00Z' };
const completed = { claim_id: 'matter-one', lead_id: 'lead-one', firm_id: 'tmp', provider: 'docuseal',
  pax_index: null, voided_at: null, status: 'completed', completed_pdf_path: 'tmp/signed.pdf',
  cert_pdf_path: 'tmp/cert.pdf', signed_at: '2026-09-28T10:10:00Z' };
const build = (leads: any[], agreements: any[] = []) => buildPartnerRows({
  refs: [ref], leads, claims: [{ id: 'matter-one', lead_id: 'lead-one', firm_id: 'tmp', campaign: 'INNO MVA', status: 'new' }],
  calls: [{ lead_id: 'lead-one', firm_id: 'tmp', direction: 'outbound' }], agreements, agents: [], statuses: DEFAULT_STATUSES,
});

assert.equal(isPartnerIdentity({ app_metadata: { account_type: 'partner' } }), true);
assert.equal(isPartnerIdentity({ app_metadata: {} }), false);
assert.equal(partnerMayUsePath('/partner'), true);
assert.equal(partnerMayUsePath('/leads/TMP-1203'), false);
assert.equal(partnerMayUsePath('/api/leads'), false);

const visible = build([lead, { ...lead, id: 'other-firm', firm_id: 'other' }, { ...lead, id: 'other-source', lawruler_ref_no: '266950' }]);
assert.equal(visible.length, 1);
assert.equal(visible[0].name, 'Synthetic Person');
assert.equal(visible[0].speedMinutes, 7);
assert.equal(visible[0].claimReachCalls, 1);
assert.equal(visible[0].syncState, 'imported');
assert.equal(visible[0].signed, false);
assert.equal(build([lead], [completed])[0].signed, true);
assert.equal(build([lead], [{ ...completed, cert_pdf_path: null }])[0].signed, false);
assert.equal(build([lead], [{ ...completed, voided_at: '2026-09-28T11:00:00Z' }])[0].signed, false);
assert.equal(build([lead], [{ ...completed, claim_id: 'other-matter' }])[0].signed, false);

const wrongFirm = build([{ ...lead, firm_id: 'other' }]);
assert.equal(wrongFirm[0].name, null);
assert.equal(wrongFirm[0].syncState, 'import_pending');
assert.equal(wrongFirm[0].speedMinutes, null);

const duplicate = build([lead, { ...lead, id: 'duplicate' }]);
assert.equal(duplicate[0].name, null);
assert.equal(duplicate[0].phone, null);
assert.equal(duplicate[0].syncState, 'identity_review');
console.log('ok partner allowlist, identity quarantine and missing-data semantics');
