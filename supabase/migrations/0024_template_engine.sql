-- ============================================================================
-- ClaimReach — 0024: Template engine. Per-case-type intake templates with a
-- LOCKED canonical spine baked in. Owner-only delete on spine; managers reorder
-- + add/edit/delete their own extras. Fields carry locking metadata.
-- ============================================================================

-- Mark a form as a canonical-spine template + track who seeded it.
alter table intake_forms add column if not exists is_template boolean not null default false;
alter table intake_forms add column if not exists family text;            -- third_party | first_party
alter table intake_forms add column if not exists seeded_from_canon boolean not null default false;

-- Field-level locking is stored INSIDE the fields jsonb on each field object:
--   locked: true        -> part of the canonical spine
--   origin: 'spine'|'preset'|'custom'
--   mandatory_gate: true -> the 3 always-on gates (represented / injured-party / authority)
--   hidden: true         -> manager hid an OPTIONAL spine field (not deleted)
--   added_by: <uuid>     -> who added a custom field (managers can delete their own)
-- No schema change needed for those; documented here so the app and DB agree.

-- A small registry so we know which canonical template exists per case type.
create table if not exists case_type_registry (
  key         text primary key,             -- 'mva', 'motel_trafficking', ...
  label       text not null,
  family      text not null default 'third_party',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table case_type_registry enable row level security;
drop policy if exists ctr_read on case_type_registry;
create policy ctr_read on case_type_registry for select using ( true );
drop policy if exists ctr_internal on case_type_registry;
create policy ctr_internal on case_type_registry for all using ( is_internal() ) with check ( is_internal() );

insert into case_type_registry (key, label, family) values
  ('motel_trafficking','Motel / Hotel Trafficking','third_party'),
  ('mva','MVA / Motor Vehicle Accident','third_party'),
  ('big_trucking','Big Trucking','third_party'),
  ('tbi','TBI / Traumatic Brain Injury','third_party'),
  ('medical_device','Medical Device Mass Tort','third_party'),
  ('pharma','Pharma / Drug Mass Tort','third_party'),
  ('consumer_product','Consumer Product Mass Tort','third_party'),
  ('environmental','Environmental / Toxic Exposure','third_party'),
  ('medmal','Medical Malpractice','third_party'),
  ('birth_injury','Birth Injury','third_party'),
  ('sex_abuse','Sex Abuse Mass Tort','third_party'),
  ('premises','Slip & Fall / Premises','third_party'),
  ('negligent_security','Negligent Security','third_party'),
  ('workplace','Workplace / Labor','third_party'),
  ('property_first_party','Property Damage (First-Party)','first_party'),
  ('bad_faith','Insurance Bad Faith','first_party'),
  ('storm_cat','Storm / CAT Event','first_party')
on conflict (key) do nothing;
