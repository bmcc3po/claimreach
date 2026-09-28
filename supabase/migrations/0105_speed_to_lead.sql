-- ============================================================================
-- 0105 — Speed to lead (Sep 28 2026, Brett's ask).
--
-- Two clocks per lead, both starting at leads.created_at (the moment the lead
-- dropped in, whatever the source):
--   first_opened_at / first_opened_by — the first time internal staff opened
--     the file in ClaimReach (the call screen or the classic lead page).
--   first_dialed_at — the first outbound call or voicemail attempt to the
--     lead's number, stamped from the JustCall webhook at the call's own time.
-- Both are write-once (guarded .is null in the app), and a call that predates
-- the lead never stamps (created_at <= call time), so a speed can never be
-- negative. Reports reads these per campaign.
-- ============================================================================
alter table leads add column if not exists first_opened_at timestamptz;
alter table leads add column if not exists first_opened_by uuid;
alter table leads add column if not exists first_dialed_at timestamptz;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026. Record only.
-- ============================================================================
