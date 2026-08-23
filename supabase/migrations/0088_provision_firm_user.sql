-- ============================================================================
-- ClaimReach 0088: firm user provisioning
--
-- Root cause (this database, 2026-08-22): 0009's trg_provision_firm_user and
-- provision_firm_user() were NEVER applied. auth.users has a different
-- trigger, t_on_auth_user_created → handle_new_user(), which only inserts
-- public.profiles. Not disabled, not replica-skipped — missing entirely.
-- handle_new_user is left alone.
--
-- 1. provision_firm_user_for(id, email) — single writer into app_users
-- 2. AFTER INSERT trigger ENABLE ALWAYS; exceptions warn and still allow
--    the auth insert so a firm_access miss cannot abort staff signups
-- 3. provision_self_from_firm_access() — callback self-heal, own uid only
-- 4. Backfill: auth.users in firm_access with no app_users row
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

create or replace function provision_firm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform provision_firm_user_for(new.id, new.email);
  return new;
exception when others then
  raise warning 'provision_firm_user: %', sqlerrm;
  return new;
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
revoke all on function provision_firm_user() from public;
revoke all on function provision_self_from_firm_access() from public;

do $$
begin
  grant execute on function provision_firm_user_for(uuid, text) to supabase_auth_admin;
  grant execute on function provision_firm_user() to supabase_auth_admin;
exception when undefined_object then
  null;
end $$;

grant execute on function provision_self_from_firm_access() to authenticated;

drop trigger if exists trg_provision_firm_user on auth.users;
create trigger trg_provision_firm_user
  after insert on auth.users
  for each row execute function provision_firm_user();

alter table auth.users enable always trigger trg_provision_firm_user;

insert into app_users (id, firm_id, role, full_name, email)
select au.id,
       f.id,
       fa.role,
       coalesce(nullif(trim(fa.full_name), ''), lower(trim(au.email))),
       lower(trim(au.email))
from auth.users au
join firm_access fa on lower(trim(fa.email)) = lower(trim(au.email))
join firms f on f.slug = fa.firm_slug
where not exists (select 1 from app_users ap where ap.id = au.id)
on conflict (id) do update set
  firm_id = excluded.firm_id,
  role    = excluded.role,
  email   = excluded.email;
