-- ============================================================================
-- 0043 ADD MANAGER ROLE (enum value only)
-- MUST run and COMMIT before 0044, because Postgres forbids using a newly added
-- enum value in the same transaction that adds it. This file does nothing but
-- add the value. Run it by itself (or as the first statement), then run 0044.
-- Idempotent.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'manager'
  ) then
    alter type app_role add value 'manager' after 'admin';
  end if;
end $$;
