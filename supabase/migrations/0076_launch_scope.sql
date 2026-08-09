-- ============================================================================
-- 0076 LAUNCH SCOPE: TMT INTAKES AND TMP MOTEL 6, NOTHING ELSE
--
-- Self-sufficient. It adds the columns it needs before using them, so it does
-- not matter whether any earlier migration ran. `firms` shipped with only id,
-- slug, name, lead_prefix, lead_seq and created_at, so `active` has never
-- existed and `kind` only exists if 0073 ran. Both are added here with
-- `if not exists`, which is also the fix for the console reporting "no firms"
-- while a firm is plainly visible in settings: the query filtered on a column
-- that was not there, so it failed and returned nothing.
--
-- Deactivation, not deletion. Everything comes back by flipping `active`.
--
-- Live at launch:
--   TMT   mva        Motor vehicle accident
--   TMT   prem       Personal injury  (case_subtype carries dog bite, nursing
--                    home, workplace, product liability and the rest, so those
--                    do NOT need campaigns of their own)
--   TMT   referral   Matters TMT does not handle at all. Separate because a
--                    family law caller should not be run through injury
--                    screening questions.
--   TMP   motel_trafficking
-- ============================================================================

-- ---------------------------------------------------------------- columns
alter table firms add column if not exists active boolean not null default true;
alter table firms add column if not exists kind   text    not null default 'client';
alter table firms add column if not exists source text;

comment on column firms.active is 'False hides the firm from the console picker. Never delete a firm; deactivate it.';
comment on column firms.kind   is 'client = a law firm we take intake for. internal = us. Only clients reach the picker.';

alter table campaigns add column if not exists active boolean not null default true;

-- Innovative Intake is the intake center, not a client. It has to stay as a row
-- because staff logins and the form templates hang off it.
update firms set kind = 'internal'
 where lower(slug) in ('innovative-intake', 'inno', 'innovative intake');

-- ---------------------------------------------------------------- campaigns
update campaigns set active = false;

update campaigns c set active = true
  from firms f
 where f.id = c.firm_id
   and (
        (lower(f.slug) = 'tmt' and c.case_type in ('mva', 'prem', 'referral'))
     or (lower(f.slug) = 'tmp' and c.case_type = 'motel_trafficking')
   );

-- ---------------------------------------------------------------- registry
-- Only what a live campaign points at stays assignable, which is what keeps the
-- picker clean: an inactive type cannot reach any firm.
update case_type_registry set active = false;
update case_type_registry set active = true
 where key in ('mva', 'prem', 'referral', 'motel_trafficking');

-- `prem` runs the GENERAL personal injury screen; premises was just the first
-- family to use it. With case_subtype carrying the specifics, the label an agent
-- reads should say what it is. Key unchanged: reword freely, never re-key,
-- because the engine matches on the key.
update case_type_registry set label = 'Personal injury' where key = 'prem';

-- ---------------------------------------------------------------- names
update campaigns c
   set name = upper(f.slug) || ' ' ||
              coalesce(
                (select r.label from case_type_registry r where r.key = c.case_type),
                initcap(replace(c.case_type, '_', ' '))
              )
  from firms f
 where f.id = c.firm_id;

-- ---------------------------------------------------------------- firms
update firms set active = (lower(slug) in ('tmt', 'tmp'));

-- ---------------------------------------------------------------- verify
select upper(f.slug) as firm, c.name, c.case_type
  from campaigns c join firms f on f.id = c.firm_id
 where c.active and f.active
 order by f.slug, c.case_type;

select upper(slug) as slug, name, kind, active from firms order by slug;
