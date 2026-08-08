-- ============================================================================
-- 0076 LAUNCH SCOPE: TMT INTAKES AND TMP MOTEL 6, NOTHING ELSE
--
-- Deactivation, not deletion. Every row stays and comes back by flipping
-- `active`. Nothing here is destructive and nothing needs rebuilding later.
--
-- Live at launch:
--   TMT   mva        Motor vehicle accident
--   TMT   prem       Personal injury  (subtype question carries dog bite,
--                    nursing home, workplace, product liability and the rest,
--                    so those do NOT need their own campaigns)
--   TMT   referral   Matters TMT does not handle at all (family, criminal,
--                    bankruptcy). Kept separate because a family law matter
--                    should not run injury screening questions.
--   TMP   motel_trafficking
--
-- Everything else is parked until the above is live and working.
-- ============================================================================

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
-- Only what a live campaign points at stays assignable. An inactive type cannot
-- reach any firm's picker, so this is what keeps the console clean.
update case_type_registry set active = false;
update case_type_registry set active = true
 where key in ('mva', 'prem', 'referral', 'motel_trafficking');

-- `prem` runs the GENERAL personal injury screen; premises was simply the first
-- family that used it. With the subtype question carrying the specifics, the
-- label an agent reads should say what it is. Key unchanged: reword freely,
-- never re-key, because the engine matches on the key.
update case_type_registry set label = 'Personal injury' where key = 'prem';

-- Names follow the labels.
update campaigns c
   set name = upper(f.slug) || ' ' ||
              coalesce(
                (select r.label from case_type_registry r where r.key = c.case_type),
                initcap(replace(c.case_type, '_', ' '))
              )
  from firms f
 where f.id = c.firm_id;

-- ---------------------------------------------------------------- firms
-- Only the two firms taking calls. ROTH and WLL stay as rows, just not pickable.
update firms set active = false where lower(slug) not in ('tmt', 'tmp');
update firms set active = true  where lower(slug) in ('tmt', 'tmp');

-- ---------------------------------------------------------------- verify
-- Exactly what an agent will see, and nothing else.
select upper(f.slug) as firm, c.name, c.case_type
  from campaigns c join firms f on f.id = c.firm_id
 where c.active and f.active
 order by f.slug, c.case_type;

select count(*) as active_campaigns_total from campaigns where active;
select key, label from case_type_registry where active order by sort, key;
