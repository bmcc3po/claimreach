-- ============================================================================
-- 0101 — Supabase security-advisor cleanup (follow-up to 0100).
--
-- PART A (applied live Sep 27: pure exposure reduction, nothing pre-login
-- calls these): the signed-OUT role can no longer execute any SECURITY
-- DEFINER function. Every caller in the app runs signed in (auth callback
-- provisions AFTER the session exists; m6 landing check runs post-login).
--
-- PART B (run after reading): pin search_path on flagged functions and drop
-- pointless EXECUTE grants on trigger functions. Low risk, but touches the
-- RLS helper functions, so it waits for Brett like 0100 Part B.
--
-- Advisor items intentionally left alone:
--   * automation_events/automation_queue/automation_runs/firm_access/
--     routing_rules/sources have RLS on with no policies. That is DENY-ALL
--     for browser clients; only the server (service role) reads them. Safe.
--   * pg_net sits in the public schema (Supabase's default install target).
--   * Leaked-password protection is a dashboard toggle (Auth, Passwords):
--     turn it on — there is no SQL for it.
-- ============================================================================

-- PART A — signed-out callers lose every definer function.
revoke execute on function public.current_app_user() from anon;
revoke execute on function public.firm_stage_only_guard() from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.is_m6_landing_email(text) from anon;
revoke execute on function public.m6_log_touch(uuid, text, text, text, uuid, text) from anon;
revoke execute on function public.my_firm_id() from anon;
revoke execute on function public.on_two_way_contact() from anon;
revoke execute on function public.provision_self_from_firm_access() from anon;
revoke execute on function public.role_is_firm() from anon;
revoke execute on function public.set_lead_no() from anon;
revoke execute on function public.mint_lead_no(uuid) from anon;
revoke execute on function public.enroll_drips_for_lead(uuid, uuid) from anon;

-- PART B1 — trigger functions are fired by triggers, never called over the
-- API; signed-in users don't need EXECUTE on them either.
revoke execute on function public.firm_stage_only_guard() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.on_two_way_contact() from authenticated;
revoke execute on function public.set_lead_no() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated, anon;
revoke execute on function public.set_updated_at() from authenticated, anon;
revoke execute on function public.log_status_change() from authenticated, anon;
revoke execute on function public.touch_intake_form() from authenticated, anon;
revoke execute on function public.touch_pdf_template() from authenticated, anon;

-- PART B2 — pin search_path so a hostile schema on the path can never swap
-- what these names resolve to.
alter function public.touch_updated_at() set search_path = public;
alter function public.is_internal() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.log_status_change() set search_path = public;
alter function public.touch_intake_form() set search_path = public;
alter function public.can_manage_users() set search_path = public;
alter function public.norm_phone(text) set search_path = public;
alter function public.touch_pdf_template() set search_path = public;
alter function public.can_see_money() set search_path = public;
