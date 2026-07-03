-- ============================================================================
-- 0044 MANAGER ROLE WIRING (runs after 0043 is committed)
-- Adds manager to the internal-staff set and adds the money-visibility helper.
-- New permission keys (payroll.*, deals.clean, hours.manage) live in the typed
-- layer at src/lib/permissions.ts; no DB change needed for those. Idempotent.
-- ============================================================================

-- Bring 'manager' into the internal-staff set so managers get staff RLS access.
create or replace function is_internal() returns boolean language sql stable as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

-- Money visibility gate. Owner/admin see money by default; manager/agent/qa see
-- it only if perm_overrides.money.view is true. An explicit false strips money
-- from anyone (the Alicia/Ahniyah pattern: full operations access, no dollars).
create or replace function can_see_money() returns boolean language sql stable as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and case
            when u.perm_overrides ? 'money.view'
              then (u.perm_overrides->>'money.view')::boolean
            else u.role::text in ('owner','admin')
          end
  );
$$;
