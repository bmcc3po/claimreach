import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicFirmOutcomeAudit } from './partner-firm-outcome-audit';

test('30-day firm audit prefers cancellation notice over later archive date',()=>{
  const result=publicFirmOutcomeAudit({firm_outcome_audit:{
    phase:'Archived',phase_date:'2026-11-09',notice_date:'2026-10-27',source_as_of:'2026-11-12'
  }},'2026-10-21T21:23:20Z');
  assert.equal(result.firmPhase,'Archived');
  assert.equal(result.cancellationNoticeAt,'2026-10-27');
  assert.equal(result.daysFromSignToFirmEvent,6);
  assert.equal(result.firmEventBasis,'Notice date');
  assert.match(result.thirtyDayReview,/within 30 days/);
});
test('archive alone is not a confirmed effective cancellation date',()=>{
  const result=publicFirmOutcomeAudit({firm_outcome_audit:{
    phase:'Archived',phase_date:'2026-10-29',source_as_of:'2026-11-12'
  }},'2026-09-30T23:55:00Z');
  assert.equal(result.cancellationNoticeAt,null);
  assert.equal(result.firmEventBasis,'Archive phase date (unverified)');
  assert.match(result.thirtyDayReview,/verify cancellation notice/);
});
test('no verified signing date and pending drop fail closed',()=>{
  assert.equal(publicFirmOutcomeAudit({firm_outcome_audit:{
    phase:'Pending Drop',phase_date:'2026-10-14'
  }},null).daysFromSignToFirmEvent,null);
  assert.match(publicFirmOutcomeAudit({firm_outcome_audit:{phase:'Archived',phase_date:'2026-10-29'}},null).thirtyDayReview,/needs verification/);
});
test('does not pass through unexpected source fields or private commercial values',()=>{
  const result=publicFirmOutcomeAudit({firm_outcome_audit:{
    phase:'Archived',phase_date:'2026-11-04',notice_date:'2026-11-04',
    hidden_commercial_term:'must never appear',unapproved:'private canary'
  }},'2026-09-18T18:00:00Z');
  assert.equal(result.daysFromSignToFirmEvent,47);
  assert.equal(Object.keys(result).includes('hidden_commercial_term'),false);
  assert.equal(JSON.stringify(result).includes('private canary'),false);
});
