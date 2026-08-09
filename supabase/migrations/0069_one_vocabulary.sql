-- ============================================================================
-- 0069 ONE CASE TYPE VOCABULARY, CAMPAIGN-SCOPED FORMS
--
-- Case type was defined in four places that could not agree:
--
--   1. case_type_registry, carrying TWO collided vocabularies. 0024 seeded
--      'premises', 'birth_injury', 'sex_abuse', 'negligent_security'. 0052
--      seeded 'prem', 'birth', 'sa', 'negsec' for the same concepts. The
--      `on conflict (key)` guard cannot dedupe different spellings of one idea,
--      so both sets went live.
--   2. CASE_TYPES, hardcoded in src/lib/intake-console/questions.ts.
--   3. /api/claim-types, returning the registry PLUS every published
--      intake_forms row, with no firm filter at all.
--   4. campaigns.case_type, the only one connected to real work.
--
-- What that produced in the product:
--   - Motel 6 appeared in TMT's console picker. TMT has no motel campaign. It
--     appeared because it is typed into an array in code.
--   - TMP's medmal and motel campaigns were active but unreachable: medmal is
--     absent from CASE_TYPES, and registryKeyFor() collapsed everything that is
--     not mva or prem into referral.
--   - beta_motel and testpcookai are published forms with no firm scope, so
--     they leaked into every firm's picker.
--
-- After this migration the registry is the only vocabulary, and a firm sees a
-- case type only when that firm has an active campaign for it. Motel 6 in TMT
-- becomes structurally impossible rather than filtered out.
--
-- Idempotent. Deactivates rather than deletes, so historical rows keep a
-- resolvable label instead of becoming orphans.
-- ============================================================================

-- ---------------------------------------------------------------- forms
-- Campaign-scoped forms. 0052 described forking in its comments but never
-- implemented it: intake_forms was unique on (firm_id, claim_type, version)
-- with no campaign column, so two campaigns on one firm and case type shared a
-- single row and editing either silently rewrote the other.
alter table intake_forms add column if not exists campaign_id uuid references campaigns(id) on delete cascade;

-- Ask order is not print order. Fields are stored in print order, the narrative
-- sequence exports and outbound synopses read from. ask_order is the sequence
-- the agent is walked through, tuned to kill a bad file fast.
alter table intake_forms add column if not exists ask_order jsonb not null default '[]'::jsonb;

-- Master = firm_id null AND campaign_id null. Fork = campaign_id set.
create index if not exists idx_intake_forms_campaign on intake_forms(campaign_id) where campaign_id is not null;
create unique index if not exists idx_intake_forms_master
  on intake_forms(claim_type, version) where firm_id is null and campaign_id is null;

-- The old uniqueness assumed one form per firm per type, which is exactly the
-- constraint that made per-campaign edits impossible.
alter table intake_forms drop constraint if exists intake_forms_firm_id_claim_type_version_key;

comment on column intake_forms.campaign_id is
  'Null = master form for the case type. Set = a private fork owned by one campaign, created on first edit.';
comment on column intake_forms.ask_order is
  'Field ids in the order they are ASKED. The fields array itself is in PRINT order.';

-- Junk that leaked into every firm's picker because /api/claim-types appended
-- published forms with no firm scope.
update intake_forms set status = 'draft'
 where claim_type in ('beta_motel', 'testpcookai');

-- ---------------------------------------------------------------- vocabulary
-- Remap live rows off duplicate spellings BEFORE deactivating them, so nothing
-- ends up pointing at an inactive key.
update campaigns    set case_type  = 'prem'   where case_type  = 'premises';
update leads        set case_type  = 'prem'   where case_type  = 'premises';
update claims       set claim_type = 'prem'   where claim_type = 'premises';
update intake_forms set claim_type = 'prem'   where claim_type = 'premises';

update campaigns    set case_type  = 'negsec' where case_type  = 'negligent_security';
update leads        set case_type  = 'negsec' where case_type  = 'negligent_security';
update claims       set claim_type = 'negsec' where claim_type = 'negligent_security';
update intake_forms set claim_type = 'negsec' where claim_type = 'negligent_security';

update campaigns    set case_type  = 'birth'  where case_type  = 'birth_injury';
update leads        set case_type  = 'birth'  where case_type  = 'birth_injury';
update claims       set claim_type = 'birth'  where claim_type = 'birth_injury';
update intake_forms set claim_type = 'birth'  where claim_type = 'birth_injury';

update campaigns    set case_type  = 'sa'     where case_type  = 'sex_abuse';
update leads        set case_type  = 'sa'     where case_type  = 'sex_abuse';
update claims       set claim_type = 'sa'     where claim_type = 'sex_abuse';
update intake_forms set claim_type = 'sa'     where claim_type = 'sex_abuse';

-- Duplicate spellings, now unreferenced.
update case_type_registry set active = false
 where key in ('premises', 'negligent_security', 'birth_injury', 'sex_abuse');

-- Not case types. big_trucking and tbi describe something that happens inside a
-- case: a file can be an MVA WITH a TBI, it cannot be both an MVA and a TBI.
-- They live as modifiers (0053), which is the correct call and is preserved.
update case_type_registry set active = false
 where key in ('big_trucking', 'tbi');

-- Retained in the registry but inactive until a real campaign needs one. An
-- inactive type cannot be assigned, so it cannot reach any firm's picker.
update case_type_registry set active = false
 where key in ('workplace', 'property_first_party', 'bad_faith', 'storm_cat',
               'environmental', 'pharma', 'consumer_product', 'medical_device');

-- Employment, family, criminal and contract were never case types. They are
-- referral matters: one campaign, with the specific matter recorded on the call.
update case_type_registry set active = false
 where key in ('employment', 'family', 'criminal', 'contract', 'other');

-- Canonical labels. The referral row was inserted twice with two labels and two
-- sorts (0053 and TMT_MONDAY_SETUP), so it gets stated once here.
update case_type_registry set label = 'Motor vehicle accident',              family = 'auto',      sort = 10,  active = true where key = 'mva';
update case_type_registry set label = 'Premises liability',                  family = 'premises',  sort = 20,  active = true where key = 'prem';
update case_type_registry set label = 'Medical malpractice',                 family = 'medical',   sort = 30,  active = true where key = 'medmal';
update case_type_registry set label = 'Motel trafficking',                   family = 'mass_tort', sort = 40,  active = true where key = 'motel_trafficking';
update case_type_registry set label = 'Network referral (non-retained)',     family = 'referral',  sort = 90,  active = true where key = 'referral';

-- ---------------------------------------------------------------- naming
-- Campaign display names were typed by two different setup scripts, which is
-- why 'TMP MVA' and 'Turnbull Moak and Pendergrass PREM' coexist. The name is
-- derived from the firm slug and the case type, never hand entered.
update campaigns c
   set name = upper(f.slug) || ' ' || upper(c.case_type)
  from firms f
 where f.id = c.firm_id;

-- ---------------------------------------------------------------- firms
-- The marketer that brought a client is its own fact. Encoding it in the slug
-- (123-abc) puts two facts in one string, so "everything 123 brought us" stops
-- being a query and ending that relationship changes the client's identifier.
alter table firms add column if not exists source text;
comment on column firms.source is
  'The marketer or referrer that brought this client. Not part of the slug.';

-- ---------------------------------------------------------------- verify
-- Every campaign points at an active registry row.
select c.case_type, count(*) as campaigns,
       bool_and(r.active) as registry_active
  from campaigns c
  left join case_type_registry r on r.key = c.case_type
 group by c.case_type
 order by c.case_type;

-- What each firm's console will offer, which is now exactly its campaigns.
select upper(f.slug) as firm, c.name, c.case_type, c.active
  from campaigns c join firms f on f.id = c.firm_id
 where c.active
 order by f.slug, c.case_type;
