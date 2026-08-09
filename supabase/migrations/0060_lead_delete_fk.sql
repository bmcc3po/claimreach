-- ============================================================================
-- 0060 LEADS CAN BE DELETED AGAIN
--
-- Every foreign key pointing at leads cascades on delete except one:
-- intake_calls.lead_id, added in 0049, had no delete rule at all. The console
-- writes an intake_calls row on every single call, so any lead created through
-- Take a Call could not be deleted, individually or in bulk. Postgres refused
-- the delete and the UI reported nothing useful.
--
-- SET NULL rather than CASCADE on purpose: the call log is the billing and
-- audit record. Deleting a junk test lead should not erase the evidence that a
-- call happened, and lead_id is already nullable for unmatched calls.
-- Idempotent.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'intake_calls_lead_id_fkey'
      and table_name = 'intake_calls'
  ) then
    alter table intake_calls drop constraint intake_calls_lead_id_fkey;
  end if;
end $$;

alter table intake_calls
  add constraint intake_calls_lead_id_fkey
  foreign key (lead_id) references leads(id) on delete set null;
