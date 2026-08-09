-- ============================================================================
-- ClaimReach — 0011: Case tiering + user profiles
-- ============================================================================

-- Dual-grade tiering on the claim.
-- Trafficking: tier_letter A-F (severity) + tier_number 1-5 (motel knowledge).
-- Med Mal: tier_number 1-5 only (combined). Letter null.
alter table claims add column if not exists tier_letter text;   -- A..F (severity)
alter table claims add column if not exists tier_number int;    -- 1..5 (evidence)
alter table claims add column if not exists tier_set_by uuid references app_users(id);
alter table claims add column if not exists tier_set_at timestamptz;

-- A convenience text 'tier' for quick display (e.g. 'A1' or '3').
alter table claims add column if not exists tier text;

-- User profiles (both teams collaborate; everyone has a profile).
alter table app_users add column if not exists title text;
alter table app_users add column if not exists phone text;
alter table app_users add column if not exists avatar_color text;
alter table app_users add column if not exists bio text;
alter table app_users add column if not exists calendly_slug text;
