-- ============================================================================
-- 0102 — Corrected write-protection (supersedes 0100 Part B, which is NOT to
-- be run: its trigger was SECURITY DEFINER, and inside such a function
-- current_user is the function OWNER, so the postgres exemption fired for
-- every caller and the guard never checked anything. Astra caught it before
-- it was ever applied. This version runs as the INVOKER, so current_user is
-- the real acting role: 'authenticated' for browser writes, 'service_role'
-- for the app server.)
--
-- Run the whole file at once. Then test with a synthetic agent account:
-- editing their own name/phone works; editing their own role, firm, active
-- or permissions fails; the Users screen (service role) still manages everyone.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. app_users: the own-row RLS policy lets a user write their own row, and
-- role/firm_id/active/perm_overrides live on it. Block self-service changes
-- to the authorization columns, self-INSERT, and self-DELETE.
-- ---------------------------------------------------------------------------
create or replace function public.guard_app_users_priv()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default): current_user is the real acting role.
set search_path = public as $$
declare acting text := current_user;
begin
  -- The app server and the platform manage users through the service role.
  if acting in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if not public.can_manage_users() then
      raise exception 'Accounts are created by a user manager, not self-service.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_manage_users() then
      raise exception 'Accounts are removed by a user manager, not self-service.';
    end if;
    return old;
  end if;

  -- UPDATE: profile fields are free; authorization fields are not.
  if (new.role is distinct from old.role)
     or (new.firm_id is distinct from old.firm_id)
     or (new.active is distinct from old.active)
     or (new.perm_overrides is distinct from old.perm_overrides)
     or (new.email is distinct from old.email)
     or (new.id is distinct from old.id) then
    if not public.can_manage_users() then
      raise exception 'Only a user manager can change role, firm, active, email or permissions.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_app_users_priv on public.app_users;
create trigger trg_guard_app_users_priv
  before insert or update or delete on public.app_users
  for each row execute function public.guard_app_users_priv();

-- ---------------------------------------------------------------------------
-- 2. case_documents: the firm policy only checks firm_id. Bind the row to a
-- real lead/claim of that firm AND bind the storage pointer itself: uploads
-- live at "<firm_id>/<lead_id>/...", so a row cannot point another case's
-- label at someone else's stored file.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger
language plpgsql
set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid; acting text := current_user;
begin
  if acting in ('service_role', 'postgres', 'supabase_admin') then
    -- Server writes still get the referential checks below; skip nothing else.
    null;
  end if;
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
  -- The stored object must live under this firm (and this lead, when set).
  if new.storage_path is not null then
    if position(new.firm_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this firm';
    end if;
    if new.lead_id is not null
       and position(new.firm_id::text || '/' || new.lead_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this lead';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_case_documents on public.case_documents;
create trigger trg_guard_case_documents
  before insert or update on public.case_documents
  for each row execute function public.guard_case_documents();

-- ---------------------------------------------------------------------------
-- 3. A deactivated account dies at the DATABASE too, not just in the app:
-- every RLS helper now treats active=false as no access, so a still-valid
-- JWT gets nothing through the Data API either.
--
-- These three are SECURITY DEFINER on purpose. The app_users policies call
-- them; if they in turn read app_users under those same policies (invoker),
-- the database recurses until "stack depth limit exceeded" — hit and fixed
-- during live verification on Sep 27. DEFINER breaks the loop the same way
-- the existing my_firm_id/role_is_firm helpers always have. Safe because
-- each reads ONLY the calling user's own row (auth.uid()) with a pinned
-- search_path, and anon EXECUTE is revoked below.
-- ---------------------------------------------------------------------------
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and coalesce(active, true)
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

create or replace function public.can_manage_users()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and ( u.role in ('owner','admin')
            or coalesce((u.perm_overrides->>'users.manage')::boolean, false) )
  );
$$;

create or replace function public.can_see_money()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and case
            when u.perm_overrides ? 'money.view'
              then (u.perm_overrides->>'money.view')::boolean
            else u.role::text in ('owner','admin')
          end
  );
$$;

create or replace function public.role_is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_users where id = auth.uid() and coalesce(active, true) and role = 'firm')
$$;

create or replace function public.my_firm_id()
returns uuid language sql stable security definer set search_path = public as $$
  select firm_id from app_users where id = auth.uid() and coalesce(active, true)
$$;

create or replace function public.current_app_user()
returns table(uid uuid, firm_id uuid, role app_role)
language sql stable security definer set search_path = public as $$
  select id, firm_id, role from app_users where id = auth.uid() and coalesce(active, true)
$$;

-- Recreating a function does not preserve revokes; strip anon again.
revoke execute on function public.is_internal() from anon;
revoke execute on function public.can_manage_users() from anon;
revoke execute on function public.can_see_money() from anon;

-- ---------------------------------------------------------------------------
-- STATUS: APPLIED to the live database on Sep 27 2026 (this exact text) and
-- verified with impersonated-JWT probes, all rolled back:
--   * agent editing own name/phone: allowed
--   * agent setting own role to owner: blocked by trg_guard_app_users_priv
--   * deactivated agent: is_internal()=false, my_firm_id()=null, 0 lead rows
--   * active agent: unchanged access
-- Running this file again is safe (create-or-replace + drop-trigger-if-exists).
-- ---------------------------------------------------------------------------
