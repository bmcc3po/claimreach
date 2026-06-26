-- ============================================================================
-- ClaimReach — Phase 1 Foundation Migration
-- Project: gvtafevoisfxcfkugvoj ("Claim Reach", East US Ohio)
-- Multi-tenant-ready, single-tenant-seeded (TMP = firm #1)
-- RLS LOCKED from row one. NO USING(true) anywhere.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('owner','admin','agent','qa','firm');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Stages 1-6 are OURS (Innovative Intake). 7+ are firm-written.
  create type pipeline_stage as enum (
    'referral_received',
    'intake_attempted',
    'intake_in_progress',
    'intake_complete',
    'qa_verified',
    'sent_to_firm',
    'lor_sent',          -- firm-written
    'welcome_sent',      -- firm-written
    'signed_retained',   -- firm-written
    'in_litigation',     -- firm-written
    'closed',            -- terminal
    'declined',          -- terminal
    'duplicate'          -- terminal
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_kind as enum ('call','text_out','text_in','note','stage_change','system','doc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_confidence as enum ('exact','partial','landmark','none');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- FIRMS (tenants). One row for now: TMP.
-- ----------------------------------------------------------------------------
create table if not exists firms (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  lead_prefix   text not null default 'CR',   -- our minted lead # prefix
  lead_seq      bigint not null default 0,     -- per-firm running counter
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- APP USERS — maps Supabase auth.users -> firm + role.
-- Internal staff: firm_id = Innovative Intake's own firm row.
-- Firm portal users (TMP attorneys): firm_id = TMP, role = 'firm'.
-- ----------------------------------------------------------------------------
create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  firm_id     uuid not null references firms(id),
  role        app_role not null default 'agent',
  full_name   text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helper: current user's firm + role, read from app_users. SECURITY DEFINER so
-- RLS policies can call it without recursing into app_users' own policies.
create or replace function current_app_user()
returns table(uid uuid, firm_id uuid, role app_role)
language sql stable security definer set search_path = public as $$
  select id, firm_id, role from app_users where id = auth.uid()
$$;

create or replace function is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_users where id = auth.uid() and role in ('owner','admin','agent','qa'))
$$;

create or replace function role_is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_users where id = auth.uid() and role = 'firm')
$$;

create or replace function my_firm_id()
returns uuid language sql stable security definer set search_path = public as $$
  select firm_id from app_users where id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- LEADS — the atomic case. Own lead # + stored TMP/LR # alongside.
-- Once-per-claimant blocks live here (identity, recruitment, control,
-- trafficker, legal history, damages, emergency contact, narrative).
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  firm_id             uuid not null references firms(id),
  lead_no             text not null,            -- our minted canonical # (e.g. TMP-00001)
  firm_ref_no         text,                     -- TMP's docket #
  lawruler_ref_no     text,                     -- LR # if carried over
  case_type           text not null default 'motel_trafficking',
  stage               pipeline_stage not null default 'referral_received',
  qa_status           text not null default 'pending',
  supervisor_flag     boolean not null default false,
  assigned_agent      uuid references app_users(id),

  -- Caller / claimant identity
  claimant_name       text,
  caller_is_self      boolean,                  -- false => POA/NOK, confirm authority
  caller_relationship text,
  poa_nok_confirmed   boolean,
  phone               text,
  email               text,

  -- Comms safety (drives how anyone is allowed to contact this person)
  comms_monitored     boolean,                  -- monitored by spouse/trafficker?
  comms_safe_channels jsonb,                    -- ['text','call','vm'] that are safe
  comms_safe_window   text,                     -- safest time/method free text

  -- Emergency contact
  ec_name             text,
  ec_relationship     text,
  ec_phone            text,
  ec_email            text,
  ec_may_leave_msg    boolean,
  ec_message_script   text,

  -- Was someone controlling you (gate) + control/coercion (once)
  was_controlled      boolean,
  control_methods     jsonb,                    -- select-all
  could_refuse        boolean,
  had_phone_money_id  boolean,

  -- Recruitment (once, unless property variance overrides)
  trafficker_known    boolean,
  trafficker_names    text,
  trafficker_desc     jsonb,
  met_how             text,
  met_where           text,
  met_age             int,
  initial_relationship text,
  promises_made       jsonb,
  provided_early      jsonb,
  isolated_early      boolean,
  asked_to_travel     boolean,
  taken_where         text,
  time_to_commercial  text,
  topic_first_arose   text,
  used_deception      boolean,
  deception_detail    text,
  took_kept_items     jsonb,
  intro_other_victims boolean,

  -- Money flow (relationship-level, once)
  money_exchanged     boolean,
  money_recipients    jsonb,
  kept_any_money      boolean,
  harmed_if_short     boolean,

  -- Clinical (once)
  acts_types          jsonb,                    -- vaginal/anal/oral combo

  -- Legal / record history (once)
  felony_convicted    boolean,
  felony_count        text,                     -- 1 / 2-3 / 4+ / not sure
  felony_types        jsonb,
  felony_years        text,
  felony_during_traffic boolean,
  open_cases          text,
  open_case_status    text,
  bankruptcy          text,
  aliases             text,

  -- Appearance / red flags (once)
  other_solicit_locations text,
  clothing_types      jsonb,
  underdressed_public boolean,
  visibly_distressed_public boolean,

  -- Evidence (once)
  has_social_media    boolean,
  evidence_items      jsonb,

  -- Narrative + safety/damages (once)
  narrative           text,
  visible_to_staff    text,
  anything_missed     text,
  ongoing_safety      boolean,
  current_treatment   boolean,

  created_by          uuid references app_users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (firm_id, lead_no)
);

create index if not exists idx_leads_firm on leads(firm_id);
create index if not exists idx_leads_stage on leads(firm_id, stage);

-- ----------------------------------------------------------------------------
-- PROPERTIES CANONICAL — deduped real-world buildings (place_id keyed).
-- claimant_count = pattern-evidence strength per property.
-- brand_history (jsonb) supports brand-on-date research.
-- ----------------------------------------------------------------------------
create table if not exists properties_canonical (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references firms(id),
  place_id        text,                          -- Google Places id (stable key)
  name            text,
  address         text,
  city            text,
  state           text,
  lat             double precision,
  lng             double precision,
  current_brand   text,                          -- flag as it stands today
  brand_history   jsonb,                         -- [{brand, from, to}] research desk fills
  claimant_count  int not null default 0,
  created_at      timestamptz not null default now(),
  unique (firm_id, place_id)
);

create index if not exists idx_canon_firm on properties_canonical(firm_id);

-- ----------------------------------------------------------------------------
-- LEAD PROPERTIES — many per lead. The repeatable unit.
-- Per-property Hotel Knowledge (liability core) + variance toggle.
-- ----------------------------------------------------------------------------
create table if not exists lead_properties (
  id                    uuid primary key default gen_random_uuid(),
  firm_id               uuid not null references firms(id),
  lead_id               uuid not null references leads(id) on delete cascade,
  canonical_id          uuid references properties_canonical(id),
  sequence_order        int not null default 1,   -- victims moved between properties

  -- Identification (brand-on-date)
  remembered_brand      text,                     -- what claimant recalls (legally relevant)
  current_brand         text,                     -- what lookup says today
  brand_mismatch        boolean generated always as
                          (remembered_brand is distinct from current_brand
                           and remembered_brand is not null
                           and current_brand is not null) stored,
  name_as_recalled      text,

  -- Location
  address               text,
  cross_streets         text,
  city                  text,
  state                 text,
  place_id              text,
  lat                   double precision,
  lng                   double precision,
  loc_confidence        location_confidence,

  -- Stay detail
  stay_month            int,                      -- 1-12
  stay_year             int,
  stay_duration         text,
  room_floor            text,                     -- room# / floor / both / neither
  age_at_time           int,
  under_18              boolean,
  acts_count_here       text,

  -- Hotel Knowledge — CORE (always ask, even secondary properties)
  who_booked_paid       text,
  payment_method        text,                     -- cash / prepaid card
  men_per_day           text,
  asked_staff_for_help  boolean,
  asked_whom            jsonb,
  police_emt_called     boolean,

  -- Hotel Knowledge — DETAIL (expand for primary property)
  repeatedly_same_motel boolean,
  specific_rooms_req    boolean,
  room_change_freq      text,
  visitors_check_desk   text,                     -- desk vs straight to room
  men_waiting_areas     jsonb,                    -- lobby/hallway/parking
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
  staff_knowledge_other text,                     -- "anything else that made it obvious"

  -- Variance: did recruitment/control/trafficker differ at THIS property?
  has_variance          boolean not null default false,
  variance_notes        text,
  variance_trafficker   text,
  variance_control      jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_lp_lead on lead_properties(lead_id);
create index if not exists idx_lp_firm on lead_properties(firm_id);
create index if not exists idx_lp_canon on lead_properties(canonical_id);

-- ----------------------------------------------------------------------------
-- LEAD NOTES — append-only thread per lead.
-- ----------------------------------------------------------------------------
create table if not exists lead_notes (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  lead_id     uuid not null references leads(id) on delete cascade,
  author      uuid references app_users(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notes_lead on lead_notes(lead_id, created_at);

-- ----------------------------------------------------------------------------
-- LEAD ACTIVITY — calls, texts, stage changes, system events, docs.
-- JustCall call/text records land here against the lead.
-- ----------------------------------------------------------------------------
create table if not exists lead_activity (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid not null references firms(id),
  lead_id       uuid not null references leads(id) on delete cascade,
  kind          activity_kind not null,
  actor         uuid references app_users(id),
  body          text,                            -- text content / note / summary
  meta          jsonb,                           -- justcall ids, numbers, duration, recording url
  created_at    timestamptz not null default now()
);
create index if not exists idx_activity_lead on lead_activity(lead_id, created_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_leads_touch on leads;
create trigger trg_leads_touch before update on leads
  for each row execute function touch_updated_at();

drop trigger if exists trg_lp_touch on lead_properties;
create trigger trg_lp_touch before update on lead_properties
  for each row execute function touch_updated_at();

-- Mint lead_no atomically from firm counter.
create or replace function mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  update firms set lead_seq = lead_seq + 1
    where id = p_firm
    returning lead_seq, lead_prefix into nxt, pfx;
  return pfx || '-' || lpad(nxt::text, 5, '0');
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY  —  enabled on every table, scoped by firm + role.
-- Internal staff (owner/admin/agent/qa) see their OWN firm's rows
-- (Innovative Intake operates all firms' intake, so internal staff are
--  scoped to the firm the lead belongs to via their app_users.firm_id...
--  BUT internal staff need cross-firm access since II runs intake for many
--  firms). We model that explicitly below.
-- Firm users (role='firm') see ONLY their own firm_id, read-mostly, and may
-- write ONLY the firm-owned pipeline stages.
-- ============================================================================

alter table firms                 enable row level security;
alter table app_users             enable row level security;
alter table leads                 enable row level security;
alter table properties_canonical  enable row level security;
alter table lead_properties       enable row level security;
alter table lead_notes            enable row level security;
alter table lead_activity         enable row level security;

-- app_users: a user can read their own row; admins/owners read their firm.
drop policy if exists au_self_read on app_users;
create policy au_self_read on app_users for select
  using ( id = auth.uid() or is_internal() );

-- firms: internal staff read all firms; firm users read only their firm.
drop policy if exists firms_read on firms;
create policy firms_read on firms for select
  using ( is_internal() or id = my_firm_id() );

-- Generic predicate helper expressed inline per-table below.
-- INTERNAL staff: full access across firms (they run intake for everyone).
-- FIRM users: select-only, own firm only.

-- LEADS -----------------------------------------------------------------
drop policy if exists leads_internal_all on leads;
create policy leads_internal_all on leads for all
  using ( is_internal() ) with check ( is_internal() );

drop policy if exists leads_firm_read on leads;
create policy leads_firm_read on leads for select
  using ( firm_id = my_firm_id() );

-- Firm users may update ONLY their own firm's rows. To guarantee they can
-- change ONLY the pipeline stage (never clinical/PII columns) we enforce it
-- at the DATABASE level with a trigger, not just the API layer.
drop policy if exists leads_firm_update on leads;
create policy leads_firm_update on leads for update
  using ( role_is_firm() and firm_id = my_firm_id() )
  with check ( firm_id = my_firm_id() );

-- Stage-only guard: if the updater is a firm user, every column except
-- `stage` and `updated_at` must remain unchanged. Any other diff is rejected.
create or replace function firm_stage_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if role_is_firm() then
    if (to_jsonb(new) - 'stage' - 'updated_at')
       is distinct from (to_jsonb(old) - 'stage' - 'updated_at') then
      raise exception 'firm users may modify only the pipeline stage';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_firm_guard on leads;
create trigger trg_leads_firm_guard before update on leads
  for each row execute function firm_stage_only_guard();

-- PROPERTIES CANONICAL --------------------------------------------------
drop policy if exists canon_internal_all on properties_canonical;
create policy canon_internal_all on properties_canonical for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists canon_firm_read on properties_canonical;
create policy canon_firm_read on properties_canonical for select
  using ( firm_id = my_firm_id() );

-- LEAD PROPERTIES -------------------------------------------------------
drop policy if exists lp_internal_all on lead_properties;
create policy lp_internal_all on lead_properties for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists lp_firm_read on lead_properties;
create policy lp_firm_read on lead_properties for select
  using ( firm_id = my_firm_id() );

-- LEAD NOTES ------------------------------------------------------------
drop policy if exists notes_internal_all on lead_notes;
create policy notes_internal_all on lead_notes for all
  using ( is_internal() ) with check ( is_internal() );
-- firm users can read notes flagged firm-visible? For now: internal-only notes.
-- Firm gets activity feed, not internal notes. So NO firm read policy on notes.

-- LEAD ACTIVITY ---------------------------------------------------------
drop policy if exists activity_internal_all on lead_activity;
create policy activity_internal_all on lead_activity for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists activity_firm_read on lead_activity;
create policy activity_firm_read on lead_activity for select
  using ( firm_id = my_firm_id()
          and kind in ('stage_change','doc') );  -- firm sees stage + docs, not raw call/text bodies

-- ----------------------------------------------------------------------------
-- SEED: Innovative Intake (operator) + TMP (firm #1)
-- ----------------------------------------------------------------------------
insert into firms (slug, name, lead_prefix)
  values ('innovative-intake','Innovative Intake LLC','II')
  on conflict (slug) do nothing;

insert into firms (slug, name, lead_prefix)
  values ('tmp','Turnbull Moak & Pendergrass','TMP')
  on conflict (slug) do nothing;
