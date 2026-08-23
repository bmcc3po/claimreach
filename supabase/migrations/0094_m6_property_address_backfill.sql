-- ============================================================================
-- ClaimReach 0094: backfill motel stay addresses from case_description
--
-- Live /m6/property and LOR read leads.property_street / city / state / zip.
-- The CSV ingest parked many stays in case_description, so ~60 motel files
-- have a name (or nothing) and a null street. properties_canonical has the
-- same hole when Places returned a name + formatted address but no parsed
-- components.
--
-- Conservative: only fill EMPTY property_* / street columns. Never overwrite
-- a street that is already set. TMP motel files only.
--
-- Does NOT touch lead_contact_health / 0093.
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

-- 1. leads.property_* from a US mailing line in case_description
--    "7111 LBJ Freeway, Dallas, TX 75251"
with parsed as (
  select
    l.id,
    regexp_match(
      l.case_description,
      '([0-9]{1,6}[[:space:]]+[A-Za-z0-9 .#''/-]+),[[:space:]]*([A-Za-z .]+),[[:space:]]*([A-Z]{2})[[:space:]]+([0-9]{5})'
    ) as m
  from leads l
  join firms f on f.id = l.firm_id
  where f.slug = 'tmp'
    and l.archived_at is null
    and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
    and (l.property_street is null or btrim(l.property_street) = '')
    and l.case_description is not null
    and l.case_description ~ '[0-9].+[A-Z]{2}[[:space:]]+[0-9]{5}'
)
update leads l
   set property_street = btrim(p.m[1]),
       property_city   = btrim(p.m[2]),
       property_state  = p.m[3],
       property_zip    = p.m[4],
       property_name   = coalesce(
         nullif(btrim(l.property_name), ''),
         case
           when l.case_description ~* 'studio[[:space:]]*6' then 'Studio 6'
           when l.case_description ~* 'motel[[:space:]]*6' then 'Motel 6'
           else l.property_name
         end
       )
  from parsed p
 where l.id = p.id
   and p.m is not null;

-- 2. properties_canonical street/city/state/zip from formatted address
with parsed as (
  select
    c.id,
    regexp_match(
      regexp_replace(c.address, ',[[:space:]]*USA$', '', 'i'),
      '^(.+?),[[:space:]]*([^,]+),[[:space:]]*([A-Z]{2})[[:space:]]+([0-9]{5})'
    ) as m
  from properties_canonical c
  join firms f on f.id = c.firm_id
  where f.slug = 'tmp'
    and (c.street is null or btrim(c.street) = '')
    and c.address is not null
    and c.address ~ '[0-9].+[A-Z]{2}[[:space:]]+[0-9]{5}'
)
update properties_canonical c
   set street = btrim(p.m[1]),
       city   = coalesce(nullif(btrim(c.city), ''), btrim(p.m[2])),
       state  = coalesce(nullif(btrim(c.state), ''), p.m[3]),
       zip    = coalesce(nullif(btrim(c.zip), ''), p.m[4])
  from parsed p
 where c.id = p.id
   and p.m is not null;
