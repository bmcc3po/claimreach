-- ============================================================================
-- 0033 FIX: force claims.status from enum to text
-- 0030's conditional conversion did not match in this database, so claims.status
-- is still the claim_status enum and rejects new status keys (e.g. "signed_flag").
-- This converts it unconditionally, backfills old values, then drops the enum.
-- Idempotent and safe to run whether or not 0030's block ran.
-- ============================================================================

-- 1) If status is still an enum (or anything non-text), convert to text.
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_name = 'claims' and column_name = 'status';

  if col_type is distinct from 'text' then
    execute 'alter table claims alter column status drop default';
    execute 'alter table claims alter column status type text using status::text';
    execute 'alter table claims alter column status set default ''new''';
  end if;
end $$;

-- 2) Backfill old enum values to new keys (now that the column accepts text).
update claims set status = 'contacting'      where status = 'contact_attempted';
update claims set status = 'contacting'      where status = 'in_progress';
update claims set status = 'approved'        where status = 'qualified';
update claims set status = 'delivered'       where status = 'sent_to_firm';
update claims set status = 'signed_approved' where status = 'signed';

-- 3) Drop the now-unused enum type so nothing silently re-binds to it.
do $$
begin
  if exists (select 1 from pg_type where typname = 'claim_status') then
    -- Only drop if no column still uses it.
    if not exists (
      select 1 from information_schema.columns
      where udt_name = 'claim_status'
    ) then
      drop type claim_status;
    end if;
  end if;
end $$;

-- 4) Safety: make sure the leads.status (if present) is text too, since some
-- legacy reads fall back to it.
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_name = 'leads' and column_name = 'status';

  if col_type is not null and col_type is distinct from 'text' then
    execute 'alter table leads alter column status type text using status::text';
  end if;
end $$;
