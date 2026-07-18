-- ============================================================================
-- 0051 A LEAD MUST KNOW WHAT IT IS
-- leads.case_type and claims.claim_type were declared:
--     text not null default 'motel_trafficking'
-- That default was correct when ClaimReach ran one campaign. Now it silently
-- stamps every new file as a Motel 6 trafficking case, which is why unrelated
-- files were opening a trafficking questionnaire and why nothing forced an agent
-- to say what the call actually was.
--
-- Dropping the default (keeping NOT NULL) makes the case type explicit at every
-- creation path: an insert that does not state what the file is now fails loudly
-- instead of quietly guessing wrong.
--
-- Campaign is NOT made NOT NULL here on purpose. Existing rows have no campaign,
-- so a hard constraint would fail on contact with live data. It is enforced in
-- the application on every creation path, and anything already missing one is
-- surfaced in the UI rather than hidden.
-- Idempotent.
-- ============================================================================
alter table leads  alter column case_type  drop default;
alter table claims alter column claim_type drop default;

-- Backfill guard: any legacy row still carrying the old default that never had a
-- campaign was almost certainly mislabeled by it rather than genuinely a motel
-- file. Leave the data alone (we do not know), but make it findable.
create index if not exists idx_leads_no_campaign on leads(firm_id) where campaign_id is null;
