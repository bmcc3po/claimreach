-- ============================================================================
-- ClaimReach — 0003: Person spine + self-contained claims
-- Shift: lead = the PERSON/file (shared identity, contact, vitals, legal history).
--        claim = a case under that person (own campaign, status, gates, answers,
--                properties). One person can hold many claims (PFAS + Bard, etc.).
-- Clean rebuild: no production data to preserve.
-- ============================================================================

-- Drop the old case-centric property/notes/activity that hung off leads as cases.
-- We re-create them hanging off claims (and keep notes/activity at lead level too).
drop table if exists lead_properties cascade;

-- ---------------------------------------------------------------------------
-- CLAIM ENUM
-- ---------------------------------------------------------------------------
do $$ begin
  create type claim_status as enum (
    'new','contact_attempted','in_progress','qualified','dq',
    'sent_to_firm','signed','dead','duplicate'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- LEADS becomes the PERSON SPINE.
-- Strip case-specific columns down to shared person/file info. We keep the
-- table (and its lead_no as the FILE number) but the case lives in claims.
-- Add person-level fields from the 1.0 Vitals card.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists address      text;
alter table leads add column if not exists best_time     text;
alter table leads add column if not exists language      text default 'English';
alter table leads add column if not exists est_value     numeric;
alter table leads add column if not exists pnc_relation  text;   -- injured party relationship
alter table leads add column if not exists pnc_status    text;   -- speaking_with_ip / deceased_ip / minor_ip

-- ---------------------------------------------------------------------------
-- CLAIMS — many per lead. Self-contained case.
-- answers jsonb holds the full questionnaire response for THIS claim's type,
-- so different claim types (trafficking, pfas, bard, medmal, mva) each store
-- their own answer set without schema churn.
-- ---------------------------------------------------------------------------
create table if not exists claims (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references firms(id),
  lead_id         uuid not null references leads(id) on delete cascade,
  claim_type      text not null default 'motel_trafficking',
  campaign        text,                      -- e.g. NGUYEN PFAS INNO
  status          claim_status not null default 'new',
  stage           pipeline_stage not null default 'referral_received',
  on_behalf_of    boolean default false,     -- self vs OBO
  is_this_file    boolean default true,      -- the active claim shown
  qualification   text default 'pending',    -- pending / clear / dq
  dq_reason       text,
  case_summary    text,
  primary_dx      text,                      -- primary diagnosis (medical torts)
  answers         jsonb default '{}'::jsonb, -- full questionnaire response set
  supervisor_flag boolean default false,
  firm_ref_no     text,
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_claims_lead on claims(lead_id);
create index if not exists idx_claims_firm on claims(firm_id);
create index if not exists idx_claims_status on claims(firm_id, status);

-- ---------------------------------------------------------------------------
-- CLAIM PROPERTIES — trafficking properties now hang off the CLAIM, not lead.
-- (Same shape as before; a claim of type motel_trafficking has properties.)
-- ---------------------------------------------------------------------------
create table if not exists claim_properties (
  id                    uuid primary key default gen_random_uuid(),
  firm_id               uuid not null references firms(id),
  claim_id              uuid not null references claims(id) on delete cascade,
  canonical_id          uuid references properties_canonical(id),
  sequence_order        int not null default 1,
  remembered_brand      text,
  current_brand         text,
  brand_mismatch        boolean generated always as
                          (remembered_brand is distinct from current_brand
                           and remembered_brand is not null
                           and current_brand is not null) stored,
  name_as_recalled      text,
  address               text,
  cross_streets         text,
  city                  text,
  state                 text,
  place_id              text,
  lat                   double precision,
  lng                   double precision,
  loc_confidence        location_confidence,
  landmarks             text,
  stay_month            int,
  stay_year             int,
  stay_duration         text,
  room_floor            text,
  age_at_time           int,
  under_18              boolean,
  acts_count_here       text,
  who_booked_paid       text,
  payment_method        text,
  men_per_day           text,
  asked_staff_for_help  boolean,
  asked_whom            jsonb,
  police_emt_called     boolean,
  repeatedly_same_motel boolean,
  specific_rooms_req    boolean,
  room_change_freq      text,
  visitors_check_desk   text,
  men_waiting_areas     jsonb,
  housekeeping_entered  boolean,
  towel_change_freq     text,
  sheet_change_freq     text,
  dnd_long_periods      boolean,
  condoms_visible       boolean,
  staff_interact_traffk boolean,
  staff_interact_victim boolean,
  mgmt_intervened       boolean,
  violence_public_areas boolean,
  drug_paraphernalia    boolean,
  staff_witnessed_drugs boolean,
  staff_knowledge_other text,
  has_variance          boolean not null default false,
  variance_notes        text,
  variance_trafficker   text,
  variance_control      jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_cp_claim on claim_properties(claim_id);
create index if not exists idx_cp_firm on claim_properties(firm_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_claims_touch on claims;
create trigger trg_claims_touch before update on claims
  for each row execute function touch_updated_at();
drop trigger if exists trg_cp_touch on claim_properties;
create trigger trg_cp_touch before update on claim_properties
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — same doctrine: internal full access, firm scoped + read-mostly.
-- ---------------------------------------------------------------------------
alter table claims            enable row level security;
alter table claim_properties  enable row level security;

drop policy if exists claims_internal_all on claims;
create policy claims_internal_all on claims for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists claims_firm_read on claims;
create policy claims_firm_read on claims for select
  using ( firm_id = my_firm_id() );

drop policy if exists cp_internal_all on claim_properties;
create policy cp_internal_all on claim_properties for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cp_firm_read on claim_properties;
create policy cp_firm_read on claim_properties for select
  using ( firm_id = my_firm_id() );
