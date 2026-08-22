-- ============================================================================
-- ClaimReach 0087: m6 firm login helper + narrow communications INSERT
--
-- 1. is_m6_landing_email(email)
--    Adding an m6 firm user = inserting them into retention_alert_recipients
--    (campaign = 'motel6', email lowercase, active). That table is internal
--    RLS, so this SECURITY DEFINER lets the magic-link callback ask "does
--    this email land on /m6?" without opening the table.
--
-- 2. comm_firm_m6_manual_insert
--    Firm may INSERT a touch on an m6 TMP file they own, only when
--    logged_manually = true. No UPDATE/DELETE. JustCall / system rows stay
--    internal-only. Does not change firm_stage_only_guard or comm_firm SELECT.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

create or replace function is_m6_landing_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from retention_alert_recipients
    where campaign = 'motel6'
      and active = true
      and email = lower(trim(p_email))
  );
$$;

revoke all on function is_m6_landing_email(text) from public;
grant execute on function is_m6_landing_email(text) to authenticated;

drop policy if exists comm_firm_m6_manual_insert on communications;
create policy comm_firm_m6_manual_insert on communications
  for insert
  with check (
    role_is_firm()
    and logged_manually = true
    and firm_id = my_firm_id()
    and exists (
      select 1
      from leads l
      join firms f on f.id = l.firm_id
      where l.id = communications.lead_id
        and l.firm_id = my_firm_id()
        and f.slug = 'tmp'
        and l.archived_at is null
        and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
    )
  );
