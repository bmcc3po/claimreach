import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import LawRulerRecovery, { reviewedLawRulerSelections } from './LawRulerRecovery';
import { planLawRulerRecovery } from '../lib/lawruler-recovery';
// Actual component SSR and selection-building logic. No requests or real records.
(globalThis as any).React = React;
const lead = { id: 'lead', firm_id: 'firm', vendor_fields: { lawruler_status: 'Legacy signed' } };
const claim = { id: 'claim', lead_id: 'lead', firm_id: 'firm', status: 'new' };
const plan = planLawRulerRecovery(lead, [claim], [], []);
const choice = { selected: true, status: 'signed_grievous', approved: false, note: '', reason: '' };
let count = 0;
const t = (name: string, fn: () => void) => { fn(); count++; console.log('ok', name); };
t('initial panel requires explicit firm and preview; no correction is preselected', () => {
  const html = renderToStaticMarkup(<LawRulerRecovery firms={[{ id: 'firm', name: 'Synthetic firm' }]} statuses={[]} reasons={[]} />);
  assert.match(html, /Choose a firm/); assert.match(html, /Preview imports/); assert.ok(!html.includes('Apply selected status corrections'));
  assert.match(html, /No remote document links are fetched/);
});
t('manual mapping requires both approval and explanation', () => {
  assert.throws(() => reviewedLawRulerSelections([plan], { lead: choice }), /Approve and explain/);
  assert.throws(() => reviewedLawRulerSelections([plan], { lead: { ...choice, approved: true } }), /Approve and explain/);
  const result = reviewedLawRulerSelections([plan], { lead: { ...choice, approved: true, note: 'Original label reviewed by owner' } });
  assert.equal(result[0].claim_id, 'claim'); assert.equal(result[0].expected_status, 'new'); assert.equal(result[0].source_status, 'Legacy signed'); assert.equal(result[0].mapping_approved, true);
});
t('unselected and ambiguous matters cannot enter the apply payload', () => {
  assert.equal(reviewedLawRulerSelections([plan], { lead: { ...choice, selected: false } }).length, 0);
  const ambiguous = planLawRulerRecovery(lead, [claim, { ...claim, id: 'other' }], [], []);
  assert.throws(() => reviewedLawRulerSelections([ambiguous], { lead: { ...choice, approved: true, note: 'reviewed' } }), /exact matter/);
});
t('options load failure visibly disables the panel', () => {
  const html = renderToStaticMarkup(<LawRulerRecovery firms={[]} statuses={[]} reasons={[]} loadError="Could not load statuses" />);
  assert.match(html, /role="alert"/); assert.match(html, /Could not load statuses/); assert.match(html, /disabled/);
});
console.log(`${count} LawRuler recovery UI tests passed`);
