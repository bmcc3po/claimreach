-- ============================================================================
-- 0072 VENUE IS A FIRM PROPERTY
--
-- A firm can only take a case it can actually file. Until now nothing checked:
-- `state` appeared in exactly one place in the engine, a display string in the
-- summary, and never touched disposition. TMT would have signed an MVA in any
-- state in the country.
--
-- A qualifying case outside the list is worked in FULL and referred, not
-- disqualified. The intake still runs, the file still counts, it just bypasses
-- the e-sign and routes to the network. Venue follows the INCIDENT, not where
-- the client lives: a Nevada resident hit in Tennessee is a Tennessee case.
--
-- Null or empty means the firm is unrestricted, which is the safe default for a
-- firm nobody has configured yet.
-- Idempotent.
-- ============================================================================
alter table firms add column if not exists venue_states text[];

comment on column firms.venue_states is
  'Two-letter states this firm can file in. Null or empty = unrestricted. A qualifying case outside this list is referred, not disqualified.';

-- TMT works New Mexico, Kentucky and Tennessee.
update firms set venue_states = array['NM','KY','TN'] where slug = 'tmt';

-- Verify.
select upper(slug) as firm, name, venue_states from firms order by slug;
