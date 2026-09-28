-- ============================================================================
-- 0100 — Pre-launch security hardening (Astra audit, Sep 27 2026).
--
-- PART A is safe to run any time: it stops the public anon key from reading
-- three operational views that today expose claimant name, phone and email,
-- and adds the campaign switch for requiring a full 9-digit SSN.
--
-- PART B changes write behavior (blocks role self-escalation and cross-case
-- document relabeling). The app's own server writes use the service role and
-- are exempt. Run after Brett reads it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A1. Operational views: owned by postgres, so they bypass RLS, and they
-- were granted to anon + authenticated. drips_due includes claimant name,
-- phone and email. Only server cron (service role) reads these.
-- ---------------------------------------------------------------------------
alter view public.drips_due set (security_invoker = true);
alter view public.automation_queue_due set (security_invoker = true);
alter view public.leads_purgeable set (security_invoker = true);
revoke all on public.drips_due from anon, authenticated;
revoke all on public.automation_queue_due from anon, authenticated;
revoke all on public.leads_purgeable from anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART A2. Per-campaign switch: the firm requires the full 9-digit SSN on the
-- agreement (no last-4). Enforced server-side in /api/calls/esign/complete.
-- ---------------------------------------------------------------------------
alter table campaigns add column if not exists ssn_require_full boolean not null default false;

-- ---------------------------------------------------------------------------
-- PART B — SUPERSEDED, DO NOT RUN. The original Part B trigger here was
-- SECURITY DEFINER; inside such a function current_user is the function
-- OWNER, so the privileged-role exemption fired for every caller and the
-- guard checked nothing (caught in review before it was ever applied).
-- The corrected version, plus the storage-path binding and active-aware RLS
-- helpers, is migration 0102_hardening_v2.sql. Run that instead.
-- ---------------------------------------------------------------------------
