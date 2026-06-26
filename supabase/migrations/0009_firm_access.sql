-- ============================================================================
-- ClaimReach — 0009: Firm portal access provisioning
-- Allowlist maps an email -> firm + role so that when a firm user signs in via
-- magic link, they're auto-provisioned into app_users with the right firm/role.
-- ============================================================================

create table if not exists firm_access (
  email     text primary key,
  firm_slug text not null,
  role      app_role not null default 'firm',
  full_name text
);

-- Seed TMP portal access. ADD/REPLACE the real TMP emails here.
insert into firm_access (email, firm_slug, role, full_name) values
  ('intake@tmplawfirm.com', 'tmp', 'firm', 'TMP Intake')
on conflict (email) do update set firm_slug = excluded.firm_slug, role = excluded.role;

-- On new auth user, if their email is in firm_access, auto-create app_users row.
create or replace function provision_firm_user()
returns trigger language plpgsql security definer as $$
declare
  fa firm_access%rowtype;
  fid uuid;
begin
  select * into fa from firm_access where email = new.email;
  if found then
    select id into fid from firms where slug = fa.firm_slug;
    insert into app_users (id, firm_id, role, full_name, email)
    values (new.id, fid, fa.role, coalesce(fa.full_name, new.email), new.email)
    on conflict (id) do update set firm_id = fid, role = fa.role;
  end if;
  return new;
end $$;

drop trigger if exists trg_provision_firm_user on auth.users;
create trigger trg_provision_firm_user
  after insert on auth.users
  for each row execute function provision_firm_user();
