-- ============================================================================
-- ClaimReach 0088a: firm user provisioning (callback is the primary path)
--
-- 0088 failed: ERROR 42501 must be owner of table users. postgres cannot
-- create triggers on auth.users on this project (auth service owns it).
-- That is also why 0009's trg_provision_firm_user never existed here —
-- same install failure, not a disabled or replica-skipped trigger.
--
-- Do not add auth.users triggers. Provisioning is:
--   provision_firm_user_for(id, email)          — single writer
--   provision_self_from_firm_access()           — auth callback, own uid
--   backfill via that writer
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

create or replace function provision_firm_user_for(p_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fa firm_access%rowtype;
  fid uuid;
  normalized text := lower(trim(p_email));
begin
  if p_id is null or normalized is null or normalized = '' then
    return false;
  end if;

  select * into fa from firm_access where lower(trim(email)) = normalized;
  if not found then
    return false;
  end if;

  select id into fid from firms where slug = fa.firm_slug;
  if fid is null then
    return false;
  end if;

  insert into app_users (id, firm_id, role, full_name, email)
  values (p_id, fid, fa.role, coalesce(nullif(trim(fa.full_name), ''), normalized), normalized)
  on conflict (id) do update set
    firm_id   = excluded.firm_id,
    role      = excluded.role,
    full_name = coalesce(excluded.full_name, app_users.full_name),
    email     = excluded.email;

  return true;
end;
$$;

create or replace function provision_self_from_firm_access()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
begin
  if uid is null then
    return false;
  end if;
  select email into em from auth.users where id = uid;
  return provision_firm_user_for(uid, em);
end;
$$;

revoke all on function provision_firm_user_for(uuid, text) from public;
revoke all on function provision_self_from_firm_access() from public;

grant execute on function provision_self_from_firm_access() to authenticated;

-- Leftover from failed 0088 (trigger function was created; the trigger was not).
drop function if exists provision_firm_user();

-- One writer for existing stranded auth users (test user today).
select provision_firm_user_for(au.id, au.email)
from auth.users au
join firm_access fa on lower(trim(fa.email)) = lower(trim(au.email))
where not exists (select 1 from app_users ap where ap.id = au.id);
