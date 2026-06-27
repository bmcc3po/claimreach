-- ============================================================================
-- ClaimReach — 0018: user management + granular permissions
-- ============================================================================
alter table app_users add column if not exists perm_overrides jsonb default '{}'::jsonb;
alter table app_users add column if not exists active boolean default true;
alter table app_users add column if not exists title text;
alter table app_users add column if not exists phone text;

-- Helper: does the CURRENT user have users.manage? (owner/admin by default, or override)
create or replace function can_manage_users() returns boolean language sql stable as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and ( u.role in ('owner','admin')
            or coalesce((u.perm_overrides->>'users.manage')::boolean, false) )
  );
$$;

-- Let user-managers read/update all app_users in their firm.
drop policy if exists app_users_manage on app_users;
create policy app_users_manage on app_users for all
  using ( can_manage_users() or id = auth.uid() )
  with check ( can_manage_users() or id = auth.uid() );
