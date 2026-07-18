-- ============================================================================
-- 0053 TRIM THE CASE TYPES, ADD MODIFIERS
--
-- Case type answers "what kind of case is this" at the level that changes the
-- INTAKE and the PROCESS. Anything that varies within one of those is a
-- modifier, not a type. A commercial-vehicle MVA runs the same intake as any
-- other MVA; it just carries more value and routes for review. Making it a
-- separate type would mean a file could be an MVA and a CMV at once, which is
-- how the vocabulary rotted in the first place.
--
-- Kept: MVA, PREM, NEGSEC, SLIPFALL, DOGBITE, MEDMAL, BIRTH, PRODLIAB, SA.
-- Modifiers instead: CMV, MC, PED (all MVA), plus the universal severity ones.
-- Rideshare is not a type here: in this practice those run as SA claims.
-- Mass tort types stay untouched because live campaigns depend on them.
-- Idempotent.
-- ============================================================================

-- Retire the types we are not running. Deactivated, not deleted: any historical
-- file still carrying one keeps its label instead of turning into an orphan.
update case_type_registry set active = false
 where key in ('cmv','mc','ped','rideshare','dramshop','construct','maritime','wc','nh');

-- The referral bucket. TMT takes any matter and refers what it does not retain,
-- and a lead cannot exist without a campaign, so those calls need a real type to
-- hang one campaign off instead of five near-identical ones. The specific matter
-- (employment, family, criminal, contract) is recorded on the call itself.
insert into case_type_registry (key, label, family, sort) values
  ('referral', 'Network referral (non-retained matter)', 'referral', 190)
on conflict (key) do update set label = excluded.label, active = true;

-- ---------------------------------------------------------------- modifiers
create table if not exists case_modifier_registry (
  key         text primary key,
  label       text not null,
  applies_to  text[],          -- case type keys; null or empty means universal
  tone        text not null default 'neutral',  -- neutral | value | severity
  active      boolean not null default true,
  sort        int not null default 100
);

insert into case_modifier_registry (key, label, applies_to, tone, sort) values
  ('cmv',            'Commercial vehicle',        array['mva'], 'value',    10),
  ('mc',             'Motorcycle',                array['mva'], 'neutral',  20),
  ('ped',            'Pedestrian',                array['mva'], 'neutral',  30),
  ('tbi',            'Traumatic brain injury',    null,         'severity', 40),
  ('wrongful_death', 'Wrongful death',            null,         'severity', 50),
  ('catastrophic',   'Catastrophic injury',       null,         'severity', 60),
  ('hospitalized',   'Hospitalized 3+ days',      null,         'severity', 70),
  ('minor',          'Claimant was a minor',      null,         'neutral',  80)
on conflict (key) do update set label = excluded.label, applies_to = excluded.applies_to, tone = excluded.tone;

alter table case_modifier_registry enable row level security;
do $$ begin
  create policy cmr_internal on case_modifier_registry for all
    using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;

-- What this particular file carries.
alter table leads add column if not exists modifiers text[] not null default '{}';
create index if not exists idx_leads_modifiers on leads using gin (modifiers);
