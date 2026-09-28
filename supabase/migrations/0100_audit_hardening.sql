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
-- PART B1. app_users: RLS lets a user update their own row, and role/firm_id/
-- active/perm_overrides live on that row. Block self-service changes to the
-- authorization columns. Admin screens use the service role and are exempt;
-- users with can_manage_users() keep editing everyone through RLS.
-- ---------------------------------------------------------------------------
create or replace function public.guard_app_users_priv()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Server-side (service role) writes are the admin path; let them through.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if (new.role is distinct from old.role)
     or (new.firm_id is distinct from old.firm_id)
     or (new.active is distinct from old.active)
     or (new.perm_overrides is distinct from old.perm_overrides)
     or (new.email is distinct from old.email) then
    if not public.can_manage_users() then
      raise exception 'Only a user manager can change role, firm, active or permissions.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_app_users_priv on public.app_users;
create trigger trg_guard_app_users_priv
  before update on public.app_users
  for each row execute function public.guard_app_users_priv();

-- ---------------------------------------------------------------------------
-- PART B2. case_documents: the firm policy only checks firm_id, so a row could
-- be pointed at another case's lead/claim. Enforce that the labels agree.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid;
begin
  if new.lead_id is not null then
    select firm_id into v_lead_firm from public.leads where id = new.lead_id;
    if v_lead_firm is null then raise exception 'case_documents: lead does not exist'; end if;
    if new.firm_id is distinct from v_lead_firm then
      raise exception 'case_documents: firm does not match the lead''s firm';
    end if;
  end if;
  if new.claim_id is not null then
    select lead_id, firm_id into v_claim_lead, v_claim_firm from public.claims where id = new.claim_id;
    if v_claim_lead is null then raise exception 'case_documents: claim does not exist'; end if;
    if new.lead_id is not null and v_claim_lead is distinct from new.lead_id then
      raise exception 'case_documents: claim does not belong to this lead';
    end if;
    if v_claim_firm is not null and new.firm_id is distinct from v_claim_firm then
      raise exception 'case_documents: firm does not match the claim''s firm';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_case_documents on public.case_documents;
create trigger trg_guard_case_documents
  before insert or update on public.case_documents
  for each row execute function public.guard_case_documents();
