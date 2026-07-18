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

-- ============================================================================
-- 0046 RETIRE STALE MOTEL 6 STORED FORM
-- The intake renderer prefers a PUBLISHED row in intake_forms over the built-in
-- questionnaire in code. An old flattened Motel 6 form (fewer sections, the
-- duplicate emergency-contact block, property buried) was published there and
-- has been shadowing every code-side change to the questionnaire.
--
-- This unpublishes any stored trafficking/motel form so resolveIntakeFields()
-- falls through to the restructured built-in INTAKE (21 sections, merged EC,
-- property moved up, 3-10 per screen). We DEMOTE to 'draft' rather than delete,
-- so nothing is lost: the builder history is preserved and can be re-published
-- later once it is rebuilt to match. Idempotent.
-- ============================================================================
update intake_forms
   set status = 'draft', updated_at = now()
 where status = 'published'
   and (
        lower(claim_type) like '%motel%'
     or lower(claim_type) like '%traffick%'
     or lower(claim_type) like '%hotel%'
   );

-- ============================================================================
-- 0047 SEED BETA MOTEL FORM
-- "Beta Motel" is a new long-form Motel 6 PFS intake, converted from the firm's
-- Word fact sheet (84 numbered questions, 15 sections, per-hotel property loop).
-- Seeded as a PUBLISHED intake_forms row under claim_type 'beta_motel' so it is
-- editable in the form builder and can be pointed at by a campaign, WITHOUT
-- touching the live motel_trafficking form. Idempotent (re-running replaces it).
-- ============================================================================

-- Remove any prior beta_motel form so re-running this is clean.
delete from intake_forms where claim_type = 'beta_motel';

insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (
  null,
  'beta_motel',
  'Beta Motel',
  'Long-form Motel 6 Plaintiff Fact Sheet (beta). Converted from TMP Word fact sheet: 15 sections, per-hotel property loop, verbatim scripts and agent notes preserved.',
  'published',
  1,
  '[{"id": "s_warm_welcome", "scope": "lead", "kind": "section", "label": "Warm Welcome", "origin": "import"}, {"id": "script_1", "scope": "lead", "kind": "script", "label": "Hi, is this ___? ... Wonderful. My name is ___, and I''m part of the team at Turnbull, Moak, and Pendergrass working on your case. First, I just want to say thank you for making the time to talk with me today. How are you doing?", "agentNote": "Keep this check-in brief, warm, and human. Do not probe distress. Read her energy and match it. The goal is only to sound like a real, calm person who is on her side.", "origin": "import"}, {"id": "first_what_s_your_name_or_what_would_you", "scope": "lead", "kind": "text", "label": "First, what''s your name, or what would you like me to call you?", "placeholder": "Preferred name", "origin": "import"}, {"id": "script_3", "scope": "lead", "kind": "script", "label": "There''s no rush at all here. We go at your pace, you''re in control of this whole conversation, and if you ever want to pause, take a break, or skip a question, just tell me. One quick note before we start: our calls are recorded, so we always have an accurate record for your file.", "origin": "import"}, {"id": "before_we_get_into_anything_i_want_to_ma", "scope": "lead", "kind": "bool", "label": "Before we get into anything, I want to make sure you''re comfortable. Are you somewhere private and safe where you can speak freely right now?", "agentNote": "SAFETY: If NO: reschedule warmly. Do not push.", "origin": "import"}, {"id": "and_i_want_to_make_sure_you_re_okay_are", "scope": "lead", "kind": "bool", "label": "And I want to make sure you''re okay. Are you fully out of that situation now, and away from the person who did this?", "agentNote": "SAFETY: If NOT out / still in contact: stop intake. Move to safety and support. Offer the National Human Trafficking Hotline (888-373-7888). Flag for supervisor before any further questions.", "origin": "import"}, {"id": "am_i_speaking_with_you_directly_or_are_y", "scope": "lead", "kind": "select", "label": "Am I speaking with you directly, or are you helping someone else with their case?", "options": ["Victim", "POA / NOK (helping someone else)"], "origin": "import"}, {"id": "s_what_to_expect", "scope": "lead", "kind": "section", "label": "What To Expect", "origin": "import"}, {"id": "script_8", "scope": "lead", "kind": "script", "label": "Let me tell you how today will go, so nothing catches you off guard. Our team focuses specifically on these hotel cases, so you are in good hands. I am going to ask you some questions so we can build out your file completely. My real goal is to get everything in this one conversation, so that from here, our team carries the work and no one has to keep calling you to go back over the hard parts. You have probably had to tell pieces of this before, and I would like today to be the time we get all of it, so you can start to put it behind you.", "origin": "import"}, {"id": "script_9", "scope": "lead", "kind": "script", "label": "We will start with some easier questions and take it one step at a time. When we reach the harder parts, here is why even small details matter so much: they are what show the hotel''s own staff saw what was happening and did nothing. A room number, what the front desk could see, whether housekeeping stopped coming. Those little things are the strongest part of your case. So just tell me what you actually remember. If you do not remember something, ''I don''t remember'' is a perfectly good answer, and it is always better than guessing. There are no wrong answers here.", "origin": "import"}, {"id": "s_getting_oriented", "scope": "lead", "kind": "section", "label": "Getting Oriented", "agentNote": "These are intentionally easy. Build rapport and momentum, and let her get comfortable with your voice before anything hard. Keep it light and conversational.", "origin": "import"}, {"id": "to_start_about_what_years_did_all_of_thi", "scope": "lead", "kind": "text", "label": "To start, about what years did all of this take place?", "placeholder": "e.g. 2016 to 2018", "origin": "import"}, {"id": "and_what_city_or_area_were_you_living_in", "scope": "lead", "kind": "text", "label": "And what city or area were you living in back then?", "origin": "import"}, {"id": "how_old_were_you_when_this_started", "scope": "lead", "kind": "text", "label": "How old were you when this started?", "origin": "import"}, {"id": "around_that_time_were_you_mostly_on_your", "scope": "lead", "kind": "select", "label": "Around that time, were you mostly on your own, staying with family, or something else?", "options": ["On my own", "With family", "With a partner", "Unstable", "moving around", "Other"], "origin": "import"}, {"id": "i_understand_this_happened_at_one_or_mor", "scope": "lead", "kind": "bool", "label": "I understand this happened at one or more Motel 6 locations. Is that right?", "vital": true, "origin": "import"}, {"id": "and_about_how_many_different_motel_6_loc", "scope": "lead", "kind": "select", "label": "And about how many different Motel 6 locations were involved?", "options": ["1", "2", "3", "4", "5 or more"], "origin": "import"}, {"id": "s_how_you_met", "scope": "lead", "kind": "section", "label": "How You Met", "agentNote": "Still gentle. This is the ''before,'' and it eases into the story. Let her talk; fill fields from what she says.", "origin": "import"}, {"id": "let_s_start_at_the_beginning_how_did_you", "scope": "lead", "kind": "select", "label": "Let''s start at the beginning. How did you and this person first meet?", "options": ["Online", "social media", "Through a friend", "Through family", "At a job", "In person", "on the street", "Other"], "origin": "import"}, {"id": "where_was_that_what_city_and_state", "scope": "lead", "kind": "text", "label": "Where was that? What city and state?", "origin": "import"}, {"id": "when_you_first_met_what_was_your_relatio", "scope": "lead", "kind": "select", "label": "When you first met, what was your relationship? How did you know each other?", "options": ["Romantic partner", "Friend", "Acquaintance", "Employer", "Family", "Stranger", "Other"], "origin": "import"}, {"id": "in_those_early_days_did_they_promise_you", "scope": "lead", "kind": "multiselect", "label": "In those early days, did they promise you anything?", "options": ["Love/relationship", "Money", "Job", "Housing", "Modeling/career", "Travel", "Drugs", "Protection", "Other"], "agentNote": "probe:  \u201cThings like a relationship, money, a job, a place to stay?\u201d", "origin": "import"}, {"id": "did_they_give_you_anything_early_on", "scope": "lead", "kind": "multiselect", "label": "Did they give you anything early on?", "options": ["Money", "Gifts", "Housing", "Drugs", "Clothing", "Phone", "Other"], "agentNote": "probe:  \u201cMoney, gifts, somewhere to live, a phone?\u201d", "origin": "import"}, {"id": "looking_back_do_you_feel_they_misled_you", "scope": "lead", "kind": "bool", "label": "Looking back, do you feel they misled you, or made promises they didn''t keep, to get you involved?", "origin": "import"}, {"id": "how_did_the_subject_of_sex_work_first_co", "scope": "lead", "kind": "text", "label": "How did the subject of sex work first come up? What were you told?", "origin": "import"}, {"id": "s_how_you_were_controlled", "scope": "lead", "kind": "section", "label": "How You Were Controlled", "agentNote": "Do NOT read the option list on Q19. Mark what she describes on her own.", "origin": "import"}, {"id": "once_things_were_underway_was_someone_co", "scope": "lead", "kind": "bool", "label": "Once things were underway, was someone controlling you, or making you do this?", "origin": "import"}, {"id": "how_did_they_keep_control_over_you", "scope": "lead", "kind": "multiselect", "label": "How did they keep control over you?", "options": ["Physical force", "Threats", "Drugs", "Debt bondage", "Isolation", "Controlled money", "Controlled ID/docs", "Controlled phone", "Emotional/psychological", "Other"], "origin": "import"}, {"id": "if_you_had_said_no_or_tried_to_stop_what", "scope": "lead", "kind": "bool", "label": "If you had said no, or tried to stop, what would have happened? Were you able to refuse?", "origin": "import"}, {"id": "during_that_time_did_you_have_access_to", "scope": "lead", "kind": "select", "label": "During that time, did you have access to your own phone, your own money, and your ID?", "options": ["Full access", "Some", "None"], "origin": "import"}, {"id": "did_they_keep_you_away_from_your_friends", "scope": "lead", "kind": "bool", "label": "Did they keep you away from your friends or family?", "origin": "import"}, {"id": "were_you_ever_threatened_or_hurt_if_you", "scope": "lead", "kind": "bool", "label": "Were you ever threatened or hurt if you didn''t make enough money?", "origin": "import"}, {"id": "was_there_a_debt_you_were_told_you_owed", "scope": "lead", "kind": "bool", "label": "Was there a debt you were told you owed, or an amount you had to bring in each day?", "origin": "import"}, {"id": "were_there_other_women_or_girls_working", "scope": "lead", "kind": "bool", "label": "Were there other women or girls working for this same person?", "origin": "import"}, {"id": "do_you_remember_any_of_their_names_even", "scope": "lead", "kind": "text", "label": "Do you remember any of their names, even nicknames? Anyone who might remember you?", "placeholder": "Text (possible corroborating witnesses)", "origin": "import"}, {"id": "s_what_happened", "scope": "lead", "kind": "section", "label": "What Happened", "origin": "import"}, {"id": "script_36", "scope": "lead", "kind": "script", "label": "You are doing really well, and this is exactly what helps. This next part is some of the harder material, so I will remind you: your pace, and skip anything you want. When you are ready, in your own words, can you walk me through what happened during this time?", "agentNote": "Now that trust is built, let her narrate. Do not interrupt to fill fields. Capture the account below, then fill the structured fields from what she says. Only gently guide if she stalls.", "origin": "import"}, {"id": "script_37", "scope": "lead", "kind": "script", "label": "Only if you''re comfortable, and you can skip any of this.", "origin": "import"}, {"id": "when_it_came_to_the_acts_themselves_did", "scope": "lead", "kind": "multiselect", "label": "When it came to the acts themselves, did they involve vaginal, anal, or oral sex?", "options": ["Vaginal", "Anal", "Oral"], "origin": "import"}, {"id": "was_money_exchanged_for_these_acts", "scope": "lead", "kind": "bool", "label": "Was money exchanged for these acts?", "origin": "import"}, {"id": "who_actually_received_that_money", "scope": "lead", "kind": "multiselect", "label": "Who actually received that money?", "options": ["Trafficker", "You", "Both", "Other"], "origin": "import"}, {"id": "were_you_ever_allowed_to_keep_any_of_it", "scope": "lead", "kind": "bool", "label": "Were you ever allowed to keep any of it for yourself?", "origin": "import"}, {"id": "do_you_have_a_sense_of_how_much_was_char", "scope": "lead", "kind": "text", "label": "Do you have a sense of how much was charged, or how many people there were in a typical day?", "origin": "import"}, {"id": "s_the_hotels", "scope": "lead", "kind": "section", "label": "The Hotels", "origin": "import"}, {"id": "property_lookup", "scope": "property", "kind": "property_lookup", "label": "Identify the property", "vital": true, "origin": "import"}, {"id": "script_44", "scope": "lead", "kind": "script", "label": "Now I''d like to go hotel by hotel. This part is more like filling in facts than reliving anything, and it''s where we prove what the staff saw. We''ll take each place one at a time.", "agentNote": "Everything constant is already captured above. Here you capture ONLY what changed at each hotel. Duplicate this block for every property. Five hotels means five short blocks, not five long interviews. Keep each block tight and watch the clock.", "origin": "import"}, {"id": "which_motel_6_was_this_do_you_remember_t", "scope": "property", "kind": "text", "label": "Which Motel 6 was this? Do you remember the address, or the cross streets nearby?", "placeholder": "Name + street, city, state, ZIP", "origin": "import"}, {"id": "and_what_brand_was_it_as_you_remember_it", "scope": "property", "kind": "select", "label": "And what brand was it, as you remember it?", "options": ["Motel 6", "Studio 6", "Other (capture it)"], "origin": "import"}, {"id": "about_what_dates_were_you_at_this_one", "scope": "property", "kind": "text", "label": "About what dates were you at this one?", "placeholder": "MM/YYYY to MM/YYYY", "origin": "import"}, {"id": "how_long_did_you_stay_here_roughly", "scope": "property", "kind": "select", "label": "How long did you stay here, roughly?", "options": ["Hours", "1 to 3 days", "About a week", "Weeks", "A month or more"], "origin": "import"}, {"id": "how_old_were_you_while_you_were_at_this", "scope": "property", "kind": "text", "label": "How old were you while you were at this particular hotel?", "placeholder": "Age (only differs if the timeline spanned a birthday or crossed 18)", "origin": "import"}, {"id": "do_you_remember_the_room_here_the_number", "scope": "property", "kind": "text", "label": "Do you remember the room here? The number, the floor, or where it was in the building?", "placeholder": "e.g. Rm 214, 2nd floor, back corner by the alley", "origin": "import"}, {"id": "at_this_location_did_the_men_come_to_you", "scope": "property", "kind": "select", "label": "At this location, did the men come to you at the room, or were you taken somewhere else?", "options": ["In-call (came to room)", "Out-call (taken elsewhere)", "Both"], "origin": "import"}, {"id": "about_how_many_men_in_a_day_or_night_her", "scope": "property", "kind": "text", "label": "About how many men in a day or night here?", "origin": "import"}, {"id": "and_roughly_how_many_acts_in_total_at_th", "scope": "property", "kind": "text", "label": "And roughly how many acts in total at this one?", "origin": "import"}, {"id": "how_were_the_rooms_paid_for_here", "scope": "property", "kind": "select", "label": "How were the rooms paid for here?", "options": ["Cash", "Prepaid card", "Card", "Unsure"], "origin": "import"}, {"id": "think_about_what_the_front_desk_and_hous", "scope": "property", "kind": "text", "label": "Think about what the front desk and housekeeping could see. Which of these were true at this hotel?", "origin": "import"}, {"id": "did_you_ever_go_to_the_staff_here_for_he", "scope": "property", "kind": "bool", "label": "Did you ever go to the staff here for help?", "agentNote": "probe:  \u201cWho did you talk to, the front desk, a manager, security?\u201d", "origin": "import"}, {"id": "were_the_police_or_paramedics_ever_calle", "scope": "property", "kind": "bool", "label": "Were the police or paramedics ever called to this hotel while you were there?", "origin": "import"}, {"id": "did_you_ever_see_police_show_up_for_othe", "scope": "property", "kind": "bool", "label": "Did you ever see police show up for other rooms, or other people, here?", "origin": "import"}, {"id": "did_any_of_the_staff_here_go_beyond_just", "scope": "property", "kind": "text", "label": "Did any of the staff here go beyond just renting a room? Did any of this happen?", "origin": "import"}, {"id": "anything_else_about_how_the_staff_here_w", "scope": "property", "kind": "text", "label": "Anything else about how the staff here were involved?", "origin": "import"}, {"id": "what_was_around_this_hotel_any_stores_re", "scope": "property", "kind": "text", "label": "What was around this hotel? Any stores, restaurants, or landmarks you remember nearby?", "origin": "import"}, {"id": "was_anything_different_about_who_was_con", "scope": "property", "kind": "bool", "label": "Was anything different about who was controlling you, or how, at this particular hotel?", "agentNote": "probe:  \u201cA different person, or different methods here?\u201d", "origin": "import"}, {"id": "if_it_was_different_here_tell_me_how", "scope": "property", "kind": "text", "label": "If it was different here, tell me how.", "placeholder": "Different trafficker name, different methods, notes", "origin": "import"}, {"id": "s_how_you_were_advertised_paid", "scope": "lead", "kind": "section", "label": "How You Were Advertised & Paid", "agentNote": "We are past the hardest part now. This is factual. Online ads are the single most common corroborator in these cases, so capture everything.", "origin": "import"}, {"id": "were_you_ever_advertised_online", "scope": "lead", "kind": "bool", "label": "Were you ever advertised online?", "origin": "import"}, {"id": "do_you_know_which_websites_or_apps", "scope": "lead", "kind": "multiselect", "label": "Do you know which websites or apps?", "options": ["Adult listing sites", "Megapersonals", "Social media", "Dating apps", "Other"], "origin": "import"}, {"id": "what_phone_number_was_used_back_then_eve", "scope": "lead", "kind": "text", "label": "What phone number was used back then? Even a rough memory helps.", "placeholder": "Text (ties to ads and call records)", "origin": "import"}, {"id": "do_you_think_any_of_those_ads_or_screens", "scope": "lead", "kind": "select", "label": "Do you think any of those ads, or screenshots of them, still exist anywhere?", "options": ["Yes", "No", "Unsure"], "origin": "import"}, {"id": "how_did_the_money_move_any_of_these", "scope": "lead", "kind": "multiselect", "label": "How did the money move? Any of these?", "options": ["CashApp", "Venmo", "PayPal", "Zelle", "Prepaid cards", "Other"], "origin": "import"}, {"id": "do_you_remember_any_of_the_usernames_or", "scope": "lead", "kind": "text", "label": "Do you remember any of the usernames or handles on those?", "origin": "import"}, {"id": "s_evidence_witnesses", "scope": "lead", "kind": "section", "label": "Evidence & Witnesses", "origin": "import"}, {"id": "do_you_still_have_anything_from_that_tim", "scope": "lead", "kind": "multiselect", "label": "Do you still have anything from that time?", "options": ["Photos", "Texts/messages", "Receipts", "Ad screenshots", "Medical records", "Police report", "Other"], "agentNote": "probe:  \u201cPhotos, texts, receipts, anything at all?\u201d", "origin": "import"}, {"id": "is_there_anyone_who_could_back_up_what_h", "scope": "lead", "kind": "bool", "label": "Is there anyone who could back up what happened? Family, a friend, another girl?", "origin": "import"}, {"id": "who_and_how_could_we_reach_them", "scope": "lead", "kind": "text", "label": "Who, and how could we reach them?", "origin": "import"}, {"id": "would_you_be_willing_and_able_to_share_w", "scope": "lead", "kind": "bool", "label": "Would you be willing and able to share what you have with our team?", "agentNote": "If yes, arrange collection now (secure upload or email). Do not end the call assuming it will happen later.", "origin": "import"}, {"id": "s_your_social_media_from_that_ti", "scope": "lead", "kind": "section", "label": "Your Social Media From That Time", "origin": "import"}, {"id": "script_77", "scope": "lead", "kind": "script", "label": "A few quick questions about social media from back then. This is not about doubting you at all. The other side digs up everything, so the more we know now, the better we can protect you and your story.", "agentNote": "Do NOT advise deleting anything. Deleting posts is spoliation and can badly hurt the case. Capture and preserve only.", "origin": "import"}, {"id": "what_social_media_did_you_use_back_then", "scope": "lead", "kind": "multiselect", "label": "What social media did you use back then?", "options": ["Instagram", "Facebook", "Snapchat", "TikTok", "X/Twitter", "Other"], "origin": "import"}, {"id": "what_were_your_usernames_on_those", "scope": "lead", "kind": "text", "label": "What were your usernames on those?", "origin": "import"}, {"id": "did_you_post_anything_during_that_time", "scope": "lead", "kind": "bool", "label": "Did you post anything during that time?", "origin": "import"}, {"id": "is_there_anything_on_there_that_someone", "scope": "lead", "kind": "bool", "label": "Is there anything on there that someone could take the wrong way? Location tags, photos, or posts that might look like it was your choice?", "origin": "import"}, {"id": "can_you_tell_me_a_little_about_what_s_th", "scope": "lead", "kind": "text", "label": "Can you tell me a little about what''s there, so we''re never caught off guard?", "origin": "import"}, {"id": "do_you_still_have_access_to_those_accoun", "scope": "lead", "kind": "select", "label": "Do you still have access to those accounts?", "options": ["Yes", "No", "Some"], "origin": "import"}, {"id": "s_about_you_background_record", "scope": "lead", "kind": "section", "label": "About You: Background & Record", "origin": "import"}, {"id": "script_85", "scope": "lead", "kind": "script", "label": "These next questions are routine and we ask everyone. Nothing here counts against you. It just lets us stay ahead of anything the other side might raise.", "origin": "import"}, {"id": "have_you_ever_been_convicted_of_a_felony", "scope": "lead", "kind": "bool", "label": "Have you ever been convicted of a felony?", "origin": "import"}, {"id": "how_many", "scope": "lead", "kind": "select", "label": "How many?", "options": ["1", "2", "3", "4 or more"], "origin": "import"}, {"id": "what_were_they_for", "scope": "lead", "kind": "multiselect", "label": "What were they for?", "options": ["Drug", "Theft/property", "Violent", "Solicitation/prostitution", "Fraud", "Other"], "origin": "import"}, {"id": "about_what_years", "scope": "lead", "kind": "text", "label": "About what years?", "origin": "import"}, {"id": "were_any_of_those_during_the_same_time_y", "scope": "lead", "kind": "bool", "label": "Were any of those during the same time you were being trafficked?", "origin": "import"}, {"id": "is_there_anything_open_right_now_a_case", "scope": "lead", "kind": "bool", "label": "Is there anything open right now? A case, a warrant, probation, or parole?", "origin": "import"}, {"id": "what_s_the_current_status_on_that", "scope": "lead", "kind": "text", "label": "What''s the current status on that?", "origin": "import"}, {"id": "have_you_ever_filed_for_bankruptcy_if_so", "scope": "lead", "kind": "text", "label": "Have you ever filed for bankruptcy? If so, what kind and when?", "origin": "import"}, {"id": "is_there_any_other_name_or_alias_you_ve", "scope": "lead", "kind": "text", "label": "Is there any other name or alias you''ve used that might show up on records?", "origin": "import"}, {"id": "are_you_currently_incarcerated", "scope": "lead", "kind": "bool", "label": "Are you currently incarcerated?", "origin": "import"}, {"id": "would_it_help_to_have_an_interpreter_or", "scope": "lead", "kind": "bool", "label": "Would it help to have an interpreter, or any help reading documents?", "origin": "import"}, {"id": "s_anything_you_ve_already_said", "scope": "lead", "kind": "section", "label": "Anything You''ve Already Said", "origin": "import"}, {"id": "script_98", "scope": "lead", "kind": "script", "label": "Have you ever told this story before, anywhere official? If you did, and a detail came out differently, that is completely normal, memory works that way. We just need to know now so we can protect you, not be surprised later.", "origin": "import"}, {"id": "have_you_ever_reported_this_to_the_polic", "scope": "lead", "kind": "bool", "label": "Have you ever reported this to the police, or made any kind of report?", "origin": "import"}, {"id": "when_was_that_and_where", "scope": "lead", "kind": "text", "label": "When was that, and where?", "origin": "import"}, {"id": "did_you_ever_testify_or_give_a_statement", "scope": "lead", "kind": "bool", "label": "Did you ever testify, or give a statement, in a criminal case?", "origin": "import"}, {"id": "have_you_told_this_story_before_to_anyon", "scope": "lead", "kind": "multiselect", "label": "Have you told this story before to anyone official?", "options": ["Investigator", "Another law firm", "Shelter/advocate", "CPS/DCFS", "Doctor/therapist", "Other"], "agentNote": "probe:  \u201cAn investigator, another firm, a shelter, a caseworker, a doctor?\u201d", "origin": "import"}, {"id": "is_there_anything_you_told_before_that_c", "scope": "lead", "kind": "bool", "label": "Is there anything you told before that came out differently than what you told me today?", "origin": "import"}, {"id": "tell_me_what_was_different_it_s_complete", "scope": "lead", "kind": "text", "label": "Tell me what was different. It''s completely okay.", "origin": "import"}, {"id": "last_one_like_this_is_there_anything_at", "scope": "lead", "kind": "text", "label": "Last one like this: is there anything at all that might look bad, or might not add up, that you''d rather I hear from you first?", "origin": "import"}, {"id": "s_how_this_has_affected_you", "scope": "lead", "kind": "section", "label": "How This Has Affected You", "origin": "import"}, {"id": "script_107", "scope": "lead", "kind": "script", "label": "Almost done. These last few are about how this has affected you, because it matters that the harm is recognized. Take your time, and share only what you want to.", "origin": "import"}, {"id": "did_you_suffer_any_physical_injuries_or", "scope": "lead", "kind": "multiselect", "label": "Did you suffer any physical injuries or lasting health problems from this time?", "options": ["Injuries from violence", "STIs", "Pregnancy", "Forced abortion", "Lasting physical conditions", "Other"], "origin": "import"}, {"id": "how_has_this_affected_you_emotionally_or", "scope": "lead", "kind": "multiselect", "label": "How has this affected you emotionally or mentally?", "options": ["PTSD", "Depression", "Anxiety", "Substance use disorder", "Other"], "origin": "import"}, {"id": "have_you_gotten_any_treatment_then_or_si", "scope": "lead", "kind": "multiselect", "label": "Have you gotten any treatment, then or since?", "options": ["ER visits", "Hospitalization", "Therapy/counseling", "Medications", "Rehab", "None yet"], "agentNote": "probe:  \u201cThe ER, a hospital, a therapist, medication, rehab?\u201d", "origin": "import"}, {"id": "did_you_end_up_dependent_on_any_substanc", "scope": "lead", "kind": "bool", "label": "Did you end up dependent on any substances they used to keep control?", "origin": "import"}, {"id": "how_did_this_change_the_direction_of_you", "scope": "lead", "kind": "multiselect", "label": "How did this change the direction of your life?", "options": ["Education interrupted", "Lost work / earning ability", "Housing instability", "Damaged relationships", "Other"], "agentNote": "probe:  \u201cYour schooling, your work, where you lived, your relationships?\u201d", "origin": "import"}, {"id": "what_are_you_still_carrying_with_you_fro", "scope": "lead", "kind": "text", "label": "What are you still carrying with you from this today?", "agentNote": "This maps to the records release. Get the signed HIPAA and records authorization so the team pulls treatment and police records without ever calling her back.", "origin": "import"}, {"id": "s_scope_summary", "scope": "lead", "kind": "section", "label": "Scope Summary", "agentNote": "Quick roll-up for the demand. Fill from everything above; no need to re-ask.", "origin": "import"}, {"id": "overall_how_long_would_you_say_this_went", "scope": "lead", "kind": "text", "label": "Overall, how long would you say this went on?", "origin": "import"}, {"id": "total_number_of_hotels_properties", "scope": "lead", "kind": "select", "label": "Total number of hotels/properties", "options": ["1", "2", "3", "4", "5 or more"], "origin": "import"}, {"id": "were_there_any_hotels_other_than_motel_6", "scope": "lead", "kind": "bool", "label": "Were there any hotels other than Motel 6?", "origin": "import"}, {"id": "which_other_ones", "scope": "lead", "kind": "text", "label": "Which other ones?", "placeholder": "Text (each is a potential additional defendant)", "origin": "import"}, {"id": "geographic_spread_cities_states", "scope": "lead", "kind": "text", "label": "Geographic spread (cities/states)", "origin": "import"}, {"id": "s_contact_close", "scope": "lead", "kind": "section", "label": "Contact & Close", "origin": "import"}, {"id": "what_s_the_best_phone_number_to_reach_yo", "scope": "lead", "kind": "text", "label": "What''s the best phone number to reach you?", "origin": "import"}, {"id": "and_a_good_email_that_will_stay_the_same", "scope": "lead", "kind": "text", "label": "And a good email that will stay the same?", "origin": "import"}, {"id": "is_there_one_person_who_will_always_know", "scope": "lead", "kind": "text", "label": "Is there one person who will always know how to find you, in case we can''t reach you directly?", "placeholder": "Name, relationship, phone", "origin": "import"}, {"id": "what_s_the_safest_way_for_us_to_contact", "scope": "lead", "kind": "multiselect", "label": "What''s the safest way for us to contact you?", "options": ["Text", "Call", "Voicemail", "Email"], "origin": "import"}, {"id": "and_the_best_time_and_method_for_us_to_f", "scope": "lead", "kind": "text", "label": "And the best time and method for us to follow up?", "origin": "import"}, {"id": "does_anyone_monitor_your_calls_texts_or", "scope": "lead", "kind": "bool", "label": "Does anyone monitor your calls, texts, or email?", "origin": "import"}, {"id": "is_it_okay_if_we_leave_a_voicemail_askin", "scope": "lead", "kind": "bool", "label": "Is it okay if we leave a voicemail asking you to call back?", "origin": "import"}, {"id": "if_we_can_t_reach_you_directly_what_shou", "scope": "lead", "kind": "text", "label": "If we can''t reach you directly, what should we say?", "origin": "import"}, {"id": "script_129", "scope": "lead", "kind": "script", "label": "Thank you. I know that was not easy, and I want you to know the hardest part is now behind you. Telling your story, all in one place, is the part that takes the most out of you, and you just did it. From here, our team carries the work. Your case manager will call soon just to introduce herself and check in, and those conversations are the easy part. You will not have to go back through all of this again.", "origin": "import"}, {"id": "script_130", "scope": "lead", "kind": "script", "label": "Please keep everything we talked about, your messages, photos, and any records, and do not delete anything, even old social media, because it can help your case. Because these cases are complex, there can be long, quiet stretches while we wait on the courts and the other side. That is normal and it is not a sign of anything. We will check in every 30 to 45 days so you always know we are still working for you. Thank you for trusting us with this.", "agentNote": "Book the case manager introduction call before ending.", "origin": "import"}]'::jsonb
);

-- ============================================================================
-- 0048 CLAIM_PROPERTIES CUSTOM OVERFLOW
-- The built-in Motel form maps each per-property question to a fixed column.
-- Imported/beta forms (e.g. Beta Motel) can have arbitrary property questions
-- with their own field IDs that do not match those columns. Rather than fail the
-- insert or lose the answer, unknown property field IDs are stored in this jsonb
-- bag, keyed by field id. Fixed columns still win for the built-in form.
-- Idempotent.
-- ============================================================================
alter table claim_properties add column if not exists custom jsonb not null default '{}'::jsonb;

-- ============================================================================
-- 0049 AGENT INTAKE CONSOLE
-- Additive only. The console lands completed calls in their OWN table. It does
-- not touch leads or claims on this pass, so live intake keeps running while we
-- watch real calls flow through. Promotion to a lead is wired second, once the
-- write has been observed on the floor.
--
-- Branch answers live in `answers` jsonb rather than one column per question:
-- the question set differs per firm and per case type, so jsonb keeps the schema
-- stable as firm configs change.
-- ============================================================================

create table if not exists intake_calls (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid references firms(id),        -- nullable: console can run before a firm row exists
  firm_slug     text,                             -- tenant key from the console config ('tmt','tmp','roth')
  agent_id      uuid references app_users(id),
  agent_name    text,
  caller_id     text,                             -- pasted from JustCall, matches the recording
  first_name    text,                             -- first name only
  callback      text,
  call_type     text,                             -- new_potential | existing | non_client | not_legal
  matter        text,                             -- auto | gpi | employment | family | criminal | contract | other
  answers       jsonb not null default '{}'::jsonb,
  disposition   text,                             -- SIGN | REFER | DISQUALIFY | SECONDARY_REVIEW | CALLBACK | TRANSFER
  reason        text,                             -- computed routing reason
  close_key     text,                             -- which scripted close the agent was shown
  flags         text[] not null default '{}',     -- commercial vehicle / catastrophic injury / hospitalized 3+ days
  summary       text,                             -- generated case summary
  -- Post-signature capture. Held SEPARATELY from `answers` because it contains
  -- identity data (DL number, DOB, SSN) that should be access-restricted rather
  -- than sitting in the general answer blob. Tighten the read policy on this
  -- column before the floor starts collecting it at volume.
  post_sign     jsonb,
  lead_id       uuid references leads(id),        -- set when the call is promoted (phase 2)
  promoted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_intake_calls_firm    on intake_calls(firm_id, created_at desc);
create index if not exists idx_intake_calls_agent   on intake_calls(agent_id, created_at desc);
create index if not exists idx_intake_calls_disp    on intake_calls(disposition);
create index if not exists idx_intake_calls_created on intake_calls(created_at desc);

alter table intake_calls enable row level security;
do $$ begin
  create policy intake_calls_internal on intake_calls for all
    using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;

-- Optional per-firm console overrides. The code registry in
-- src/lib/intake-console/config.ts holds the defaults; anything set here is
-- deep-merged over them, so a firm can be retuned without a deploy.
alter table firms add column if not exists intake_config jsonb;

-- ============================================================================
-- 0050 LIVE SIGNING FROM THE INTAKE CONSOLE
-- send_packet normally refuses until Grievous has approved the file. That gate is
-- right for mass-tort files that go through QA before a retainer goes out, and
-- wrong for a live inbound call where the whole point is to sign while the client
-- is still on the phone.
--
-- Rather than fake a Grievous approval, campaigns opt in explicitly. Only a
-- campaign with allow_live_sign = true can have its retainer sent straight from
-- the console, and the audit trail records that it went out live on the call with
-- no prior QA.
-- Idempotent.
-- ============================================================================
alter table campaigns add column if not exists allow_live_sign boolean not null default false;

-- Where the file came from, so a console-originated sign is distinguishable from
-- a file that walked the normal QA path.
alter table leads add column if not exists origin text;

-- ============================================================================
-- 0051 A LEAD MUST KNOW WHAT IT IS
-- leads.case_type and claims.claim_type were declared:
--     text not null default 'motel_trafficking'
-- That default was correct when ClaimReach ran one campaign. Now it silently
-- stamps every new file as a Motel 6 trafficking case, which is why unrelated
-- files were opening a trafficking questionnaire and why nothing forced an agent
-- to say what the call actually was.
--
-- Dropping the default (keeping NOT NULL) makes the case type explicit at every
-- creation path: an insert that does not state what the file is now fails loudly
-- instead of quietly guessing wrong.
--
-- Campaign is NOT made NOT NULL here on purpose. Existing rows have no campaign,
-- so a hard constraint would fail on contact with live data. It is enforced in
-- the application on every creation path, and anything already missing one is
-- surfaced in the UI rather than hidden.
-- Idempotent.
-- ============================================================================
alter table leads  alter column case_type  drop default;
alter table claims alter column claim_type drop default;

-- Backfill guard: any legacy row still carrying the old default that never had a
-- campaign was almost certainly mislabeled by it rather than genuinely a motel
-- file. Leave the data alone (we do not know), but make it findable.
create index if not exists idx_leads_no_campaign on leads(firm_id) where campaign_id is null;

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

-- ============================================================================
-- 0054 THE CONSOLE'S QUESTIONS BECOME REAL FORMS
--
-- The intake console asked its questions from a TypeScript file that nothing
-- else could see. So a signed MVA file exported to PDF or CSV resolved no form
-- for 'mva', fell through to the generic SPINE, and printed the wrong questions
-- with blank answers — the file the firm receives would not match the call that
-- was actually run.
--
-- These rows are GENERATED from src/lib/intake-console/questions.ts, so the
-- console, the case-questions tab, the PDF and the CSV all render one set of
-- questions. Each choice field carries a `choices` value->label map so exports
-- print "Within the last 30 days" instead of the stored code "le30".
--
-- Regenerate rather than hand-edit: the TS file remains the authored source
-- until the collapse pass moves authorship into the builder.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA screening',
  'Generated from the intake console question set so exports, the case-questions tab and the console all render the same questions.',
  'published', 1, '[{"id": "s_mva_screen", "scope": "lead", "kind": "section", "label": "Motor vehicle accident screening"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "options": ["They are the injured person", "Calling for someone (living)", "The injured person passed away"], "choices": [{"value": "self", "label": "They are the injured person"}, {"value": "alive", "label": "Calling for someone (living)"}, {"value": "deceased", "label": "The injured person passed away"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "options": ["Yes, commercial", "No, personal vehicle", "Not sure"], "choices": [{"value": "yes", "label": "Yes, commercial"}, {"value": "no", "label": "No, personal vehicle"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "options": ["No", "Yes, 1 to 2 nights", "Yes, 3 or more days"], "choices": [{"value": "no", "label": "No"}, {"value": "short", "label": "Yes, 1 to 2 nights"}, {"value": "long", "label": "Yes, 3 or more days"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "The caller caused it", "Shared / partly both", "Not sure"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "caused", "label": "The caller caused it"}, {"value": "shared", "label": "Shared / partly both"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises screening',
  'Generated from the intake console question set so exports, the case-questions tab and the console all render the same questions.',
  'published', 1, '[{"id": "s_prem_screen", "scope": "lead", "kind": "section", "label": "Premises screening"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0055 NORMALIZE EVERY INTAKE ONTO ONE SPINE
--
-- Before this, the Motel intake had 21 sections, the generic fallback had 2, and
-- the MVA form had 1. Three intakes, three unrelated skeletons. Nothing was
-- comparable across case types and every new campaign got authored from scratch.
--
-- Every intake is now the same backbone with a different middle:
--   opening > gates > injured party > caller > address > emergency contact
--     > [CASE-SPECIFIC CRITERIA] > incident > injuries > insurance > history > closing
--
-- A case type that asks a spine topic its own way SKIPS that block instead of
-- asking twice: the MVA and premises trees ask injuries, treatment and bills
-- inside their own criteria, in the order that drives routing, so the generic
-- injuries block is omitted for them.
--
-- Regenerate with src/lib/spine.ts composeForm() rather than hand-editing.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake',
  'Spine + case criteria. Generated by src/lib/spine.ts composeForm().',
  'published', 2, '[{"id": "s_opening", "scope": "lead", "kind": "section", "label": "Opening"}, {"id": "script_open", "scope": "lead", "kind": "script", "label": "Intro (read verbatim)", "script": "Thank you. My name is ___. I''m calling from the law firm handling your claim. Is now a good time to go through this with you?", "agentNote": "If now is not a good time, schedule the callback and stop here."}, {"id": "ok_to_proceed", "scope": "lead", "kind": "bool", "label": "Is now a good time to proceed?", "agentNote": "If no, schedule the callback. Do not run the intake."}, {"id": "s_gates", "scope": "lead", "kind": "section", "label": "Mandatory gates"}, {"id": "g_represented", "scope": "lead", "kind": "gate", "gateType": "dq", "vital": true, "label": "Are you already represented by another attorney for this matter?", "agentNote": "If YES this is a disqualifier. Do not proceed."}, {"id": "g_injured_party", "scope": "lead", "kind": "bool", "vital": true, "label": "Am I speaking with the injured party?"}, {"id": "g_authority", "scope": "lead", "kind": "bool", "vital": true, "label": "Do you have legal authority to act on their behalf?", "agentNote": "Power of attorney, parent, legal guardian, or executor.", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_injured_party", "scope": "lead", "kind": "section", "label": "Injured party"}, {"id": "ip_first_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal first name", "vital": true}, {"id": "ip_last_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal last name", "vital": true}, {"id": "ip_dob", "scope": "lead", "kind": "date", "label": "Injured party''s date of birth", "vital": true}, {"id": "ip_phone", "scope": "lead", "kind": "phone", "label": "Best phone number", "vital": true}, {"id": "ip_email", "scope": "lead", "kind": "email", "label": "Email address"}, {"id": "s_caller", "scope": "lead", "kind": "section", "label": "Caller"}, {"id": "caller_name", "scope": "lead", "kind": "text", "label": "Caller''s full name", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_phone", "scope": "lead", "kind": "phone", "label": "Caller''s phone", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_relationship", "scope": "lead", "kind": "text", "label": "Relationship to the injured party", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_address", "scope": "lead", "kind": "section", "label": "Mailing address"}, {"id": "mail_addr1", "scope": "lead", "kind": "text", "label": "Street address", "group": "address"}, {"id": "mail_city", "scope": "lead", "kind": "text", "label": "City", "group": "address"}, {"id": "mail_state", "scope": "lead", "kind": "text", "label": "State", "group": "address"}, {"id": "mail_zip", "scope": "lead", "kind": "text", "label": "ZIP", "group": "address"}, {"id": "s_emergency", "scope": "lead", "kind": "section", "label": "Emergency contact"}, {"id": "ec_name", "scope": "lead", "kind": "text", "label": "Emergency contact name", "group": "emergency"}, {"id": "ec_phone", "scope": "lead", "kind": "phone", "label": "Emergency contact phone", "group": "emergency"}, {"id": "ec_relationship", "scope": "lead", "kind": "text", "label": "Relationship", "group": "emergency"}, {"id": "s_mva_criteria", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "vital": true, "options": ["They are the injured person", "Calling for someone (living)", "The injured person passed away"], "choices": [{"value": "self", "label": "They are the injured person"}, {"value": "alive", "label": "Calling for someone (living)"}, {"value": "deceased", "label": "The injured person passed away"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["Yes, commercial", "No, personal vehicle", "Not sure"], "choices": [{"value": "yes", "label": "Yes, commercial"}, {"value": "no", "label": "No, personal vehicle"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No", "Yes, 1 to 2 nights", "Yes, 3 or more days"], "choices": [{"value": "no", "label": "No"}, {"value": "short", "label": "Yes, 1 to 2 nights"}, {"value": "long", "label": "Yes, 3 or more days"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "The caller caused it", "Shared / partly both", "Not sure"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "caused", "label": "The caller caused it"}, {"value": "shared", "label": "Shared / partly both"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "s_incident", "scope": "lead", "kind": "section", "label": "The incident"}, {"id": "incident_date", "scope": "lead", "kind": "date", "label": "What date did this happen?", "vital": true}, {"id": "incident_state", "scope": "lead", "kind": "text", "label": "What state did this happen in?", "vital": true}, {"id": "incident_narrative", "scope": "lead", "kind": "longtext", "label": "In your own words, tell me what happened.", "agentNote": "Capture it in their words. Do not lead, do not summarize for them."}, {"id": "s_insurance", "scope": "lead", "kind": "section", "label": "Insurance"}, {"id": "health_insurance", "scope": "lead", "kind": "text", "label": "Health insurance carrier", "group": "insurance"}, {"id": "own_carrier", "scope": "lead", "kind": "text", "label": "Their own insurance carrier", "group": "insurance"}, {"id": "other_carrier", "scope": "lead", "kind": "text", "label": "The other party''s carrier", "group": "insurance"}, {"id": "s_history", "scope": "lead", "kind": "section", "label": "History"}, {"id": "prior_claims", "scope": "lead", "kind": "bool", "label": "Have you made a personal injury claim before?"}, {"id": "prior_attorney", "scope": "lead", "kind": "text", "label": "Which firm handled it?", "showIf": {"match": "all", "rules": [{"fieldId": "prior_claims", "op": "is", "value": "yes"}]}}, {"id": "s_closing", "scope": "lead", "kind": "section", "label": "Closing"}, {"id": "best_time", "scope": "lead", "kind": "text", "label": "Best time to reach you"}, {"id": "ok_to_leave_message", "scope": "lead", "kind": "bool", "label": "Is it okay to leave a voicemail at this number?"}, {"id": "script_close", "scope": "lead", "kind": "script", "label": "Close (read verbatim)", "script": "That is everything I need. Thank you for your time today, and take care of yourself."}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake',
  'Spine + case criteria. Generated by src/lib/spine.ts composeForm().',
  'published', 2, '[{"id": "s_opening", "scope": "lead", "kind": "section", "label": "Opening"}, {"id": "script_open", "scope": "lead", "kind": "script", "label": "Intro (read verbatim)", "script": "Thank you. My name is ___. I''m calling from the law firm handling your claim. Is now a good time to go through this with you?", "agentNote": "If now is not a good time, schedule the callback and stop here."}, {"id": "ok_to_proceed", "scope": "lead", "kind": "bool", "label": "Is now a good time to proceed?", "agentNote": "If no, schedule the callback. Do not run the intake."}, {"id": "s_gates", "scope": "lead", "kind": "section", "label": "Mandatory gates"}, {"id": "g_represented", "scope": "lead", "kind": "gate", "gateType": "dq", "vital": true, "label": "Are you already represented by another attorney for this matter?", "agentNote": "If YES this is a disqualifier. Do not proceed."}, {"id": "g_injured_party", "scope": "lead", "kind": "bool", "vital": true, "label": "Am I speaking with the injured party?"}, {"id": "g_authority", "scope": "lead", "kind": "bool", "vital": true, "label": "Do you have legal authority to act on their behalf?", "agentNote": "Power of attorney, parent, legal guardian, or executor.", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_injured_party", "scope": "lead", "kind": "section", "label": "Injured party"}, {"id": "ip_first_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal first name", "vital": true}, {"id": "ip_last_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal last name", "vital": true}, {"id": "ip_dob", "scope": "lead", "kind": "date", "label": "Injured party''s date of birth", "vital": true}, {"id": "ip_phone", "scope": "lead", "kind": "phone", "label": "Best phone number", "vital": true}, {"id": "ip_email", "scope": "lead", "kind": "email", "label": "Email address"}, {"id": "s_caller", "scope": "lead", "kind": "section", "label": "Caller"}, {"id": "caller_name", "scope": "lead", "kind": "text", "label": "Caller''s full name", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_phone", "scope": "lead", "kind": "phone", "label": "Caller''s phone", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_relationship", "scope": "lead", "kind": "text", "label": "Relationship to the injured party", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_address", "scope": "lead", "kind": "section", "label": "Mailing address"}, {"id": "mail_addr1", "scope": "lead", "kind": "text", "label": "Street address", "group": "address"}, {"id": "mail_city", "scope": "lead", "kind": "text", "label": "City", "group": "address"}, {"id": "mail_state", "scope": "lead", "kind": "text", "label": "State", "group": "address"}, {"id": "mail_zip", "scope": "lead", "kind": "text", "label": "ZIP", "group": "address"}, {"id": "s_emergency", "scope": "lead", "kind": "section", "label": "Emergency contact"}, {"id": "ec_name", "scope": "lead", "kind": "text", "label": "Emergency contact name", "group": "emergency"}, {"id": "ec_phone", "scope": "lead", "kind": "phone", "label": "Emergency contact phone", "group": "emergency"}, {"id": "ec_relationship", "scope": "lead", "kind": "text", "label": "Relationship", "group": "emergency"}, {"id": "s_prem_criteria", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "s_incident", "scope": "lead", "kind": "section", "label": "The incident"}, {"id": "incident_date", "scope": "lead", "kind": "date", "label": "What date did this happen?", "vital": true}, {"id": "incident_state", "scope": "lead", "kind": "text", "label": "What state did this happen in?", "vital": true}, {"id": "incident_narrative", "scope": "lead", "kind": "longtext", "label": "In your own words, tell me what happened.", "agentNote": "Capture it in their words. Do not lead, do not summarize for them."}, {"id": "s_insurance", "scope": "lead", "kind": "section", "label": "Insurance"}, {"id": "health_insurance", "scope": "lead", "kind": "text", "label": "Health insurance carrier", "group": "insurance"}, {"id": "own_carrier", "scope": "lead", "kind": "text", "label": "Their own insurance carrier", "group": "insurance"}, {"id": "other_carrier", "scope": "lead", "kind": "text", "label": "The other party''s carrier", "group": "insurance"}, {"id": "s_history", "scope": "lead", "kind": "section", "label": "History"}, {"id": "prior_claims", "scope": "lead", "kind": "bool", "label": "Have you made a personal injury claim before?"}, {"id": "prior_attorney", "scope": "lead", "kind": "text", "label": "Which firm handled it?", "showIf": {"match": "all", "rules": [{"fieldId": "prior_claims", "op": "is", "value": "yes"}]}}, {"id": "s_closing", "scope": "lead", "kind": "section", "label": "Closing"}, {"id": "best_time", "scope": "lead", "kind": "text", "label": "Best time to reach you"}, {"id": "ok_to_leave_message", "scope": "lead", "kind": "bool", "label": "Is it okay to leave a voicemail at this number?"}, {"id": "script_close", "scope": "lead", "kind": "script", "label": "Close (read verbatim)", "script": "That is everything I need. Thank you for your time today, and take care of yourself."}]'::jsonb);

-- ============================================================================
-- 0056 REGENERATE FORMS WITH CANONICAL REFERENCE LISTS
-- Insurance fields now point at a carrier reference list, so "State Farm",
-- "Statefarm" and "St. Farm" stop being three different carriers. Free text is
-- still accepted; the list only makes the canonical spelling the easy path.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'Spine + case criteria. Generated by src/lib/spine.ts composeForm().', 'published', 3, '[{"id": "s_opening", "scope": "lead", "kind": "section", "label": "Opening"}, {"id": "script_open", "scope": "lead", "kind": "script", "label": "Intro (read verbatim)", "script": "Thank you. My name is ___. I''m calling from the law firm handling your claim. Is now a good time to go through this with you?", "agentNote": "If now is not a good time, schedule the callback and stop here."}, {"id": "ok_to_proceed", "scope": "lead", "kind": "bool", "label": "Is now a good time to proceed?", "agentNote": "If no, schedule the callback. Do not run the intake."}, {"id": "s_gates", "scope": "lead", "kind": "section", "label": "Mandatory gates"}, {"id": "g_represented", "scope": "lead", "kind": "gate", "gateType": "dq", "vital": true, "label": "Are you already represented by another attorney for this matter?", "agentNote": "If YES this is a disqualifier. Do not proceed."}, {"id": "g_injured_party", "scope": "lead", "kind": "bool", "vital": true, "label": "Am I speaking with the injured party?"}, {"id": "g_authority", "scope": "lead", "kind": "bool", "vital": true, "label": "Do you have legal authority to act on their behalf?", "agentNote": "Power of attorney, parent, legal guardian, or executor.", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_injured_party", "scope": "lead", "kind": "section", "label": "Injured party"}, {"id": "ip_first_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal first name", "vital": true}, {"id": "ip_last_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal last name", "vital": true}, {"id": "ip_dob", "scope": "lead", "kind": "date", "label": "Injured party''s date of birth", "vital": true}, {"id": "ip_phone", "scope": "lead", "kind": "phone", "label": "Best phone number", "vital": true}, {"id": "ip_email", "scope": "lead", "kind": "email", "label": "Email address"}, {"id": "s_caller", "scope": "lead", "kind": "section", "label": "Caller"}, {"id": "caller_name", "scope": "lead", "kind": "text", "label": "Caller''s full name", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_phone", "scope": "lead", "kind": "phone", "label": "Caller''s phone", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_relationship", "scope": "lead", "kind": "text", "label": "Relationship to the injured party", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_address", "scope": "lead", "kind": "section", "label": "Mailing address"}, {"id": "mail_addr1", "scope": "lead", "kind": "text", "label": "Street address", "group": "address"}, {"id": "mail_city", "scope": "lead", "kind": "text", "label": "City", "group": "address"}, {"id": "mail_state", "scope": "lead", "kind": "text", "label": "State", "group": "address"}, {"id": "mail_zip", "scope": "lead", "kind": "text", "label": "ZIP", "group": "address"}, {"id": "s_emergency", "scope": "lead", "kind": "section", "label": "Emergency contact"}, {"id": "ec_name", "scope": "lead", "kind": "text", "label": "Emergency contact name", "group": "emergency"}, {"id": "ec_phone", "scope": "lead", "kind": "phone", "label": "Emergency contact phone", "group": "emergency"}, {"id": "ec_relationship", "scope": "lead", "kind": "text", "label": "Relationship", "group": "emergency"}, {"id": "s_mva_criteria", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "vital": true, "options": ["They are the injured person", "Calling for someone (living)", "The injured person passed away"], "choices": [{"value": "self", "label": "They are the injured person"}, {"value": "alive", "label": "Calling for someone (living)"}, {"value": "deceased", "label": "The injured person passed away"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["Yes, commercial", "No, personal vehicle", "Not sure"], "choices": [{"value": "yes", "label": "Yes, commercial"}, {"value": "no", "label": "No, personal vehicle"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No", "Yes, 1 to 2 nights", "Yes, 3 or more days"], "choices": [{"value": "no", "label": "No"}, {"value": "short", "label": "Yes, 1 to 2 nights"}, {"value": "long", "label": "Yes, 3 or more days"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "The caller caused it", "Shared / partly both", "Not sure"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "caused", "label": "The caller caused it"}, {"value": "shared", "label": "Shared / partly both"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "s_incident", "scope": "lead", "kind": "section", "label": "The incident"}, {"id": "incident_date", "scope": "lead", "kind": "date", "label": "What date did this happen?", "vital": true}, {"id": "incident_state", "scope": "lead", "kind": "text", "label": "What state did this happen in?", "vital": true}, {"id": "incident_narrative", "scope": "lead", "kind": "longtext", "label": "In your own words, tell me what happened.", "agentNote": "Capture it in their words. Do not lead, do not summarize for them."}, {"id": "s_insurance", "scope": "lead", "kind": "section", "label": "Insurance"}, {"id": "health_insurance", "scope": "lead", "kind": "text", "label": "Health insurance carrier", "group": "insurance", "ref": "health_carrier"}, {"id": "own_carrier", "scope": "lead", "kind": "text", "label": "Their own insurance carrier", "group": "insurance", "ref": "auto_carrier"}, {"id": "other_carrier", "scope": "lead", "kind": "text", "label": "The other party''s carrier", "group": "insurance", "ref": "auto_carrier"}, {"id": "s_history", "scope": "lead", "kind": "section", "label": "History"}, {"id": "prior_claims", "scope": "lead", "kind": "bool", "label": "Have you made a personal injury claim before?"}, {"id": "prior_attorney", "scope": "lead", "kind": "text", "label": "Which firm handled it?", "showIf": {"match": "all", "rules": [{"fieldId": "prior_claims", "op": "is", "value": "yes"}]}}, {"id": "s_closing", "scope": "lead", "kind": "section", "label": "Closing"}, {"id": "best_time", "scope": "lead", "kind": "text", "label": "Best time to reach you"}, {"id": "ok_to_leave_message", "scope": "lead", "kind": "bool", "label": "Is it okay to leave a voicemail at this number?"}, {"id": "script_close", "scope": "lead", "kind": "script", "label": "Close (read verbatim)", "script": "That is everything I need. Thank you for your time today, and take care of yourself."}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'Spine + case criteria. Generated by src/lib/spine.ts composeForm().', 'published', 3, '[{"id": "s_opening", "scope": "lead", "kind": "section", "label": "Opening"}, {"id": "script_open", "scope": "lead", "kind": "script", "label": "Intro (read verbatim)", "script": "Thank you. My name is ___. I''m calling from the law firm handling your claim. Is now a good time to go through this with you?", "agentNote": "If now is not a good time, schedule the callback and stop here."}, {"id": "ok_to_proceed", "scope": "lead", "kind": "bool", "label": "Is now a good time to proceed?", "agentNote": "If no, schedule the callback. Do not run the intake."}, {"id": "s_gates", "scope": "lead", "kind": "section", "label": "Mandatory gates"}, {"id": "g_represented", "scope": "lead", "kind": "gate", "gateType": "dq", "vital": true, "label": "Are you already represented by another attorney for this matter?", "agentNote": "If YES this is a disqualifier. Do not proceed."}, {"id": "g_injured_party", "scope": "lead", "kind": "bool", "vital": true, "label": "Am I speaking with the injured party?"}, {"id": "g_authority", "scope": "lead", "kind": "bool", "vital": true, "label": "Do you have legal authority to act on their behalf?", "agentNote": "Power of attorney, parent, legal guardian, or executor.", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_injured_party", "scope": "lead", "kind": "section", "label": "Injured party"}, {"id": "ip_first_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal first name", "vital": true}, {"id": "ip_last_name", "scope": "lead", "kind": "text", "label": "Injured party''s legal last name", "vital": true}, {"id": "ip_dob", "scope": "lead", "kind": "date", "label": "Injured party''s date of birth", "vital": true}, {"id": "ip_phone", "scope": "lead", "kind": "phone", "label": "Best phone number", "vital": true}, {"id": "ip_email", "scope": "lead", "kind": "email", "label": "Email address"}, {"id": "s_caller", "scope": "lead", "kind": "section", "label": "Caller"}, {"id": "caller_name", "scope": "lead", "kind": "text", "label": "Caller''s full name", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_phone", "scope": "lead", "kind": "phone", "label": "Caller''s phone", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "caller_relationship", "scope": "lead", "kind": "text", "label": "Relationship to the injured party", "group": "caller", "showIf": {"match": "all", "rules": [{"fieldId": "g_injured_party", "op": "is", "value": "no"}]}}, {"id": "s_address", "scope": "lead", "kind": "section", "label": "Mailing address"}, {"id": "mail_addr1", "scope": "lead", "kind": "text", "label": "Street address", "group": "address"}, {"id": "mail_city", "scope": "lead", "kind": "text", "label": "City", "group": "address"}, {"id": "mail_state", "scope": "lead", "kind": "text", "label": "State", "group": "address"}, {"id": "mail_zip", "scope": "lead", "kind": "text", "label": "ZIP", "group": "address"}, {"id": "s_emergency", "scope": "lead", "kind": "section", "label": "Emergency contact"}, {"id": "ec_name", "scope": "lead", "kind": "text", "label": "Emergency contact name", "group": "emergency"}, {"id": "ec_phone", "scope": "lead", "kind": "phone", "label": "Emergency contact phone", "group": "emergency"}, {"id": "ec_relationship", "scope": "lead", "kind": "text", "label": "Relationship", "group": "emergency"}, {"id": "s_prem_criteria", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "s_incident", "scope": "lead", "kind": "section", "label": "The incident"}, {"id": "incident_date", "scope": "lead", "kind": "date", "label": "What date did this happen?", "vital": true}, {"id": "incident_state", "scope": "lead", "kind": "text", "label": "What state did this happen in?", "vital": true}, {"id": "incident_narrative", "scope": "lead", "kind": "longtext", "label": "In your own words, tell me what happened.", "agentNote": "Capture it in their words. Do not lead, do not summarize for them."}, {"id": "s_insurance", "scope": "lead", "kind": "section", "label": "Insurance"}, {"id": "health_insurance", "scope": "lead", "kind": "text", "label": "Health insurance carrier", "group": "insurance", "ref": "health_carrier"}, {"id": "own_carrier", "scope": "lead", "kind": "text", "label": "Their own insurance carrier", "group": "insurance", "ref": "auto_carrier"}, {"id": "other_carrier", "scope": "lead", "kind": "text", "label": "The other party''s carrier", "group": "insurance", "ref": "auto_carrier"}, {"id": "s_history", "scope": "lead", "kind": "section", "label": "History"}, {"id": "prior_claims", "scope": "lead", "kind": "bool", "label": "Have you made a personal injury claim before?"}, {"id": "prior_attorney", "scope": "lead", "kind": "text", "label": "Which firm handled it?", "showIf": {"match": "all", "rules": [{"fieldId": "prior_claims", "op": "is", "value": "yes"}]}}, {"id": "s_closing", "scope": "lead", "kind": "section", "label": "Closing"}, {"id": "best_time", "scope": "lead", "kind": "text", "label": "Best time to reach you"}, {"id": "ok_to_leave_message", "scope": "lead", "kind": "bool", "label": "Is it okay to leave a voicemail at this number?"}, {"id": "script_close", "scope": "lead", "kind": "script", "label": "Close (read verbatim)", "script": "That is everything I need. Thank you for your time today, and take care of yourself."}]'::jsonb);

-- ============================================================================
-- 0057 REVERT TO THE APPROVED SCRIPT
--
-- Migration 0055 wrapped the approved MVA/premises questions in a generic
-- "spine" I authored: an opening that claimed we were the firm handling the
-- claim (untrue on an unsigned lead, and against the firm's own compliance
-- rules), a permission question that invites a no on an inbound call, and an
-- order that asked a stranger for their mailing address and emergency contact
-- BEFORE telling them whether they had a case.
--
-- The funnel rule, stated plainly: verify the criteria first, collect details
-- after. Nobody gives you their address and their cousin's phone number until
-- they know you can help them.
--
-- These forms are now exactly the approved call script and nothing else.
-- Contact detail lives in the Contact Info tab and in the console's post-
-- signature capture, which is where it belongs.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake',
  'The approved call script, nothing added. Criteria only; contact detail is captured after the file qualifies.',
  'published', 4, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "vital": true, "options": ["They are the injured person", "Calling for someone (living)", "The injured person passed away"], "choices": [{"value": "self", "label": "They are the injured person"}, {"value": "alive", "label": "Calling for someone (living)"}, {"value": "deceased", "label": "The injured person passed away"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["Yes, commercial", "No, personal vehicle", "Not sure"], "choices": [{"value": "yes", "label": "Yes, commercial"}, {"value": "no", "label": "No, personal vehicle"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No", "Yes, 1 to 2 nights", "Yes, 3 or more days"], "choices": [{"value": "no", "label": "No"}, {"value": "short", "label": "Yes, 1 to 2 nights"}, {"value": "long", "label": "Yes, 3 or more days"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "The caller caused it", "Shared / partly both", "Not sure"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "caused", "label": "The caller caused it"}, {"value": "shared", "label": "Shared / partly both"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake',
  'The approved call script, nothing added. Criteria only; contact detail is captured after the file qualifies.',
  'published', 4, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Been seen once", "Still treating", "Finished treatment", "Stopped treating", "Never been seen"], "choices": [{"value": "treated", "label": "Been seen once"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped treating"}, {"value": "never", "label": "Never been seen"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0058 THE TMT QUESTION SET, COMPLETE
--
-- Adds the questions from the firm's own written intake list that we were not
-- asking: the incident description, driver/passenger/pedestrian/cyclist, police
-- report, citations, ongoing symptoms, and the three coverage questions.
--
-- Coverage is asked BEFORE the signature, and only a definite no on all three
-- blocks a signature. "Not sure" is never treated as a no: coverage nobody knew
-- about is what rescues these files.
--
-- Remaining capture (incident location, vehicle status, preferred language,
-- best time to reach) happens after the signature, because nothing about it
-- changes whether we sign.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'The approved call script. Criteria and coverage before the signature; everything else captured after.', 'published', 5, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "vital": true, "options": ["The caller was injured", "Calling for someone else (they are alive)", "The injured person passed away"], "choices": [{"value": "self", "label": "The caller was injured"}, {"value": "alive", "label": "Calling for someone else (they are alive)"}, {"value": "deceased", "label": "The injured person passed away"}]}, {"id": "role", "scope": "lead", "kind": "select", "label": "Were you the driver, a passenger, a pedestrian, or a cyclist?", "vital": true, "options": ["Driver", "Passenger", "Pedestrian", "Cyclist"], "choices": [{"value": "driver", "label": "Driver"}, {"value": "passenger", "label": "Passenger"}, {"value": "pedestrian", "label": "Pedestrian"}, {"value": "cyclist", "label": "Cyclist"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes \u2014 power of attorney, or parent/guardian of a minor", "No authority"], "choices": [{"value": "yes", "label": "Yes \u2014 power of attorney, or parent/guardian of a minor"}, {"value": "no", "label": "No authority"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["No, a regular passenger vehicle", "Yes, a commercial vehicle", "Not sure"], "choices": [{"value": "no", "label": "No, a regular passenger vehicle"}, {"value": "yes", "label": "Yes, a commercial vehicle"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes, injured", "No injuries at all"], "choices": [{"value": "yes", "label": "Yes, injured"}, {"value": "no", "label": "No injuries at all"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No, or a same-day ER visit", "Yes, but less than 3 days", "Yes, more than 3 days"], "choices": [{"value": "no", "label": "No, or a same-day ER visit"}, {"value": "short", "label": "Yes, but less than 3 days"}, {"value": "long", "label": "Yes, more than 3 days"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "Shared or not sure", "The caller caused it"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "shared", "label": "Shared or not sure"}, {"value": "caused", "label": "The caller caused it"}]}, {"id": "police_report", "scope": "lead", "kind": "select", "label": "Was a police report made?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "citations", "scope": "lead", "kind": "select", "label": "Were any citations issued, and to whom?", "vital": true, "options": ["The other driver was cited", "The caller was cited", "No citations", "Not sure"], "choices": [{"value": "other", "label": "The other driver was cited"}, {"value": "caller", "label": "The caller was cited"}, {"value": "none", "label": "No citations"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes"}]}, {"id": "what_happened", "scope": "lead", "kind": "longtext", "label": "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.", "vital": true, "agentNote": "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\""}, {"id": "agent_read", "scope": "lead", "kind": "select", "label": "", "vital": true, "agentNote": "Your call, not the caller''s. This is recorded and compared against the outcome.", "options": ["Yes, this sounds like a case", "Not sure yet", "No, this does not sound like a case"], "choices": [{"value": "yes", "label": "Yes, this sounds like a case"}, {"value": "maybe", "label": "Not sure yet"}, {"value": "no", "label": "No, this does not sound like a case"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "ins_other", "scope": "lead", "kind": "select", "label": "Was there insurance on the other driver?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "ins_own", "scope": "lead", "kind": "select", "label": "And do you carry insurance yourself?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "ins_uim", "scope": "lead", "kind": "select", "label": "Do you have uninsured or underinsured motorist coverage on your own policy?", "vital": true, "agentNote": "Most people do not know. Unsure is the most common honest answer and it is fine.", "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'The approved call script. Criteria and coverage before the signature; everything else captured after.', 'published', 5, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);
