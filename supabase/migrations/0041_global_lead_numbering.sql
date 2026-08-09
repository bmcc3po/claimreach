-- ============================================================================
-- 0041 GLOBAL LEAD NUMBERING
-- The lead number is ONE global sequence in creation order (1001, 1002, 1003...)
-- across ALL firms. The firm prefix is vanity only (TMP-1002, WLL-1003) and has
-- NO effect on the number. This means:
--   - an agent can search just "1002" and find the file,
--   - audit pulls work globally: "everything from 200 to 1200" = one ascending
--     range across every firm, because the counter is shared.
-- ============================================================================

-- One global counter for all lead numbers, starting at 1001.
create sequence if not exists global_lead_seq start with 1001 increment by 1;

-- Make sure the column that holds a firm's vanity prefix exists and is sane.
alter table firms add column if not exists lead_prefix text not null default 'CR';

-- Rewrite minting: firm prefix (vanity) + the GLOBAL number (the real id).
create or replace function mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  select coalesce(lead_prefix, 'CR') into pfx from firms where id = p_firm;
  if pfx is null then pfx := 'CR'; end if;
  nxt := nextval('global_lead_seq');   -- GLOBAL, not per-firm
  return pfx || '-' || nxt::text;       -- e.g. TMP-1002, WLL-1003
end $$;

-- Seed the known firms' vanity prefixes (safe no-ops if the names differ).
update firms set lead_prefix = 'TMP'
  where lead_prefix = 'CR' and (name ilike '%turnbull%' or name ilike '%moak%' or name ilike '%pendergrass%' or name ilike '%tmp%');
update firms set lead_prefix = 'WLL'
  where lead_prefix = 'CR' and (name ilike '%west loop%' or name ilike '%westloop%' or name ilike '%wll%');
