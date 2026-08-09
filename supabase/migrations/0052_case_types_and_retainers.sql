-- ============================================================================
-- 0052 CASE TYPES BECOME REAL, RETAINERS BECOME CAMPAIGN-SCOPED
--
-- Two problems this closes.
--
-- 1. Case type was hardcoded in two places that disagreed. The campaign dropdown
--    offered one vocabulary, the intake console looked up another, and the
--    case_type_registry table that was built for exactly this sat empty since
--    migration 0024. Everything now reads from the registry: campaign, console,
--    and the intake template. One vocabulary, one source.
--
--    A case type also carries default_form_key: the template a new campaign
--    inherits. That is the "here is my standard MVA intake, tell me what to
--    adjust" object. Campaigns inherit it by reference and fork a private copy
--    the moment someone customizes, so editing the master template can never
--    silently rewrite questions on a live signed campaign.
--
-- 2. Retainers were a free-for-all. Any file could be sent any retainer, which
--    is a legal problem, not a UX one. campaign_retainers tags which retainers
--    belong to a campaign; the picker only ever offers that set. A campaign can
--    legitimately hold several (per-state partners, per-diagnosis mass tort), so
--    this is a set, not a single value.
-- Idempotent.
-- ============================================================================

-- The template a campaign inherits for this case type.
alter table case_type_registry add column if not exists default_form_key text;
alter table case_type_registry add column if not exists sort int not null default 100;

-- Personal injury vocabulary. 'family' groups them for reporting.
-- Note deliberately absent: TBI, wrongful death, catastrophic. Those are things
-- that happen INSIDE a case, not case types. A file can be an MVA with a TBI; it
-- cannot be both an MVA and a TBI. They live as flags on the file.
insert into case_type_registry (key, label, family, sort) values
  ('mva',        'Motor vehicle accident',        'auto',      10),
  ('cmv',        'Commercial vehicle / trucking', 'auto',      20),
  ('mc',         'Motorcycle',                    'auto',      30),
  ('ped',        'Pedestrian',                    'auto',      40),
  ('rideshare',  'Rideshare',                     'auto',      50),
  ('prem',       'Premises liability',            'premises',  60),
  ('negsec',     'Negligent security',            'premises',  70),
  ('slipfall',   'Slip / trip and fall',          'premises',  80),
  ('dogbite',    'Dog bite / animal attack',      'premises',  90),
  ('medmal',     'Medical malpractice',           'medical',  100),
  ('birth',      'Birth injury',                  'medical',  110),
  ('nh',         'Nursing home neglect',          'medical',  120),
  ('prodliab',   'Product liability',             'product',  130),
  ('dramshop',   'Dram shop / liquor liability',  'premises', 140),
  ('construct',  'Construction accident',         'work',     150),
  ('maritime',   'Maritime / Jones Act',          'work',     160),
  ('wc',         'Workers compensation',          'work',     170),
  ('sa',         'Sexual abuse',                  'abuse',    180)
on conflict (key) do update set label = excluded.label, family = excluded.family, sort = excluded.sort;

-- Existing mass tort types keep working.
insert into case_type_registry (key, label, family, sort) values
  ('motel_trafficking', 'Motel trafficking',  'mass_tort', 200),
  ('pfas',              'PFAS',               'mass_tort', 210),
  ('bard_powerport',    'Bard PowerPort',     'mass_tort', 220)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- retainers
-- Which retainers a campaign is allowed to send. The agent picker is populated
-- from here and nowhere else.
create table if not exists campaign_retainers (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  label        text not null,                 -- what the agent sees: 'Tennessee', 'Kentucky'
  kind         text not null default 'text',  -- 'text' (retainer_templates) | 'pdf' (pdf_templates)
  template_id  uuid not null,
  is_default   boolean not null default false,
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_campaign_retainers_campaign on campaign_retainers(campaign_id) where active;

alter table campaign_retainers enable row level security;
do $$ begin
  create policy campaign_retainers_internal on campaign_retainers for all
    using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;

-- Carry forward whatever each campaign already had as its single default, so
-- nothing that works today stops working.
insert into campaign_retainers (campaign_id, label, kind, template_id, is_default, sort)
select c.id, 'Default retainer', 'text', c.retainer_template_id, true, 0
from campaigns c
where c.retainer_template_id is not null
  and not exists (select 1 from campaign_retainers r where r.campaign_id = c.id);
