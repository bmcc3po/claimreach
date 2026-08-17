-- ============================================================================
-- 0083 LEAD NUMBERS MINT THEMSELVES
--
-- leads.lead_no is NOT NULL with no default, and nothing mints it. The
-- mint_lead_no() function exists (0041) but every insert path has to remember
-- to call it. Two of them do not:
--
--   * /api/hooks/in/[key_id]  - the generic inbound webhook
--   * /api/webhooks/lawruler  - the LawRuler ingest
--
-- Both fail with "null value in column lead_no violates not-null constraint",
-- so no externally-referred lead has ever been created through either route.
--
-- This is the same root cause as the phantom columns: one concept defined in
-- several places with nothing forcing agreement. The fix belongs in the
-- database, where it cannot be forgotten by a caller that does not exist yet.
--
-- Idempotent.
-- ============================================================================

create or replace function set_lead_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_no is null or new.lead_no = '' then
    new.lead_no := mint_lead_no(new.firm_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_set_lead_no on leads;
create trigger trg_set_lead_no
  before insert on leads
  for each row execute function set_lead_no();

-- Backfill anything that somehow landed without a number.
update leads set lead_no = mint_lead_no(firm_id)
where lead_no is null or lead_no = '';
