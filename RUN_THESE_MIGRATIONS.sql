-- ============================================================================
-- COMBINED MIGRATIONS 0030-0044. Run top to bottom in the Supabase SQL editor.
-- NOTE: 0043 adds the 'manager' enum value and is placed FIRST with a commit
-- so later statements can use it (Postgres forbids using a new enum value in
-- the same transaction that adds it). All statements are idempotent.
-- ============================================================================

-- ============================================================================
-- 0043 ADD MANAGER ROLE (enum value only)
-- MUST run and COMMIT before 0044, because Postgres forbids using a newly added
-- enum value in the same transaction that adds it. This file does nothing but
-- add the value. Run it by itself (or as the first statement), then run 0044.
-- Idempotent.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'manager'
  ) then
    alter type app_role add value 'manager' after 'admin';
  end if;
end $$;

commit;

-- ============================================================================
-- 0030 STATUS MODEL
-- Statuses become editable records (not a hardcoded enum) so the owner can add
-- and edit them in-app. Each status carries behavioral flags that drive the QA
-- pipeline, billing, and the firm visibility wall. Idempotent.
--   - statuses:         the controlled, owner-editable status set + flags
--   - lawruler_aliases: maps old LawRuler status strings to new keys for import
--   - dq_reasons:       controlled DQ-reason vocabulary (owner edits, agents pick)
-- Also converts claims.status from enum to text and backfills old values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- statuses
-- phase:    pre_qa | in_qa | post_qa | terminal
-- qualify:  qualify | disqualify | undetermined
-- side:     agent | qa | owner | firm | system
-- tone:     good | bad | warn | info | neut   (maps to StatusBadge colors)
-- ---------------------------------------------------------------------------
create table if not exists statuses (
  key            text primary key,
  label          text not null,
  track          text not null default 'none',     -- esign | nosig | intake | firm | terminal | none
  phase          text not null default 'pre_qa',
  tone           text not null default 'neut',
  side           text not null default 'agent',
  qualify        text not null default 'undetermined',
  requires_esign boolean not null default false,
  billable       boolean not null default false,
  unlocks_firm   boolean not null default false,
  is_final       boolean not null default false,
  lawruler_group text,
  sort           int not null default 100,
  active         boolean not null default true,
  system_locked  boolean not null default false,    -- core pipeline statuses can't be deleted
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Seed (upsert so re-running keeps the owner's later edits to non-key fields
-- only on first insert; on conflict we leave existing rows alone).
insert into statuses
  (key, label, track, phase, tone, side, qualify, requires_esign, billable, unlocks_firm, is_final, lawruler_group, sort, system_locked)
values
  -- INTAKE
  ('new',             'New',                 'intake',   'pre_qa',   'neut', 'agent',  'undetermined', false, false, false, false, 'New/Open',       10,  true),
  ('contacting',      'Contacting',          'intake',   'pre_qa',   'info', 'agent',  'undetermined', false, false, false, false, 'New/Open',       20,  true),
  -- E-SIGN TRACK
  ('esign_sent',      'e-Sign Sent',         'esign',    'pre_qa',   'warn', 'agent',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 30,  true),
  ('signed_grievous', 'Signed: Grievous',    'esign',    'in_qa',    'warn', 'system', 'undetermined', true,  false, false, false, 'Wanted/Chasing', 40,  true),
  ('signed_qa',       'Signed: QA',          'esign',    'in_qa',    'warn', 'qa',     'undetermined', true,  false, false, false, 'Wanted/Chasing', 50,  true),
  ('signed_wip',      'Signed: WIP',         'esign',    'in_qa',    'warn', 'agent',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 60,  true),
  ('signed_flag',     'Signed: Flag BMC',    'esign',    'in_qa',    'bad',  'owner',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 70,  true),
  ('signed_approved', 'Signed: Approved',    'esign',    'post_qa',  'good', 'firm',   'qualify',      true,  true,  true,  false, 'Clients',        80,  true),
  ('signed_dropped',  'Signed: Drop Letter', 'esign',    'terminal', 'bad',  'firm',   'disqualify',   true,  true,  false, true,  'Rejected',       90,  true),
  -- NO-SIG TRACK
  ('grievous',        'Grievous',            'nosig',    'in_qa',    'warn', 'system', 'undetermined', false, false, false, false, 'Wanted/Chasing', 100, true),
  ('qa',              'QA',                  'nosig',    'in_qa',    'warn', 'qa',     'undetermined', false, false, false, false, 'Wanted/Chasing', 110, true),
  ('wip',             'WIP',                 'nosig',    'in_qa',    'warn', 'agent',  'undetermined', false, false, false, false, 'Wanted/Chasing', 120, true),
  ('flag',            'Flag BMC',            'nosig',    'in_qa',    'bad',  'owner',  'undetermined', false, false, false, false, 'Wanted/Chasing', 130, true),
  ('approved',        'Approved',            'nosig',    'post_qa',  'good', 'firm',   'qualify',      false, true,  true,  false, 'Clients',        140, true),
  ('dq_billable',     'DQ Billable',         'nosig',    'terminal', 'bad',  'firm',   'disqualify',   false, true,  false, true,  'Rejected',       150, true),
  -- FIRM-SIDE
  ('delivered',       'Delivered to Firm',   'firm',     'post_qa',  'info', 'firm',   'qualify',      false, false, true,  false, 'Referred',       160, true),
  ('retained',        'Retained',            'firm',     'post_qa',  'good', 'firm',   'qualify',      false, false, true,  false, 'Clients',        170, true),
  -- TERMINAL (non-billable)
  ('dq',              'DQ',                  'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'Rejected',       180, true),
  ('not_interested',  'Not Interested',      'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'New/Open',       190, true),
  ('dnc',             'Do Not Call',         'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'New/Open',       200, true),
  ('duplicate',       'Duplicate',           'terminal', 'terminal', 'neut', 'agent',  'disqualify',   false, false, false, true,  'New/Open',       210, true),
  ('dead',            'Dead',                'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'Closed',         220, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Convert claims.status enum -> text so any status key is valid.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'claims' and column_name = 'status' and udt_name = 'claim_status'
  ) then
    alter table claims alter column status drop default;
    alter table claims alter column status type text using status::text;
    alter table claims alter column status set default 'new';
  end if;
end $$;

-- Backfill old enum values to the new keys.
update claims set status = 'contacting'  where status = 'contact_attempted';
update claims set status = 'approved'    where status = 'qualified';
update claims set status = 'delivered'   where status = 'sent_to_firm';
update claims set status = 'signed_approved' where status = 'signed';
-- 'new','in_progress','dq','dead','duplicate' already valid keys
update claims set status = 'contacting'  where status = 'in_progress';

-- The queryable DQ-reason tag (keep the existing free-text dq_reason too).
alter table claims add column if not exists dq_reason_key text;

-- ---------------------------------------------------------------------------
-- lawruler_aliases: old LawRuler status string -> new status key (for import).
-- ---------------------------------------------------------------------------
create table if not exists lawruler_aliases (
  alias       text primary key,            -- exact LawRuler status text
  status_key  text not null references statuses(key),
  created_at  timestamptz not null default now()
);

insert into lawruler_aliases (alias, status_key) values
  ('Signed & Awaiting Secondary',                'signed_qa'),
  ('INBOUND',                                    'new'),
  ('ROTH VOICEMAIL TRANSFER',                    'new'),
  ('ROTH LIVE TRANSFER',                         'new'),
  ('Signed Sent Awaiting Firm Approval',         'delivered'),
  ('spanish_lead',                               'contacting'),
  ('Intake Questionnaire Completed (Default)',   'contacting'),
  ('Secondary Intake OK COMPLETE',               'approved'),
  ('Secondary Intake DQ COMPLETE',               'dq_billable'),
  ('TRANSFER TO FIRM SUCCESSFUL',                'retained'),
  ('TRANSFER TO FIRM -NO ANSWER',                'dead'),
  ('On Call with PNC',                           'contacting'),
  ('Contact Attempted (Default)',                'contacting'),
  ('Scheduled Appointment (Default)',            'contacting'),
  ('Not Interested',                             'not_interested'),
  ('Disqualified (Default)',                     'dq'),
  ('Already Represented',                        'dq'),
  ('Wrong Number',                               'dq'),
  ('Duplicate Lead',                             'duplicate'),
  ('DO NOT CALL REQUEST',                        'dnc'),
  ('Sent e-Sign (Default)',                      'esign_sent'),
  ('Signed e-Sign (Default)',                    'signed_grievous'),
  ('Cancelled E-Sign (Default)',                 'contacting'),
  ('Signed E-Sign QA Verification',              'signed_qa'),
  ('Signed E-Sign WIP',                          'signed_wip'),
  ('Flag for BMC',                               'signed_flag'),
  ('SIGNED READY TO SEND',                       'signed_approved'),
  ('Signed ESign Sent To Firm',                  'delivered'),
  ('STF',                                        'dead'),
  ('Intake Questionnaire Emailed (Default)',     'contacting'),
  ('Secondary DQ Sent to Firm',                  'dq_billable'),
  ('Secondary OK Sent To Firm',                  'delivered'),
  ('Signed E-Sign Already Sent',                 'signed_grievous'),
  ('SIGNED & DECLINED',                          'signed_dropped'),
  ('DROP LETTER',                                'signed_dropped'),
  ('New Lead (Default)',                         'new'),
  ('IB CALL',                                    'new'),
  ('New Listing',                                'new'),
  ('Referral Accepted (Default)',                'delivered'),
  ('Referral Declined (Default)',                'dq'),
  ('Test Lead',                                  'new'),
  ('Pending Review',                             'qa')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- dq_reasons: controlled vocabulary, owner-editable, agents pick only.
-- active=false retires a reason without losing history (key stays queryable).
-- ---------------------------------------------------------------------------
create table if not exists dq_reasons (
  key        text primary key,
  label      text not null,
  category   text not null default 'Other',
  sort       int not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into dq_reasons (key, label, category, sort) values
  ('sol',           'SOL',           'Eligibility',    10),
  ('diagnosis',     'Diagnosis',     'Medical',        20),
  ('already_rep',   'Already Rep',   'Representation',  30),
  ('criteria',      'Criteria',      'Eligibility',    40),
  ('prior_signup',  'Prior Signup',  'Representation',  50),
  ('location',      'Location',      'Eligibility',    60),
  ('duplicate',     'Duplicate',     'Contact',        70),
  ('no_contact',    'No Contact',    'Contact',        80),
  ('other',         'Other',         'Other',          90)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: everyone authenticated can read these config tables; only owner/admin
-- write. (Mutations also go through the API with supabaseAdmin, but lock anyway.)
-- ---------------------------------------------------------------------------
alter table statuses        enable row level security;
alter table lawruler_aliases enable row level security;
alter table dq_reasons      enable row level security;

do $$ begin
  create policy statuses_read on statuses for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy aliases_read on lawruler_aliases for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dq_reasons_read on dq_reasons for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0031 AUTOMATION ENGINE
-- One automation = trigger + conditions + ordered steps, with guardrails and
-- stop conditions. A worklist (automation_queue) holds future step executions;
-- a cron drains rows whose run_at has passed. Idempotent.
-- ============================================================================

create table if not exists automations (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid references firms(id),
  name            text not null,
  active          boolean not null default false,
  trigger_type    text not null,                       -- status_changed | lead_created | no_contact_timer | client_replied | esign_sent | esign_viewed | esign_signed | time_of_day
  trigger_config  jsonb not null default '{}'::jsonb,  -- e.g. { to: 'signed_qa', from: null } or { hours: 24 } or { at: '09:00', days: ['mon'..] }
  conditions      jsonb not null default '{}'::jsonb,  -- { match:'all'|'any', rules:[{field,op,value}] }
  steps           jsonb not null default '[]'::jsonb,  -- ordered: [{type, config}]
  stop_conditions jsonb not null default '[]'::jsonb,  -- ['on_reply','on_status_change','on_sign','on_dq']
  send_window     jsonb not null default '{}'::jsonb,  -- { mode:'lead_tz'|'fixed', start:'08:00', end:'20:00', tz:'America/Los_Angeles', days:['mon'..'fri'] }
  retrigger       boolean not null default false,      -- allow re-fire on re-entry vs once per lead
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_automations_trigger on automations(trigger_type, active);

-- A run = one lead moving through one automation's steps.
create table if not exists automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  firm_id       uuid references firms(id),
  lead_id       uuid not null references leads(id) on delete cascade,
  state         text not null default 'active',        -- active | done | stopped
  current_step  int not null default 0,
  stop_reason   text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists idx_runs_lead on automation_runs(lead_id);
create index if not exists idx_runs_state on automation_runs(state);
-- One active run per (automation, lead) unless retrigger is on; enforced in code.
create index if not exists idx_runs_auto_lead on automation_runs(automation_id, lead_id, state);

-- The worklist: each future step execution is a queued row with a run_at.
create table if not exists automation_queue (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references automation_runs(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  lead_id     uuid not null references leads(id) on delete cascade,
  firm_id     uuid references firms(id),
  step_index  int not null,
  run_at      timestamptz not null,
  state       text not null default 'pending',         -- pending | done | skipped | failed
  payload     jsonb not null default '{}'::jsonb,
  result      jsonb,
  created_at  timestamptz not null default now(),
  ran_at      timestamptz
);
create index if not exists idx_queue_due on automation_queue(state, run_at);
create index if not exists idx_queue_run on automation_queue(run_id);

-- Append-only per-run event log (also mirrored into the file Activity Log).
create table if not exists automation_events (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references automation_runs(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  lead_id       uuid references leads(id) on delete cascade,
  kind          text not null,                          -- enqueued | step_run | step_skipped | stopped | error
  detail        text,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_auto_events_run on automation_events(run_id);

-- A convenience view of due queue rows for the cron.
create or replace view automation_queue_due as
  select q.*, a.steps, a.stop_conditions, a.send_window, a.name as automation_name
  from automation_queue q
  join automations a on a.id = q.automation_id
  where q.state = 'pending' and q.run_at <= now() and a.active = true;

-- RLS: staff read their firm's automations; writes go through the API (admin).
alter table automations enable row level security;
do $$ begin
  create policy automations_read on automations for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0032 QA PIPELINE
-- Grievous (AI) reviews then a human QA reviews. Both fill the same 5-axis
-- report card so Brett sees AI vs human grades per agent. QA routes the file
-- (approve / decline-drop-letter / back-to-WIP / flag-BMC). Internal QA and
-- Grievous notes to the agent are NEVER firm-visible. Idempotent.
-- ============================================================================

-- Human QA review record. One per QA pass; re-reviews add new rows.
create table if not exists qa_reviews (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  claim_id      uuid references claims(id) on delete cascade,
  firm_id       uuid references firms(id),
  reviewer      uuid references app_users(id),
  reviewer_name text,
  -- hard gates (green/yellow/red): any red blocks approve
  g_qa_pass     text,           -- green | yellow | red
  g_esign       text,
  g_criteria    text,
  -- coaching grades (recorded, NOT firm-visible)
  c_leading     text,
  c_complete    text,
  qa_note       text,           -- general QA note (internal)
  agent_note    text,           -- QA -> agent coaching note (firm NEVER sees)
  decision      text,           -- approve | decline | wip | flag
  dq_reason_key text,           -- when decision routes to a DQ/drop status
  created_at    timestamptz not null default now()
);
create index if not exists idx_qa_reviews_lead on qa_reviews(lead_id, created_at desc);

-- A unified report-card view across Grievous + QA so agent grades line up.
-- grader = 'grievous' | 'qa'
create table if not exists report_cards (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  agent_id    uuid references app_users(id),
  agent_name  text,
  grader      text not null,    -- grievous | qa
  qa_pass     text,
  esign       text,
  criteria    text,
  leading_flag text,
  complete    text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_report_cards_agent on report_cards(agent_id, created_at desc);
create index if not exists idx_report_cards_lead on report_cards(lead_id);

-- If a prior run created the column under its old reserved-word name, rename it.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'report_cards' and column_name = 'leading') then
    alter table report_cards rename column "leading" to leading_flag;
  end if;
end $$;

-- Internal two-way comms thread per file between Grievous/QA and the agent.
-- Firm NEVER sees these (separate from notes scope='message' client comms).
create table if not exists qa_thread (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  firm_id     uuid references firms(id),
  author      uuid references app_users(id),
  author_name text,
  author_role text,             -- qa | grievous | agent | owner
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_qa_thread_lead on qa_thread(lead_id, created_at);

-- Grievous recommended verdict tag carried into Awaiting QA (his "call").
alter table claims add column if not exists grievous_verdict text;   -- wip | flag | ready
alter table leads  add column if not exists qa_pending boolean not null default false;       -- in QA queue
alter table leads  add column if not exists wip_pending boolean not null default false;       -- in agent fix inbox

-- RLS: internal-only tables.
alter table qa_reviews   enable row level security;
alter table report_cards enable row level security;
alter table qa_thread    enable row level security;
do $$ begin
  create policy qa_reviews_internal on qa_reviews for all using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy report_cards_internal on report_cards for all using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy qa_thread_internal on qa_thread for all using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0033 FIX: force claims.status from enum to text
-- 0030's conditional conversion did not match in this database, so claims.status
-- is still the claim_status enum and rejects new status keys (e.g. "signed_flag").
-- This converts it unconditionally, backfills old values, then drops the enum.
-- Idempotent and safe to run whether or not 0030's block ran.
-- ============================================================================

-- 1) If status is still an enum (or anything non-text), convert to text.
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_name = 'claims' and column_name = 'status';

  if col_type is distinct from 'text' then
    execute 'alter table claims alter column status drop default';
    execute 'alter table claims alter column status type text using status::text';
    execute 'alter table claims alter column status set default ''new''';
  end if;
end $$;

-- 2) Backfill old enum values to new keys (now that the column accepts text).
update claims set status = 'contacting'      where status = 'contact_attempted';
update claims set status = 'contacting'      where status = 'in_progress';
update claims set status = 'approved'        where status = 'qualified';
update claims set status = 'delivered'       where status = 'sent_to_firm';
update claims set status = 'signed_approved' where status = 'signed';

-- 3) Drop the now-unused enum type so nothing silently re-binds to it.
do $$
begin
  if exists (select 1 from pg_type where typname = 'claim_status') then
    -- Only drop if no column still uses it.
    if not exists (
      select 1 from information_schema.columns
      where udt_name = 'claim_status'
    ) then
      drop type claim_status;
    end if;
  end if;
end $$;

-- 4) Safety: make sure the leads.status (if present) is text too, since some
-- legacy reads fall back to it.
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_name = 'leads' and column_name = 'status';

  if col_type is not null and col_type is distinct from 'text' then
    execute 'alter table leads alter column status type text using status::text';
  end if;
end $$;
-- ============================================================================
-- 0034 RETAINER CASE-TYPE BINDING
-- Retainer templates (text and PDF) can be tied to a case type, with one marked
-- default per case type. On a file, the matching default pre-selects; one-offs
-- are still pickable. case_type NULL / 'any' = available on every case type.
-- ============================================================================

alter table retainer_templates add column if not exists case_type text;       -- e.g. bard_powerport, motel_trafficking, NULL/'any'
alter table retainer_templates add column if not exists is_default boolean not null default false;

alter table pdf_templates add column if not exists case_type text;
alter table pdf_templates add column if not exists is_default boolean not null default false;

-- At most one default per case type is enforced in the API (clearing siblings on
-- set), not by a DB constraint, so 'any' defaults can coexist with type defaults.
create index if not exists idx_retainer_tpl_case on retainer_templates(case_type);
create index if not exists idx_pdf_tpl_case on pdf_templates(case_type);
-- ============================================================================
-- 0035 SLA THRESHOLDS + ALERTS
-- Configurable thresholds for "dragging" files. The alert set is DERIVED at read
-- time from leads/claims + these thresholds (no stored alert rows to go stale).
-- ============================================================================

create table if not exists sla_settings (
  id                    int primary key default 1,
  no_contact_hours      int not null default 24,   -- new lead, no outbound contact
  qa_stuck_hours        int not null default 48,   -- sitting in QA queue
  signed_unreviewed_hours int not null default 24, -- signed but not QA-reviewed
  stage_stale_hours     int not null default 72,   -- any in-progress stage with no movement
  updated_at            timestamptz not null default now(),
  constraint sla_singleton check (id = 1)
);
insert into sla_settings (id) values (1) on conflict (id) do nothing;

alter table sla_settings enable row level security;
do $$ begin
  create policy sla_read on sla_settings for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Track when a file entered the QA queue so "stuck in QA" is measurable.
alter table leads add column if not exists qa_entered_at timestamptz;
-- Track when a file was signed so "signed but unreviewed" is measurable.
alter table leads add column if not exists signed_at timestamptz;
-- ============================================================================
-- 0036 REPORT PRESETS
-- Saved Status Report configurations (LawRuler-style), per user.
-- ============================================================================
create table if not exists report_presets (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references app_users(id) on delete cascade,
  firm_id     uuid references firms(id),
  name        text not null,
  config      jsonb not null default '{}'::jsonb,  -- { statuses:[], caseTypes:[], from, to, dateField, assignee, source }
  created_at  timestamptz not null default now()
);
create index if not exists idx_report_presets_owner on report_presets(owner);

alter table report_presets enable row level security;
do $$ begin
  create policy report_presets_own on report_presets for all
    using (owner = auth.uid()) with check (owner = auth.uid());
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0037 CAMPAIGNS
-- A campaign is a firm-specific deployment of a case type. "TMP MVA" = Turnbull
-- running MVA. The same type (MVA) can power many campaigns across firms. A
-- campaign carries the firm, case type, intake template, default retainer, and
-- tier/billing rules so Add lead only needs first/last name + campaign.
-- ============================================================================

create table if not exists campaigns (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                       -- "TMP MVA"
  firm_id            uuid references firms(id),            -- which firm/attorney
  case_type          text not null,                        -- "mva" (the reusable type)
  intake_template    text,                                 -- claim_type key for intake form resolution
  retainer_template_id uuid references retainer_templates(id),
  tier               text,                                 -- A/B/C... default tier for this campaign
  bill_rate          numeric(10,2),                        -- per-sign billing rate
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_campaigns_firm on campaigns(firm_id);
create index if not exists idx_campaigns_active on campaigns(active);

-- Tie a lead to its campaign (campaign carries firm + type downstream).
alter table leads add column if not exists campaign_id uuid references campaigns(id);
-- Display name of the campaign at time of intake (denormalized for the list view).
alter table leads add column if not exists campaign text;

alter table campaigns enable row level security;
do $$ begin
  create policy campaigns_read on campaigns for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0038 E-SIGN CEREMONY (Stage 1)
-- Extend signable_documents for a DocuSign-grade in-house signing ceremony:
-- envelope id, document hash, sender + signer IPs, viewed/consent timestamps,
-- signature type (drawn|typed), and the consent record.
-- ============================================================================

alter table signable_documents add column if not exists envelope_id text;     -- short human envelope id, e.g. CR-7F3K9Q
alter table signable_documents add column if not exists doc_hash text;         -- sha-256 of the source document bytes/body
alter table signable_documents add column if not exists sender_ip text;        -- IP of the agent who sent it
alter table signable_documents add column if not exists viewed_ip text;        -- IP first time the signer opened it
alter table signable_documents add column if not exists signature_type text;   -- drawn | typed
alter table signable_documents add column if not exists consent_at timestamptz;-- when signer accepted E-SIGN consent
alter table signable_documents add column if not exists pdf_template_id uuid references pdf_templates(id) on delete set null; -- when signing an uploaded PDF
alter table signable_documents add column if not exists cert_pdf_url text;     -- Certificate of Completion (Stage 2)

-- Backfill envelope ids for any existing rows that lack one.
update signable_documents
  set envelope_id = 'CR-' || upper(substr(md5(id::text), 1, 6))
  where envelope_id is null;

create unique index if not exists idx_signable_envelope on signable_documents(envelope_id);

-- Storage bucket for completion certificates and signed PDFs (Stage 2).
insert into storage.buckets (id, name, public)
  values ('signed-docs', 'signed-docs', true)
  on conflict (id) do nothing;
-- ============================================================================
-- 0039 PDF RETAINER: campaign binding + autofill
-- PDF templates can bind to a campaign (and already to case_type from 0034) so
-- they show on the right files. Per-field autofill mapping (which merge token a
-- text field pulls) lives inside the existing fields jsonb as field.mapTo, so no
-- column is needed for that.
-- ============================================================================

alter table pdf_templates add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create index if not exists idx_pdf_tpl_campaign on pdf_templates(campaign_id);

-- Retainer text templates can also bind to a campaign (case_type already exists).
alter table retainer_templates add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create index if not exists idx_retainer_tpl_campaign on retainer_templates(campaign_id);
-- ============================================================================
-- 0040 KEYSTONE REWIRE: campaign is the spine.
-- A claim = a client's enrollment under ONE campaign. The campaign owns the
-- intake questionnaire, the retainer packet, and whether e-sign is required.
-- This migration adds the structural links so intake/retainer/track all resolve
-- from the campaign instead of being guessed off case_type.
-- ============================================================================

-- 1) Tie each claim to its campaign (the enrollment link).
alter table claims add column if not exists campaign_id uuid references campaigns(id);
create index if not exists idx_claims_campaign on claims(campaign_id);

-- 2) Campaign-level e-sign switch: picks the signed_/no-sign status track.
alter table campaigns add column if not exists esign_required boolean not null default true;

-- 3) Campaign owns the retainer PACKET (retainer + HIPAA + HITECH + any extras),
--    an ordered list of pdf_template ids and/or retainer_template ids. Kept as
--    jsonb so a packet can mix text + PDF docs. Shape:
--    [{ "kind":"pdf"|"text", "id":"<uuid>", "label":"Retainer" }, ...]
alter table campaigns add column if not exists retainer_packet jsonb not null default '[]';

-- 4) Backfill: set each claim's campaign_id from its lead's campaign_id.
update claims c
  set campaign_id = l.campaign_id
  from leads l
  where c.lead_id = l.id and c.campaign_id is null and l.campaign_id is not null;

-- 5) Dedup-override audit fields on the claim (P1-4): when an agent adds a 2nd
--    claim of the SAME case type, they must justify it; QA sees a persistent alarm
--    and must acknowledge before approve.
alter table claims add column if not exists dup_override boolean not null default false;
alter table claims add column if not exists dup_override_reason text;
alter table claims add column if not exists dup_override_by uuid;
alter table claims add column if not exists dup_override_at timestamptz;
alter table claims add column if not exists dup_ack_by uuid;      -- QA who acknowledged
alter table claims add column if not exists dup_ack_at timestamptz;

-- 6) Retainer PACKET signing: docs in one packet share a packet_group so signing
--    the session applies the signature across all docs (retainer + HIPAA + HITECH)
--    in the single 5-tap ceremony.
alter table signable_documents add column if not exists packet_group text;
alter table signable_documents add column if not exists packet_seq int;
alter table signable_documents add column if not exists completed_pdf_url text;
create index if not exists idx_signable_packet on signable_documents(packet_group);
-- ============================================================================
-- 0041 GLOBAL LEAD NUMBERING
-- The lead number is ONE global sequence in creation order (1001, 1002, 1003...)
-- across ALL firms. The firm prefix is vanity only (TMP-1002, WLL-1003) and has
-- NO effect on the number. This means:
--   - an agent can search just "1002" and find the file,
--   - audit pulls work globally: "everything from 200 to 1200" = one ascending
--     range across every firm, because the counter is shared.
-- ============================================================================

-- One global counter for all lead numbers, starting at 1001.
create sequence if not exists global_lead_seq start with 1001 increment by 1;

-- Make sure the column that holds a firm's vanity prefix exists and is sane.
alter table firms add column if not exists lead_prefix text not null default 'CR';

-- Rewrite minting: firm prefix (vanity) + the GLOBAL number (the real id).
create or replace function mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  select coalesce(lead_prefix, 'CR') into pfx from firms where id = p_firm;
  if pfx is null then pfx := 'CR'; end if;
  nxt := nextval('global_lead_seq');   -- GLOBAL, not per-firm
  return pfx || '-' || nxt::text;       -- e.g. TMP-1002, WLL-1003
end $$;

-- Seed the known firms' vanity prefixes (safe no-ops if the names differ).
update firms set lead_prefix = 'TMP'
  where lead_prefix = 'CR' and (name ilike '%turnbull%' or name ilike '%moak%' or name ilike '%pendergrass%' or name ilike '%tmp%');
update firms set lead_prefix = 'WLL'
  where lead_prefix = 'CR' and (name ilike '%west loop%' or name ilike '%westloop%' or name ilike '%wll%');
-- ============================================================================
-- 0042 FIRM DELIVERY
-- Automated handoff to the firm when a file reaches an unlocks_firm status.
-- Config lives on the campaign (the spine): where to send, the mail-merged
-- email template, and which of the four artifacts to attach. A per-lead guard
-- (firm_sent_at) prevents double-sends; a deliveries log records every attempt.
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campaign-level firm delivery config.
--   firm_email        primary recipient (the firm intake inbox)
--   firm_cc           comma-separated additional recipients (default empty)
--   firm_reply_to     optional reply-to (defaults to EMAIL_FROM if blank)
--   firm_subject_tpl  mail-merge subject template ({{contact.full_name}} etc.)
--   firm_body_tpl     mail-merge HTML/text body template
--   attach_intake_pdf  toggle: intake Q&A as a PDF
--   attach_intake_csv  toggle: intake Q&A as a CSV
--   attach_retainer    toggle: the signed retainer packet PDF(s)
--   attach_certificate toggle: the certificate of signature
--   firm_delivery_on   master switch for auto-send on unlocks_firm transitions
-- ---------------------------------------------------------------------------
alter table campaigns add column if not exists firm_email          text;
alter table campaigns add column if not exists firm_cc             text;
alter table campaigns add column if not exists firm_reply_to       text;
alter table campaigns add column if not exists firm_subject_tpl    text;
alter table campaigns add column if not exists firm_body_tpl       text;
alter table campaigns add column if not exists attach_intake_pdf   boolean not null default true;
alter table campaigns add column if not exists attach_intake_csv   boolean not null default false;
alter table campaigns add column if not exists attach_retainer     boolean not null default true;
alter table campaigns add column if not exists attach_certificate  boolean not null default true;
alter table campaigns add column if not exists firm_delivery_on    boolean not null default false;

-- ---------------------------------------------------------------------------
-- Per-lead send guard. firm_sent_at is set on first successful send so the
-- auto-trigger never double-fires; the manual button can force a resend.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists firm_sent_at     timestamptz;
alter table leads add column if not exists firm_send_result text;

-- ---------------------------------------------------------------------------
-- Delivery log: one row per send attempt (success or failure), for the audit
-- trail and the "resend / view history" UI.
-- ---------------------------------------------------------------------------
create table if not exists firm_deliveries (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,
  campaign_id   uuid references campaigns(id),
  firm_id       uuid references firms(id),
  to_email      text,
  cc_email      text,
  subject       text,
  attachments   jsonb not null default '[]'::jsonb,   -- [{name, kind, bytes}]
  ok            boolean not null default false,
  error         text,
  triggered_by  text,                                  -- 'auto' | 'manual' | 'automation'
  actor_name    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_firm_deliveries_lead on firm_deliveries(lead_id);
create index if not exists idx_firm_deliveries_created on firm_deliveries(created_at desc);

alter table firm_deliveries enable row level security;
do $$ begin
  create policy firm_deliveries_read on firm_deliveries for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
-- ============================================================================
-- 0044 MANAGER ROLE WIRING (runs after 0043 is committed)
-- Adds manager to the internal-staff set and adds the money-visibility helper.
-- New permission keys (payroll.*, deals.clean, hours.manage) live in the typed
-- layer at src/lib/permissions.ts; no DB change needed for those. Idempotent.
-- ============================================================================

-- Bring 'manager' into the internal-staff set so managers get staff RLS access.
create or replace function is_internal() returns boolean language sql stable as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

-- Money visibility gate. Owner/admin see money by default; manager/agent/qa see
-- it only if perm_overrides.money.view is true. An explicit false strips money
-- from anyone (the Alicia/Ahniyah pattern: full operations access, no dollars).
create or replace function can_see_money() returns boolean language sql stable as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and case
            when u.perm_overrides ? 'money.view'
              then (u.perm_overrides->>'money.view')::boolean
            else u.role::text in ('owner','admin')
          end
  );
$$;

-- ============================================================================
-- 0045 SLA CLOCKS
-- Two 72-hour promises that ClaimReach tracks in-your-face:
--   esign_chase_hours    e-sign SENT but not signed: agent must get the claimant
--                        back on the line before it dies (learned: ~72h or lost).
--   deliver_sla_hours    SIGNED but not delivered to firm: the file must clear
--                        Grievous -> QA -> WIP -> Re-QA -> Delivered within 72h.
-- Both are configurable here (no hardcoded 72), derived at read time so no stored
-- countdown rows ever go stale. Idempotent.
-- ============================================================================
alter table sla_settings add column if not exists esign_chase_hours int not null default 72;
alter table sla_settings add column if not exists deliver_sla_hours int not null default 72;

-- Record when the current e-sign was sent, so the chase clock has an anchor even
-- if we later summarize. (signable_documents.sent_at is the source of truth; this
-- is a convenience mirror on the lead for fast board queries.)
alter table leads add column if not exists esign_sent_at timestamptz;
