-- ============================================================================
-- TMT MONDAY SETUP — run the checks first, then only the fixes you need.
-- Safe to run in the Supabase SQL editor. Nothing here deletes anything.
-- ============================================================================


-- ---------------------------------------------------------------- CHECK 1
-- Does a firm exist with the slug the console is configured for?
-- The console's firm picker uses slugs: tmt, tmp, roth.
-- If 'tmt' is missing, the console cannot find that firm's campaigns at all.
select id, slug, name from firms order by name;


-- ---------------------------------------------------------------- CHECK 2
-- What campaigns exist, under which firm, and for which case type?
-- The console looks for: firm_id = <the console's firm> AND case_type = 'mva' AND active = true
select c.name as campaign, c.case_type, c.active, f.slug as firm_slug, f.name as firm,
       c.allow_live_sign, c.retainer_template_id is not null as has_default_retainer
from campaigns c
join firms f on f.id = c.firm_id
order by f.name, c.name;


-- ---------------------------------------------------------------- CHECK 3
-- Is 'mva' actually in the case type registry? (migration 0052 populates it)
select key, label, active from case_type_registry where active order by sort;


-- ============================================================================
-- FIXES — run only what the checks above show is missing.
-- ============================================================================


-- ---------------------------------------------------------------- FIX A
-- No firm with slug 'tmt'. Create it.
-- If The Money Team already exists under a different slug, UPDATE instead of
-- inserting, so you do not end up with two firm records for one client:
--     update firms set slug = 'tmt' where name ilike '%money team%';
insert into firms (slug, name, lead_prefix)
select 'tmt', 'The Money Team Law Firm', 'TMT'
where not exists (select 1 from firms where slug = 'tmt');


-- ---------------------------------------------------------------- FIX B
-- No active MVA campaign for TMT. Create it.
-- allow_live_sign = true is what lets the retainer go out while the client is
-- still on the phone instead of waiting for a QA pass.
insert into campaigns (firm_id, name, case_type, active, allow_live_sign)
select f.id, 'TMT MVA', 'mva', true, true
from firms f
where f.slug = 'tmt'
  and not exists (
    select 1 from campaigns c
    where c.firm_id = f.id and c.case_type = 'mva' and c.active
  );


-- ---------------------------------------------------------------- FIX C
-- Turn live signing on for an MVA campaign that already exists.
update campaigns c
set allow_live_sign = true
from firms f
where c.firm_id = f.id and f.slug = 'tmt' and c.case_type = 'mva' and c.active;


-- ---------------------------------------------------------------- VERIFY
-- This should return exactly one row. If it does, the console can open a file.
-- can_sign_live tells you whether a retainer can go out on the call; that still
-- needs a retainer document attached to the campaign.
select f.name as firm, c.name as campaign, c.case_type, c.active,
       c.allow_live_sign as can_sign_live,
       exists (select 1 from campaign_retainers r where r.campaign_id = c.id and r.active) as has_tagged_retainer
from campaigns c
join firms f on f.id = c.firm_id
where f.slug = 'tmt' and c.case_type = 'mva' and c.active;

-- ---------------------------------------------------------------- TURNBULL
-- Same intake as TMT until told otherwise. The MVA form is global (firm_id
-- null, keyed on claim type), so TMP only needs a campaign pointed at 'mva'.
-- intake_template is left NULL on purpose: if it is set, it overrides case_type
-- and the campaign would resolve some other form.
insert into firms (slug, name, lead_prefix)
select 'tmp', 'Turnbull, Moak & Pendergrass', 'TMP'
where not exists (select 1 from firms where slug = 'tmp');

insert into campaigns (firm_id, name, case_type, active, allow_live_sign)
select f.id, 'TMP MVA', 'mva', true, true
from firms f
where f.slug = 'tmp'
  and not exists (
    select 1 from campaigns c where c.firm_id = f.id and c.case_type = 'mva' and c.active
  );

-- Clear any stale template override so it resolves the MVA script.
update campaigns c set intake_template = null
from firms f
where c.firm_id = f.id and f.slug in ('tmp','tmt') and c.case_type = 'mva';

-- Verify: both firms should return a row, same case type, no template override.
select f.name as firm, c.name as campaign, c.case_type, c.intake_template, c.active, c.allow_live_sign
from campaigns c join firms f on f.id = c.firm_id
where f.slug in ('tmt','tmp') and c.case_type = 'mva';

-- ---------------------------------------------------------------- ROTH
-- Same intake as TMT and Turnbull. The MVA form is global, so Roth needs only a
-- campaign pointed at 'mva' with no intake_template override.
insert into firms (slug, name, lead_prefix)
select 'roth', 'The Roth Law Firm', 'ROTH'
where not exists (select 1 from firms where slug = 'roth');

insert into campaigns (firm_id, name, case_type, active, allow_live_sign)
select f.id, 'Roth MVA', 'mva', true, true
from firms f
where f.slug = 'roth'
  and not exists (select 1 from campaigns c where c.firm_id = f.id and c.case_type = 'mva' and c.active);

update campaigns c set intake_template = null
from firms f
where c.firm_id = f.id and f.slug in ('tmt','tmp','roth') and c.case_type = 'mva';

-- All three firms should return a row with case_type mva and a null template.
select f.name as firm, c.name as campaign, c.case_type, c.intake_template, c.active, c.allow_live_sign
from campaigns c join firms f on f.id = c.firm_id
where f.slug in ('tmt','tmp','roth') and c.case_type = 'mva';

-- ---------------------------------------------------------------- REFERRAL
-- Employment, family, criminal, contract and "other" all route to one referral
-- campaign per firm. Without it the console refuses to open a file, because the
-- rule is that no lead exists without a campaign, and that rule is correct: it
-- is what stopped files landing in a void all year.
--
-- One campaign rather than five keeps the network response and the billing in a
-- single place.
insert into campaigns (firm_id, name, case_type, active, allow_live_sign)
select f.id, f.name || ' Referral', 'referral', true, false
from firms f
where f.slug in ('tmt','tmp','roth')
  and not exists (
    select 1 from campaigns c where c.firm_id = f.id and c.case_type = 'referral' and c.active
  );

-- Make sure the registry knows about it, or the picker will not offer it.
insert into case_type_registry (key, label, active, sort)
select 'referral', 'Referral / other matter', true, 90
where not exists (select 1 from case_type_registry where key = 'referral');

update case_type_registry set active = true where key = 'referral';

-- Verify: three firms, three referral campaigns.
select f.name as firm, c.name as campaign, c.case_type, c.active
from campaigns c join firms f on f.id = c.firm_id
where c.case_type = 'referral' order by f.name;
