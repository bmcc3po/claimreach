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

-- ============================================================================
-- 0059 ASK ORDER, THE STATE QUESTION, AND THE PARAGRAPH BOX
--
-- Date of incident moves to question 7 and city/state rides right beside it,
-- because state drives the statute of limitations. Treatment follows injury
-- immediately, so a year-old wreck where nobody ever treated dies inside the
-- first ten questions instead of the last five.
--
-- The narrative is a paragraph box: Enter adds a line rather than advancing.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'Approved script in ask order: story, then date and state, then injury and treatment.', 'published', 6, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Are you the person who was injured, or are you calling for someone close to you?", "vital": true, "options": ["The caller was injured", "Calling for someone else (they are alive)", "The injured person passed away"], "choices": [{"value": "self", "label": "The caller was injured"}, {"value": "alive", "label": "Calling for someone else (they are alive)"}, {"value": "deceased", "label": "The injured person passed away", "note": "Wrongful death"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes \u2014 power of attorney, or parent/guardian of a minor", "No authority"], "choices": [{"value": "yes", "label": "Yes \u2014 power of attorney, or parent/guardian of a minor", "note": "May continue and sign"}, {"value": "no", "label": "No authority", "note": "Callback the injured person"}]}, {"id": "role", "scope": "lead", "kind": "select", "label": "Were you the driver, a passenger, a pedestrian, or a cyclist?", "vital": true, "options": ["Driver", "Passenger", "Pedestrian", "Cyclist"], "choices": [{"value": "driver", "label": "Driver"}, {"value": "passenger", "label": "Passenger"}, {"value": "pedestrian", "label": "Pedestrian"}, {"value": "cyclist", "label": "Cyclist"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Do not ask who; do not comment on the other firm"}]}, {"id": "what_happened", "scope": "lead", "kind": "longtext", "label": "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.", "vital": true, "agentNote": "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\""}, {"id": "agent_read", "scope": "lead", "kind": "select", "label": "agent_read", "vital": true, "agentNote": "Your call, not the caller''s. This is recorded and compared against the outcome.", "options": ["Yes, this sounds like a case", "Not sure yet", "No, this does not sound like a case"], "choices": [{"value": "yes", "label": "Yes, this sounds like a case"}, {"value": "maybe", "label": "Not sure yet"}, {"value": "no", "label": "No, this does not sound like a case", "note": "Keep going anyway. The questions decide, not the hunch"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the accident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "incident_city_state", "scope": "lead", "kind": "longtext", "label": "And where did this happen? City and state.", "vital": true, "agentNote": "Ask this every single time, right alongside the date. State drives the statute of limitations and the venue."}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes, injured", "No injuries at all"], "choices": [{"value": "yes", "label": "Yes, injured"}, {"value": "no", "label": "No injuries at all"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No, or a same-day ER visit", "Yes, but less than 3 days", "Yes, more than 3 days"], "choices": [{"value": "no", "label": "No, or a same-day ER visit"}, {"value": "short", "label": "Yes, but less than 3 days"}, {"value": "long", "label": "Yes, more than 3 days", "note": "Flags for secondary review, escalate while on the call"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "In your own words, whose fault was the accident?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "Shared or not sure", "The caller caused it"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "shared", "label": "Shared or not sure"}, {"value": "caused", "label": "The caller caused it"}]}, {"id": "police_report", "scope": "lead", "kind": "select", "label": "Was a police report made?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "citations", "scope": "lead", "kind": "select", "label": "Were any citations issued, and to whom?", "vital": true, "options": ["The other driver was cited", "The caller was cited", "No citations", "Not sure"], "choices": [{"value": "other", "label": "The other driver was cited"}, {"value": "caller", "label": "The caller was cited", "note": "Does not automatically disqualify. Keep going"}, {"value": "none", "label": "No citations"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["No, a regular passenger vehicle", "Yes, a commercial vehicle", "Not sure"], "choices": [{"value": "no", "label": "No, a regular passenger vehicle"}, {"value": "yes", "label": "Yes, a commercial vehicle", "note": "Flags for secondary review"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Car repair money alone is not an injury release"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "ins_other", "scope": "lead", "kind": "select", "label": "Was there insurance on the other driver?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_own", "scope": "lead", "kind": "select", "label": "And do you carry insurance yourself?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_uim", "scope": "lead", "kind": "select", "label": "Do you have uninsured or underinsured motorist coverage on your own policy?", "vital": true, "agentNote": "Most people do not know. Unsure is the most common honest answer and it is fine.", "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'Approved script in ask order: story, then date and state, then injury and treatment.', 'published', 6, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0060 LEADS CAN BE DELETED AGAIN
--
-- Every foreign key pointing at leads cascades on delete except one:
-- intake_calls.lead_id, added in 0049, had no delete rule at all. The console
-- writes an intake_calls row on every single call, so any lead created through
-- Take a Call could not be deleted, individually or in bulk. Postgres refused
-- the delete and the UI reported nothing useful.
--
-- SET NULL rather than CASCADE on purpose: the call log is the billing and
-- audit record. Deleting a junk test lead should not erase the evidence that a
-- call happened, and lead_id is already nullable for unmatched calls.
-- Idempotent.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'intake_calls_lead_id_fkey'
      and table_name = 'intake_calls'
  ) then
    alter table intake_calls drop constraint intake_calls_lead_id_fkey;
  end if;
end $$;

alter table intake_calls
  add constraint intake_calls_lead_id_fkey
  foreign key (lead_id) references leads(id) on delete set null;

-- ============================================================================
-- 0061 THE ADDRESS COLUMNS THAT NEVER EXISTED
--
-- Ten files write and read leads.mail_addr1 / mail_addr2. Neither column was
-- ever created; the table has a single mail_addr. Postgres rejects an UPDATE
-- naming a column that does not exist, and it rejects the WHOLE statement, so:
--
--   * the console's identity capture failed entirely — name, DOB, phone, email
--     and address never persisted, which meant a live retainer went out with a
--     blank name and no address
--   * the Contact Info tab could not save anything, including the phone number,
--     because one bad field name killed the whole update
--   * retainer autofill read mail_addr1 and always got nothing
--   * the file header showed "Not collected" forever
--
-- Adding the columns rather than rewriting ten files: addr1/addr2 is also the
-- correct shape, since apartment and unit numbers need their own line for the
-- retainer and for mail that actually arrives.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists mail_addr1 text;
alter table leads add column if not exists mail_addr2 text;

-- Carry over anything captured under an older single-line column, IF one exists.
-- Guarded because mail_addr turned out never to have been created either: it
-- lives in a migration that was written but never applied, so an unguarded
-- backfill aborts the whole script after the columns are already added.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'leads' and column_name = 'mail_addr'
  ) then
    execute $sql$
      update leads
      set mail_addr1 = mail_addr
      where mail_addr1 is null and mail_addr is not null and mail_addr <> ''
    $sql$;
  end if;
end $$;

comment on column leads.mail_addr1 is 'Street address line 1. Canonical: the app writes here, not mail_addr.';
comment on column leads.mail_addr2 is 'Apartment, suite or unit number.';

-- ============================================================================
-- 0062 REAL DATE, TIME, AND THE POLICE REPORT
--
-- The date question captured a bucket ("31 days to under 9 months"), which is
-- useless for a statute of limitations and useless in a demand letter. It now
-- captures the actual date and the criteria derive the bucket from it, so old
-- files with bucket values still evaluate.
--
-- Adds time of day (police pull reports by date AND time), which department
-- responded, and the report number. The last two only appear when a report was
-- actually made.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'Approved script. Real incident date and time, responding agency and report number.', 'published', 7, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Record what they just told you", "vital": true, "agentNote": "They answered this in the greeting. Do not ask again, just tap it.", "options": ["The caller was injured", "Calling for someone else (they are alive)", "The injured person passed away"], "choices": [{"value": "self", "label": "The caller was injured"}, {"value": "alive", "label": "Calling for someone else (they are alive)"}, {"value": "deceased", "label": "The injured person passed away", "note": "Wrongful death"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes \u2014 power of attorney, or parent/guardian of a minor", "No authority"], "choices": [{"value": "yes", "label": "Yes \u2014 power of attorney, or parent/guardian of a minor", "note": "May continue and sign"}, {"value": "no", "label": "No authority", "note": "Callback the injured person"}]}, {"id": "role", "scope": "lead", "kind": "select", "label": "Were you the driver, a passenger, a pedestrian, or a cyclist?", "vital": true, "options": ["Driver", "Passenger", "Pedestrian", "Cyclist"], "choices": [{"value": "driver", "label": "Driver"}, {"value": "passenger", "label": "Passenger"}, {"value": "pedestrian", "label": "Pedestrian"}, {"value": "cyclist", "label": "Cyclist"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Do not ask who; do not comment on the other firm"}]}, {"id": "what_happened", "scope": "lead", "kind": "longtext", "label": "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.", "vital": true, "agentNote": "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\""}, {"id": "agent_read", "scope": "lead", "kind": "select", "label": "agent_read", "vital": true, "agentNote": "Your call, not the caller''s. This is recorded and compared against the outcome.", "options": ["Yes, this sounds like a case", "Not sure yet", "No, this does not sound like a case"], "choices": [{"value": "yes", "label": "Yes, this sounds like a case"}, {"value": "maybe", "label": "Not sure yet"}, {"value": "no", "label": "No, this does not sound like a case", "note": "Keep going anyway. The questions decide, not the hunch"}]}, {"id": "date", "scope": "lead", "kind": "date", "label": "What was the exact date of the accident?", "vital": true, "agentNote": "Get the real date, not a rough guess. The statute of limitations runs from this day and the firm calculates deadlines off it."}, {"id": "incident_time", "scope": "lead", "kind": "longtext", "label": "And roughly what time of day was it?", "vital": true, "agentNote": "Approximate is fine, e.g. 7:30 AM or just after dark. Police pull reports by date AND time."}, {"id": "incident_city_state", "scope": "lead", "kind": "longtext", "label": "And where did this happen? City and state.", "vital": true, "agentNote": "Ask this every single time, right alongside the date. State drives the statute of limitations and the venue."}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes, injured", "No injuries at all"], "choices": [{"value": "yes", "label": "Yes, injured"}, {"value": "no", "label": "No injuries at all"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No, or a same-day ER visit", "Yes, but less than 3 days", "Yes, more than 3 days"], "choices": [{"value": "no", "label": "No, or a same-day ER visit"}, {"value": "short", "label": "Yes, but less than 3 days"}, {"value": "long", "label": "Yes, more than 3 days", "note": "Flags for secondary review, escalate while on the call"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "Do you believe you or the other party was at fault?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "Shared or not sure", "The caller caused it"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "shared", "label": "Shared or not sure"}, {"value": "caused", "label": "The caller caused it"}]}, {"id": "police_report", "scope": "lead", "kind": "select", "label": "Was a police report made?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "police_agency", "scope": "lead", "kind": "longtext", "label": "Do you know which department responded?", "vital": true, "agentNote": "City police, county sheriff, or a state trooper. If they are unsure, leave it, the location lookup narrows it after the signature."}, {"id": "police_report_number", "scope": "lead", "kind": "longtext", "label": "And do you have the report or case number?", "vital": true, "agentNote": "Often on a card or slip handed over at the scene. If they do not have it, that is fine, we order it by date and location."}, {"id": "citations", "scope": "lead", "kind": "select", "label": "Were any citations issued, and to whom?", "vital": true, "options": ["The other driver was cited", "The caller was cited", "No citations", "Not sure"], "choices": [{"value": "other", "label": "The other driver was cited"}, {"value": "caller", "label": "The caller was cited", "note": "Does not automatically disqualify. Keep going"}, {"value": "none", "label": "No citations"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["No, a regular passenger vehicle", "Yes, a commercial vehicle", "Not sure"], "choices": [{"value": "no", "label": "No, a regular passenger vehicle"}, {"value": "yes", "label": "Yes, a commercial vehicle", "note": "Flags for secondary review"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Car repair money alone is not an injury release"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "ins_other", "scope": "lead", "kind": "select", "label": "Was there insurance on the other driver?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_own", "scope": "lead", "kind": "select", "label": "And do you carry insurance yourself?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_uim", "scope": "lead", "kind": "select", "label": "Do you have uninsured or underinsured motorist coverage on your own policy?", "vital": true, "agentNote": "Most people do not know. Unsure is the most common honest answer and it is fine.", "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'Approved script. Real incident date and time, responding agency and report number.', 'published', 7, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0063 WILLINGNESS TO RESUME TREATMENT
--
-- A finished or abandoned course of care is worth materially more if the client
-- is still willing to be seen, so ask. Only appears once treatment has ended,
-- since there is nothing to resume otherwise.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'Approved script. Real date with age calculator, time, agency, report number, willingness to resume treatment.', 'published', 8, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Record what they just told you", "vital": true, "agentNote": "They answered this in the greeting. Do not ask again, just tap it.", "options": ["The caller was injured", "Calling for someone else (they are alive)", "The injured person passed away"], "choices": [{"value": "self", "label": "The caller was injured"}, {"value": "alive", "label": "Calling for someone else (they are alive)"}, {"value": "deceased", "label": "The injured person passed away", "note": "Wrongful death"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes \u2014 power of attorney, or parent/guardian of a minor", "No authority"], "choices": [{"value": "yes", "label": "Yes \u2014 power of attorney, or parent/guardian of a minor", "note": "May continue and sign"}, {"value": "no", "label": "No authority", "note": "Callback the injured person"}]}, {"id": "role", "scope": "lead", "kind": "select", "label": "Were you the driver, a passenger, a pedestrian, or a cyclist?", "vital": true, "options": ["Driver", "Passenger", "Pedestrian", "Cyclist"], "choices": [{"value": "driver", "label": "Driver"}, {"value": "passenger", "label": "Passenger"}, {"value": "pedestrian", "label": "Pedestrian"}, {"value": "cyclist", "label": "Cyclist"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Do not ask who; do not comment on the other firm"}]}, {"id": "what_happened", "scope": "lead", "kind": "longtext", "label": "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.", "vital": true, "agentNote": "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\""}, {"id": "agent_read", "scope": "lead", "kind": "select", "label": "agent_read", "vital": true, "agentNote": "Your call, not the caller''s. This is recorded and compared against the outcome.", "options": ["Yes, this sounds like a case", "Not sure yet", "No, this does not sound like a case"], "choices": [{"value": "yes", "label": "Yes, this sounds like a case"}, {"value": "maybe", "label": "Not sure yet"}, {"value": "no", "label": "No, this does not sound like a case", "note": "Keep going anyway. The questions decide, not the hunch"}]}, {"id": "date", "scope": "lead", "kind": "date", "label": "What was the exact date of the accident?", "vital": true, "agentNote": "Get the real date, not a rough guess. The statute of limitations runs from this day and the firm calculates deadlines off it."}, {"id": "incident_time", "scope": "lead", "kind": "longtext", "label": "And roughly what time of day was it?", "vital": true, "agentNote": "Approximate is fine, e.g. 7:30 AM or just after dark. Police pull reports by date AND time."}, {"id": "incident_city_state", "scope": "lead", "kind": "longtext", "label": "And where did this happen? City and state.", "vital": true, "agentNote": "Ask this every single time, right alongside the date. State drives the statute of limitations and the venue."}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes, injured", "No injuries at all"], "choices": [{"value": "yes", "label": "Yes, injured"}, {"value": "no", "label": "No injuries at all"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "willing_more", "scope": "lead", "kind": "select", "label": "If a doctor suggests more treatment, are you willing to go?", "vital": true, "agentNote": "Only asked when treatment has already ended. A finished or abandoned course of care is worth far more if they are still willing to be seen.", "options": ["Yes, willing to go back", "No, they are done", "Not sure"], "choices": [{"value": "yes", "label": "Yes, willing to go back"}, {"value": "no", "label": "No, they are done", "note": "Weakens the file. Flag it in your notes"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No, or a same-day ER visit", "Yes, but less than 3 days", "Yes, more than 3 days"], "choices": [{"value": "no", "label": "No, or a same-day ER visit"}, {"value": "short", "label": "Yes, but less than 3 days"}, {"value": "long", "label": "Yes, more than 3 days", "note": "Flags for secondary review, escalate while on the call"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "Do you believe you or the other party was at fault?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "Shared or not sure", "The caller caused it"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "shared", "label": "Shared or not sure"}, {"value": "caused", "label": "The caller caused it"}]}, {"id": "police_report", "scope": "lead", "kind": "select", "label": "Was a police report made?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "police_agency", "scope": "lead", "kind": "longtext", "label": "Do you know which department responded?", "vital": true, "agentNote": "City police, county sheriff, or a state trooper. If they are unsure, leave it, the location lookup narrows it after the signature."}, {"id": "police_report_number", "scope": "lead", "kind": "longtext", "label": "And do you have the report or case number?", "vital": true, "agentNote": "Often on a card or slip handed over at the scene. If they do not have it, that is fine, we order it by date and location."}, {"id": "citations", "scope": "lead", "kind": "select", "label": "Were any citations issued, and to whom?", "vital": true, "options": ["The other driver was cited", "The caller was cited", "No citations", "Not sure"], "choices": [{"value": "other", "label": "The other driver was cited"}, {"value": "caller", "label": "The caller was cited", "note": "Does not automatically disqualify. Keep going"}, {"value": "none", "label": "No citations"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["No, a regular passenger vehicle", "Yes, a commercial vehicle", "Not sure"], "choices": [{"value": "no", "label": "No, a regular passenger vehicle"}, {"value": "yes", "label": "Yes, a commercial vehicle", "note": "Flags for secondary review"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Car repair money alone is not an injury release"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "ins_other", "scope": "lead", "kind": "select", "label": "Was there insurance on the other driver?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_own", "scope": "lead", "kind": "select", "label": "And do you carry insurance yourself?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_uim", "scope": "lead", "kind": "select", "label": "Do you have uninsured or underinsured motorist coverage on your own policy?", "vital": true, "agentNote": "Most people do not know. Unsure is the most common honest answer and it is fine.", "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'Approved script. Real date with age calculator, time, agency, report number, willingness to resume treatment.', 'published', 8, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "willing_more", "scope": "lead", "kind": "select", "label": "If a doctor suggests more treatment, are you willing to go?", "vital": true, "agentNote": "Only asked when treatment has already ended. A finished or abandoned course of care is worth far more if they are still willing to be seen.", "options": ["Yes, willing to go back", "No, they are done", "Not sure"], "choices": [{"value": "yes", "label": "Yes, willing to go back"}, {"value": "no", "label": "No, they are done", "note": "Weakens the file. Flag it in your notes"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0064 THE LAST OF THE PHANTOM COLUMNS, AND QA THAT SURVIVES A CLICK
--
-- Part one: a full audit of every contact field id against the real schema
-- turned up four more columns the UI writes to that were never created. Same
-- failure as mail_addr1: Postgres rejects the whole UPDATE, so one phantom
-- field silently threw away every other change on the form.
--
--   caller_dob         the caller's date of birth, when they are not the injured party
--   caller_phone_alt   a second number for the caller
--   mm_married         medical malpractice: married at the time
--   mm_spouse_name     medical malpractice: spouse name, for consortium
--
-- Part two: QA grades only existed in React state until a decision button was
-- pressed, so clicking to another tab threw the whole review away. qa_draft
-- holds the in-progress grades so a reviewer can leave the file and come back.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists caller_dob        date;
alter table leads add column if not exists caller_phone_alt  text;
alter table leads add column if not exists mm_married        text;
alter table leads add column if not exists mm_spouse_name    text;

-- In-progress QA review. Not a substitute for qa_reviews, which stays the
-- permanent record written when a decision is actually made.
alter table leads add column if not exists qa_draft jsonb;

comment on column leads.qa_draft is
  'In-progress QA grades, autosaved. The submitted review lives in qa_reviews.';

-- ============================================================================
-- 0065 TIME OF DAY IS A PICKER
-- Free text gave "2", "afternoon" and "around 2ish" for the same answer, none of
-- it reportable and none of it usable for pulling a report. Standardize wherever
-- standardizing is possible.
-- Idempotent.
-- ============================================================================

delete from intake_forms where claim_type = 'mva';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'mva', 'MVA intake', 'Approved script with a real date and a time picker.', 'published', 9, '[{"id": "s_mva", "scope": "lead", "kind": "section", "label": "Accident criteria"}, {"id": "authority", "scope": "lead", "kind": "select", "label": "Record what they just told you", "vital": true, "agentNote": "They answered this in the greeting. Do not ask again, just tap it.", "options": ["The caller was injured", "Calling for someone else (they are alive)", "The injured person passed away"], "choices": [{"value": "self", "label": "The caller was injured"}, {"value": "alive", "label": "Calling for someone else (they are alive)"}, {"value": "deceased", "label": "The injured person passed away", "note": "Wrongful death"}]}, {"id": "poa", "scope": "lead", "kind": "bool", "label": "Do you have power of attorney for them, or are you their parent or legal guardian?", "vital": true, "options": ["Yes \u2014 power of attorney, or parent/guardian of a minor", "No authority"], "choices": [{"value": "yes", "label": "Yes \u2014 power of attorney, or parent/guardian of a minor", "note": "May continue and sign"}, {"value": "no", "label": "No authority", "note": "Callback the injured person"}]}, {"id": "role", "scope": "lead", "kind": "select", "label": "Were you the driver, a passenger, a pedestrian, or a cyclist?", "vital": true, "options": ["Driver", "Passenger", "Pedestrian", "Cyclist"], "choices": [{"value": "driver", "label": "Driver"}, {"value": "passenger", "label": "Passenger"}, {"value": "pedestrian", "label": "Pedestrian"}, {"value": "cyclist", "label": "Cyclist"}]}, {"id": "attorney", "scope": "lead", "kind": "bool", "label": "Are you already working with an attorney on this accident?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Do not ask who; do not comment on the other firm"}]}, {"id": "what_happened", "scope": "lead", "kind": "longtext", "label": "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.", "vital": true, "agentNote": "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\""}, {"id": "agent_read", "scope": "lead", "kind": "select", "label": "agent_read", "vital": true, "agentNote": "Your call, not the caller''s. This is recorded and compared against the outcome.", "options": ["Yes, this sounds like a case", "Not sure yet", "No, this does not sound like a case"], "choices": [{"value": "yes", "label": "Yes, this sounds like a case"}, {"value": "maybe", "label": "Not sure yet"}, {"value": "no", "label": "No, this does not sound like a case", "note": "Keep going anyway. The questions decide, not the hunch"}]}, {"id": "date", "scope": "lead", "kind": "date", "label": "What was the exact date of the accident?", "vital": true, "agentNote": "Get the real date, not a rough guess. The statute of limitations runs from this day and the firm calculates deadlines off it."}, {"id": "incident_time", "scope": "lead", "kind": "text", "label": "And roughly what time of day was it?", "vital": true, "agentNote": "Close enough is fine. Police pull reports by date AND time, so an approximate hour still narrows it."}, {"id": "incident_city_state", "scope": "lead", "kind": "longtext", "label": "And where did this happen? City and state.", "vital": true, "agentNote": "Ask this every single time, right alongside the date. State drives the statute of limitations and the venue."}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the accident?", "vital": true, "options": ["Yes, injured", "No injuries at all"], "choices": [{"value": "yes", "label": "Yes, injured"}, {"value": "no", "label": "No injuries at all"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "willing_more", "scope": "lead", "kind": "select", "label": "If a doctor suggests more treatment, are you willing to go?", "vital": true, "agentNote": "Only asked when treatment has already ended. A finished or abandoned course of care is worth far more if they are still willing to be seen.", "options": ["Yes, willing to go back", "No, they are done", "Not sure"], "choices": [{"value": "yes", "label": "Yes, willing to go back"}, {"value": "no", "label": "No, they are done", "note": "Weakens the file. Flag it in your notes"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "hosp", "scope": "lead", "kind": "select", "label": "Were you kept in the hospital overnight?", "vital": true, "options": ["No, or a same-day ER visit", "Yes, but less than 3 days", "Yes, more than 3 days"], "choices": [{"value": "no", "label": "No, or a same-day ER visit"}, {"value": "short", "label": "Yes, but less than 3 days"}, {"value": "long", "label": "Yes, more than 3 days", "note": "Flags for secondary review, escalate while on the call"}]}, {"id": "fault", "scope": "lead", "kind": "select", "label": "Do you believe you or the other party was at fault?", "vital": true, "agentNote": "The caller states fault. Never tell them who was at fault.", "options": ["The other driver", "Shared or not sure", "The caller caused it"], "choices": [{"value": "other", "label": "The other driver"}, {"value": "shared", "label": "Shared or not sure"}, {"value": "caused", "label": "The caller caused it"}]}, {"id": "police_report", "scope": "lead", "kind": "select", "label": "Was a police report made?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "police_agency", "scope": "lead", "kind": "longtext", "label": "Do you know which department responded?", "vital": true, "agentNote": "City police, county sheriff, or a state trooper. If they are unsure, leave it, the location lookup narrows it after the signature."}, {"id": "police_report_number", "scope": "lead", "kind": "longtext", "label": "And do you have the report or case number?", "vital": true, "agentNote": "Often on a card or slip handed over at the scene. If they do not have it, that is fine, we order it by date and location."}, {"id": "citations", "scope": "lead", "kind": "select", "label": "Were any citations issued, and to whom?", "vital": true, "options": ["The other driver was cited", "The caller was cited", "No citations", "Not sure"], "choices": [{"value": "other", "label": "The other driver was cited"}, {"value": "caller", "label": "The caller was cited", "note": "Does not automatically disqualify. Keep going"}, {"value": "none", "label": "No citations"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "commercial", "scope": "lead", "kind": "select", "label": "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?", "vital": true, "options": ["No, a regular passenger vehicle", "Yes, a commercial vehicle", "Not sure"], "choices": [{"value": "no", "label": "No, a regular passenger vehicle"}, {"value": "yes", "label": "Yes, a commercial vehicle", "note": "Flags for secondary review"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "settled", "scope": "lead", "kind": "bool", "label": "Have you already settled this, or signed a release with any insurance company?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Car repair money alone is not an injury release"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}, {"id": "ins_other", "scope": "lead", "kind": "select", "label": "Was there insurance on the other driver?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_own", "scope": "lead", "kind": "select", "label": "And do you carry insurance yourself?", "vital": true, "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}, {"id": "ins_uim", "scope": "lead", "kind": "select", "label": "Do you have uninsured or underinsured motorist coverage on your own policy?", "vital": true, "agentNote": "Most people do not know. Unsure is the most common honest answer and it is fine.", "options": ["Yes", "No", "Not sure"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}, {"value": "unsure", "label": "Not sure", "note": "Not sure is not a no. Keep going"}]}]'::jsonb);

delete from intake_forms where claim_type = 'prem';
insert into intake_forms (firm_id, claim_type, name, description, status, version, fields)
values (null, 'prem', 'Premises intake', 'Approved script with a real date and a time picker.', 'published', 9, '[{"id": "s_prem", "scope": "lead", "kind": "section", "label": "Premises criteria"}, {"id": "presence", "scope": "lead", "kind": "bool", "label": "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?", "vital": true, "options": ["Yes, lawfully there", "No / trespassing"], "choices": [{"value": "yes", "label": "Yes, lawfully there"}, {"value": "no", "label": "No / trespassing"}]}, {"id": "date", "scope": "lead", "kind": "select", "label": "When did the incident happen?", "vital": true, "options": ["Within the last 30 days", "31 days to under 9 months", "9 months or older"], "choices": [{"value": "le30", "label": "Within the last 30 days"}, {"value": "mid", "label": "31 days to under 9 months"}, {"value": "old", "label": "9 months or older"}]}, {"id": "injured", "scope": "lead", "kind": "bool", "label": "Were you hurt in the incident?", "vital": true, "options": ["Yes", "No"], "choices": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}, {"id": "symptoms_ongoing", "scope": "lead", "kind": "bool", "label": "Are you still having symptoms?", "vital": true, "options": ["Yes, still having symptoms", "No, symptoms resolved"], "choices": [{"value": "yes", "label": "Yes, still having symptoms"}, {"value": "no", "label": "No, symptoms resolved"}]}, {"id": "treatment", "scope": "lead", "kind": "select", "label": "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?", "vital": true, "options": ["Already treated", "Still treating", "Finished treatment", "Stopped early, or one-time only", "Has not seen a doctor yet"], "choices": [{"value": "treated", "label": "Already treated"}, {"value": "still", "label": "Still treating"}, {"value": "finished", "label": "Finished treatment"}, {"value": "stopped", "label": "Stopped early, or one-time only"}, {"value": "never", "label": "Has not seen a doctor yet"}]}, {"id": "willing", "scope": "lead", "kind": "bool", "label": "Are you willing to get checked out by a doctor?", "vital": true, "agentNote": "If they hesitate, use the tell on the next line. Do not move on until you have an answer.", "options": ["Yes, willing", "No"], "choices": [{"value": "yes", "label": "Yes, willing"}, {"value": "no", "label": "No"}]}, {"id": "willing_more", "scope": "lead", "kind": "select", "label": "If a doctor suggests more treatment, are you willing to go?", "vital": true, "agentNote": "Only asked when treatment has already ended. A finished or abandoned course of care is worth far more if they are still willing to be seen.", "options": ["Yes, willing to go back", "No, they are done", "Not sure"], "choices": [{"value": "yes", "label": "Yes, willing to go back"}, {"value": "no", "label": "No, they are done", "note": "Weakens the file. Flag it in your notes"}, {"value": "unsure", "label": "Not sure"}]}, {"id": "injuries", "scope": "lead", "kind": "multiselect", "label": "Tell me about your injuries. What is hurting?", "vital": true, "agentNote": "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently \u2014 never upgrade it for them.", "options": ["Neck or back pain", "Muscle strain", "Whiplash", "Shoulder / knee ligament STRAIN", "Anxiety / emotional distress", "Head injury / concussion", "Broken bones", "Shoulder / knee ligament TEAR", "Internal bleeding / ruptured organ", "Scarring / permanent marks", "Death"], "choices": [{"value": "neck_back", "label": "Neck or back pain"}, {"value": "strain", "label": "Muscle strain"}, {"value": "whiplash", "label": "Whiplash"}, {"value": "lig_strain", "label": "Shoulder / knee ligament STRAIN"}, {"value": "anxiety", "label": "Anxiety / emotional distress"}, {"value": "head", "label": "Head injury / concussion"}, {"value": "broken", "label": "Broken bones"}, {"value": "lig_tear", "label": "Shoulder / knee ligament TEAR"}, {"value": "internal", "label": "Internal bleeding / ruptured organ"}, {"value": "scarring", "label": "Scarring / permanent marks"}, {"value": "death", "label": "Death"}]}, {"id": "surgery", "scope": "lead", "kind": "bool", "label": "Has any surgery been done, or has a doctor recommended surgery?", "vital": true, "options": ["No", "Yes"], "choices": [{"value": "no", "label": "No"}, {"value": "yes", "label": "Yes", "note": "Flags for secondary review"}]}, {"id": "bills", "scope": "lead", "kind": "select", "label": "Do you have a rough idea what your medical bills are so far?", "vital": true, "agentNote": "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.", "options": ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"], "choices": [{"value": "none", "label": "Nothing yet"}, {"value": "under_10k", "label": "Under $10,000"}, {"value": "10k_50k", "label": "$10,000 to $50,000"}, {"value": "over_50k", "label": "Over $50,000"}, {"value": "unknown", "label": "Not sure"}]}]'::jsonb);

-- ============================================================================
-- 0066 DELETE MEANS ARCHIVE
--
-- Deleting a lead destroyed it and everything hanging off it: the claim, the
-- answers, the QA review, the call log, the signed retainer. One wrong checkbox
-- on a bulk selection and a signed file is gone with no way back.
--
-- Delete now archives. The row stays, hidden from every normal view, for at
-- least 90 days. Only an owner can destroy it for real, and only after it has
-- been archived, so a permanent delete is always a deliberate second act.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists archived_at   timestamptz;
alter table leads add column if not exists archived_by   uuid;
alter table leads add column if not exists archive_reason text;

-- Every list query filters on this, so it needs an index.
create index if not exists idx_leads_archived_at on leads (archived_at);

comment on column leads.archived_at is
  'Set when a user "deletes" a lead. Hidden everywhere but recoverable. Eligible for permanent deletion by an owner after 90 days.';

-- What is past the retention window and could be purged. Read-only helper: it
-- deletes nothing on its own, because automatic destruction of client files is
-- exactly the thing this migration exists to prevent.
create or replace view leads_purgeable as
select id, lead_no, claimant_name, firm_id, archived_at,
       (now() - archived_at) as archived_for
from leads
where archived_at is not null
  and archived_at < now() - interval '90 days';

-- ============================================================================
-- 0089 M6 FIRM REACHED TOUCH (apply after 0088a)
-- Nested retention_stage carve-out + m6_log_touch RPC.
-- Full file: supabase/migrations/0089_m6_log_touch.sql
-- ============================================================================

create or replace function firm_stage_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if role_is_firm() then
    if pg_trigger_depth() > 1 then
      if (to_jsonb(new) - 'updated_at' - 'retention_stage')
         is distinct from (to_jsonb(old) - 'updated_at' - 'retention_stage') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    else
      if (to_jsonb(new) - 'stage' - 'updated_at')
         is distinct from (to_jsonb(old) - 'stage' - 'updated_at') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function m6_log_touch(
  p_lead_id uuid,
  p_outcome text,
  p_purpose text default 'ad_hoc',
  p_channel text default 'call',
  p_contact_point_id uuid default null,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tmp_id uuid;
  lead_row leads%rowtype;
  point_lead uuid;
  comm_id uuid;
  agent_nm text;
  agent_em text;
  ch text;
  purp text;
begin
  if uid is null then
    raise exception 'Sign in again.';
  end if;
  if p_lead_id is null then
    raise exception 'Missing the file.';
  end if;
  if p_outcome is null or p_outcome not in ('two_way', 'no_answer', 'voicemail', 'bad_number') then
    raise exception 'Pick how the contact ended.';
  end if;

  ch := case when p_channel = 'sms' then 'sms' else 'call' end;
  purp := coalesce(nullif(trim(p_purpose), ''), 'ad_hoc');

  select id into tmp_id from firms where slug = 'tmp';
  if tmp_id is null then
    raise exception 'This app is not available.';
  end if;

  select * into lead_row from leads where id = p_lead_id;
  if not found then
    raise exception 'That file is not available to you.';
  end if;
  if lead_row.firm_id is distinct from tmp_id
     or lead_row.archived_at is not null
     or not (lead_row.campaign = 'motel6' or lead_row.case_type = 'motel_trafficking') then
    raise exception 'That file is not available to you.';
  end if;

  if is_internal() then
    null;
  elsif role_is_firm() and my_firm_id() = tmp_id then
    null;
  else
    raise exception 'This app is for TMP Motel 6 files only.';
  end if;

  if p_contact_point_id is not null then
    select lead_id into point_lead
      from contact_points
     where id = p_contact_point_id and firm_id = tmp_id;
    if point_lead is distinct from p_lead_id then
      raise exception 'That file is not available to you.';
    end if;
  end if;

  select full_name, email into agent_nm, agent_em from app_users where id = uid;

  insert into communications (
    lead_id, firm_id, channel, direction,
    phone_raw, phone_norm, body,
    agent_name, agent_email, occurred_at,
    purpose, outcome, contact_point_id,
    logged_manually, dispositioned_by, dispositioned_at
  ) values (
    p_lead_id, lead_row.firm_id, ch,
    case when purp = 'inbound' then 'inbound' else 'outbound' end,
    lead_row.phone, public.norm_phone(lead_row.phone), nullif(trim(p_body), ''),
    agent_nm, agent_em, now(),
    purp, p_outcome, p_contact_point_id,
    true, uid, now()
  ) returning id into comm_id;

  return comm_id;
end;
$$;

revoke all on function m6_log_touch(uuid, text, text, text, uuid, text) from public;
grant execute on function m6_log_touch(uuid, text, text, text, uuid, text) to authenticated;

-- ============================================================================
-- 0090 LAWRULER PROPERTY IDENTIFICATION (apply after 0089)
-- street/zip on properties_canonical + property_identifications link table.
-- Full file: supabase/migrations/0090_property_identifications.sql
-- ============================================================================

alter table properties_canonical add column if not exists street text;
alter table properties_canonical add column if not exists zip    text;

create table if not exists property_identifications (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id),
  lawruler_leadid   text not null,
  canonical_id      uuid not null references properties_canonical(id),
  remembered_brand  text,
  current_brand     text,
  brand_mismatch    boolean generated always as
                      (remembered_brand is distinct from current_brand
                       and remembered_brand is not null
                       and current_brand is not null) stored,
  stay_from         text,
  stay_to           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (firm_id, lawruler_leadid, canonical_id)
);

create index if not exists idx_pi_leadid
  on property_identifications (firm_id, lawruler_leadid);

drop trigger if exists trg_pi_touch on property_identifications;
create trigger trg_pi_touch before update on property_identifications
  for each row execute function touch_updated_at();

alter table property_identifications enable row level security;

drop policy if exists pi_internal_all on property_identifications;
create policy pi_internal_all on property_identifications for all
  using ( is_internal() ) with check ( is_internal() );

drop policy if exists pi_firm_read on property_identifications;
create policy pi_firm_read on property_identifications for select
  using ( firm_id = my_firm_id() );

-- ============================================================================
-- 0091 FIRM GUARD IGNORES GENERATED COLS (apply after 0090)
-- 0090 is property_identifications (already applied).
-- BEFORE UPDATE sees uncomputed full_name/phone_norm, so 0089's jsonb
-- carve-out never matched. Skip no-op retention_stage writes.
-- Full file: supabase/migrations/0091_firm_guard_generated_cols.sql
-- ============================================================================

create or replace function firm_stage_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  generated_cols text[] := ARRAY['full_name', 'phone_norm'];
  new_j jsonb;
  old_j jsonb;
begin
  if role_is_firm() then
    new_j := to_jsonb(new) - generated_cols;
    old_j := to_jsonb(old) - generated_cols;
    if pg_trigger_depth() > 1 then
      if (new_j - 'updated_at' - 'retention_stage')
         is distinct from (old_j - 'updated_at' - 'retention_stage') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    else
      if (new_j - 'stage' - 'updated_at')
         is distinct from (old_j - 'stage' - 'updated_at') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function on_two_way_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome = 'two_way' and (old is null or old.outcome is distinct from 'two_way') then
    update call_schedule
       set status = 'done', completed_at = now(), outcome = 'two_way'
     where lead_id = new.lead_id and status = 'open' and due_at <= now();

    if new.contact_point_id is not null then
      update contact_points
         set last_success_at = coalesce(new.occurred_at, now()),
             verified_at     = coalesce(new.occurred_at, now()),
             status          = 'good',
             fail_count      = 0
       where id = new.contact_point_id;
    end if;

    update leads
       set retention_stage = 'heartbeat'
     where id = new.lead_id
       and retention_stage in ('escalation','at_risk','lost_contact');
  end if;

  if new.outcome = 'bad_number' and new.contact_point_id is not null then
    update contact_points
       set status = 'dead', fail_count = fail_count + 1, last_attempt_at = now()
     where id = new.contact_point_id;
  end if;

  return new;
end $$;

-- ============================================================================
-- 0092 M6 LAST-TOUCH CADENCE (apply after 0091)
-- Full file: supabase/migrations/0092_m6_cadence.sql
-- ============================================================================
-- ClaimReach 0092: Motel 6 last-touch cadence
--
-- Seeds the run sheet (https://tmpm6.netlify.app/) into drip_rules +
-- escalation_ladder. Walker lives in src/lib/m6-cadence.ts — this file is
-- the DB copy of those same keys. Do not invent a second script list.
--
-- RLS note for Brett: drip_rules stays internal-write. Firm does not SELECT
-- drip_rules; templates are served from code via /api/m6/compose. New
-- communications columns inherit existing 0087 firm INSERT (manual m6 only).
-- enroll_drips_for_lead skips campaign-scoped rules so generic drips do not
-- fire Motel 6 scripts from an agent's line.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

-- Dedicated M6 line. Same sender number on every touch.
update retention_settings
   set sending_number = '+12562075828',
       cadence_initial_days = 14,
       cadence_steady_days = 30,
       cadence_switch_days = 90,
       updated_at = now()
 where campaign = 'motel6';

alter table retention_settings add column if not exists quiet_start time not null default '08:00';
alter table retention_settings add column if not exists quiet_end   time not null default '20:00';

-- Cadence metadata on the existing drip table. Generic rules keep campaign null.
alter table drip_rules add column if not exists campaign          text;
alter table drip_rules add column if not exists stage             text;
alter table drip_rules add column if not exists step_key          text;
alter table drip_rules add column if not exists delay_days        int;
alter table drip_rules add column if not exists approved_by_firm  boolean not null default false;
alter table drip_rules add column if not exists subject           text;
alter table drip_rules add column if not exists kind              text;
alter table drip_rules add column if not exists method_note       text;
alter table drip_rules add column if not exists fire_once         boolean not null default true;

create unique index if not exists drip_rules_campaign_step
  on drip_rules (campaign, step_key)
  where campaign is not null and step_key is not null;

-- Generic enroll / due view must never pick up motel6 walker rules.
create or replace view drips_due as
select e.id as enrollment_id, e.lead_id, e.firm_id, e.rule_id, e.next_due,
       r.name, r.channel, r.template, r.every_days, r.assign_to,
       r.campaign, r.step_key,
       l.claimant_name, l.phone, l.email
from drip_enrollments e
join drip_rules r on r.id = e.rule_id
join leads l on l.id = e.lead_id
where e.active and e.next_due <= current_date
  and r.campaign is null;


create or replace function enroll_drips_for_lead(p_lead uuid, p_firm uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into drip_enrollments (firm_id, lead_id, rule_id, next_due, active)
  select p_firm, p_lead, r.id, current_date + (r.every_days || ' days')::interval, true
  from drip_rules r
  where r.active
    and r.campaign is null
    and (r.firm_id is null or r.firm_id = p_firm)
    and not exists (select 1 from drip_enrollments e where e.lead_id = p_lead and e.rule_id = r.id);
end $$;

-- Outbound log fields. outcome stays the clock; send_status is delivery.
alter table communications add column if not exists send_status      text;
alter table communications add column if not exists blocked_reason   text;
alter table communications add column if not exists template_key     text;
alter table communications add column if not exists idempotency_key  text;
alter table communications add column if not exists actor_firm       text;

create unique index if not exists idx_comm_idempotency
  on communications (idempotency_key)
  where idempotency_key is not null;

comment on column communications.send_status is
  'queued|sent|failed|blocked|logged. Live send requires keys + gates + Josh approval.';
comment on column communications.actor_firm is
  'innovative|tmp. Both sides write the same timeline; this tags who.';

-- Ladder scripts match the run sheet. Timing already seeded in 0082.
alter table escalation_ladder add column if not exists script      text;
alter table escalation_ladder add column if not exists method_note text;
alter table escalation_ladder add column if not exists step_key    text;

update escalation_ladder set
  label = v.label, channel = v.channel, target = v.target,
  script = v.script, method_note = v.method_note, step_key = v.step_key
from (values
  (1,  'Voicemail',                         'call+sms', 'primary',       's06_s1_vm',
       'Hi [First], it is [Agent] from the team on your case. Nothing is wrong. Give me a call back at [number] whenever you get a chance.',
       'Never name the case type or the defendant. If monitored, no voicemail at all.'),
  (2,  'Call, different time of day',       'call',     'primary',       's06_s2_retry',
       'Hi [First], this is [Agent] again. I tried you the other day. Is now a better time?',
       'If step 1 was afternoon, step 2 is evening.'),
  (3,  'SMS',                               'sms',      'alternate',     's06_s3_sms',
       'Hi [First], this is [Agent] from the team on your case. I have not been able to reach you and I want to make sure nothing gets missed. Please call or text me at [number].',
       'Day 4 of the ladder.'),
  (4,  'Stable person, approved script',    'call',     'stable_person', 's06_s4_ec',
       'Hi, this is [Agent] calling from Turnbull Moak and Pendergrass. [First] listed you as someone who could get a message to her. I am not able to share anything about her matter, but if you speak with her, could you ask her to call me at [number]? It is important and there is nothing wrong.',
       'Approved script only. Confirm nothing, disclose nothing.'),
  (5,  'Social if release',                 'social',   'case_manager',  's06_s5_social',
       'Hi [First], this is [Agent]. I have been trying to reach you by phone. Please call or text me at [number]. Nothing is wrong — I just need to know how to find you.',
       'Requires the signed release.'),
  (6,  'Physical mail, plain envelope',     'mail',     'address',       's06_s6_letter',
       '[First], I have not been able to reach you by phone. Please call [Agent] at [number]. There is nothing wrong, I just need to know how to find you.',
       'Plain envelope, no firm letterhead. A postcard is a privacy risk.'),
  (7,  'Skip trace and custody search',     'trace',    'system',        's06_s7_trace',
       'Skip trace / TLO, county inmate search, state corrections, VINELink, obituary check. Log every number found as a new contact point. Never overwrite.',
       'Ops. Append every number.'),
  (8,  'Investigator memo to firm',         'memo',     'firm',          's06_s8_memo',
       'The file is on ladder step 8. Report the ladder step and the facts, never an opinion.',
       'Facts only. Firm decides spend.'),
  (9,  'At-risk report',                    'memo',     'firm',          's06_s9_report',
       'The file lands on the fact sheet at-risk report alongside its deadline.',
       'Terminal ladder step. Money stays off the firm file.')
) as v(step, label, channel, target, step_key, script, method_note)
where escalation_ladder.campaign = 'motel6' and escalation_ladder.step = v.step;

-- Seed motel6 drip rules. Bodies match src/lib/m6-cadence.ts. approved_by_firm
-- stays false until Josh. Staff can still see drafts in the picker.
insert into drip_rules (
  firm_id, name, channel, every_days, template, assign_to, active,
  campaign, stage, step_key, delay_days, approved_by_firm, subject, kind, method_note, fire_once
)
select f.id, s.name, s.channel, greatest(s.delay_days, 0), s.template, 'both', true,
       'motel6', s.stage, s.step_key, s.delay_days, false, s.subject, s.kind, s.method_note, s.fire_once
from firms f
cross join (values
  ('s01_arrival_sms',    '01', 'Day 0 arrival SMS',              'sms',   0,  'sms',   true,
   null,
   'Hi [First], this is [Agent] with the team working on your case with Turnbull Moak and Pendergrass. We will be calling you in the next few business days to confirm a few important details.' || E'\n\n' ||
   'If we catch you at a bad time, text this number back with a better day and time. We do need to reach you soon so nothing on your case gets held up.',
   'This is the number every future touch comes from. A reply with a callback time counts as contact.'),
  ('s01_arrival_email',  '01', 'Day 0 arrival email',            'email', 0,  'email', true,
   'Welcome, [First] — we need to confirm a few details',
   'Your case is with Turnbull Moak and Pendergrass and our team is handling the next step. Someone will call you in the next few business days.' || E'\n\n' ||
   'Before your file can move forward we have to confirm a few key details with you directly. It takes about twenty minutes.' || E'\n\n' ||
   'If a call is hard for you, text [number] with a better day and time and we will work around you.',
   'Same message as the SMS. Two channels, one expectation.'),
  ('s02_interview_call', '02', 'Secondary interview call',       'call_reminder', 1, 'call', true,
   null,
   'Hi [First], this is [Agent]. You should have gotten a text and an email from me. I am with the team working on your case, and I need about twenty minutes to confirm some details so your file can move. Is now alright, or is there a better time today?',
   'If this call does not connect, enter the Stage 06 ladder at step 1 immediately.'),
  ('s03_thanks_sms',     '03', 'Interview complete thank-you',   'sms',   0,  'sms',   true,
   null,
   'Thank you [First], we got everything we needed today. Your file is with the legal team now and nothing is needed from you right now.' || E'\n\n' ||
   'Save this number. It is [Agent] and it is how I will reach you. I will check in with you regularly so you always know where things stand.',
   'Fires when the interview is marked done. Heartbeat clock starts here.'),
  ('s04_day3_sms',       '04', 'Day 3 onboarding SMS',           'sms',   3,  'sms',   true,
   null,
   'Hi [First], [Agent] here. Nothing you need to do right now. Everything from our call is in and the team has it. I will check in with you next week.',
   'No ask. Keep the number saved and the name familiar.'),
  ('s04_day7_call',      '04', 'Day 7 onboarding call',          'call_reminder', 7, 'call', true,
   null,
   'Hi [First], [Agent] with your check in. Nothing is wrong. Anything change since we talked, phone, where you are staying? And is there anything you are wondering about that I can get an answer to?',
   'Legal questions route to the firm the same day.'),
  ('s04_day14_sms',      '04', 'Day 14 onboarding SMS',          'sms',  14,  'sms',   true,
   null,
   'Hi [First], [Agent] checking in. Nothing new to report yet, everything is moving the way it should. I just want you to know we are still here with you. Still your best number?',
   'Ask still-your-best-number.'),
  ('s04_day21_sms',      '04', 'Day 21 onboarding SMS',          'sms',  21,  'sms',   true,
   null,
   'Hi [First], quick one from [Agent]. Just reply with anything so I know you are good.',
   'A reply is two-way contact and resets the clock.'),
  ('s04_day30_call',     '04', 'Day 30 onboarding call',         'call_reminder', 30, 'call', true,
   null,
   'Hi [First], [Agent]. Your check in. I want to be straight with you about timing: cases like yours move slowly and there will be long stretches where I have nothing new to tell you. That is normal and it is not a bad sign. I am going to keep calling anyway so you always know we are still here. Let me re-confirm your numbers and where mail should go, then I will let you get on with your day.',
   'Set the long hold expectation out loud, once, here.'),
  ('s05_tminus3_sms',    '05', 'Heartbeat T-3 SMS',              'sms',  14,  'sms',   false,
   null,
   'Hi [First], [Agent]. I will give you a quick call Thursday for your check in. Let me know if a different day is better.',
   'Three days before the heartbeat call.'),
  ('s05_t0_call',        '05', 'Heartbeat T0 call',              'call_reminder', 14, 'call', false,
   null,
   'Hi [First], [Agent] with your check in. I do not have anything new for you yet, and that is normal for this kind of case. Everything is moving the way it should. I am calling so you know we are still here and still working. Still your best number? Anything change with where you are staying? Anything you need from me?',
   'Rotate morning / afternoon / evening. Do not invent progress.'),
  ('s05_t0_evening_sms', '05', 'Heartbeat T0 evening SMS',       'sms',  14,  'sms',   false,
   null,
   'Hi [First], [Agent]. Tried you today, no worries. Text me back when you get a chance so I know you are good.',
   'Only if the T0 call missed.'),
  ('s05_monthly_email',  '05', 'Heartbeat monthly email',        'email', 30, 'email', false,
   'Still with you, [First]',
   'Nothing new to report this month. This kind of case takes a long time and that is expected.' || E'\n\n' ||
   'Reach [Agent] any time at [number].',
   'Three lines. Monthly.')
) as s(step_key, stage, name, channel, delay_days, kind, fire_once, subject, template, method_note)
where f.slug = 'tmp'
on conflict (campaign, step_key) where campaign is not null and step_key is not null
do update set
  name = excluded.name, channel = excluded.channel, every_days = excluded.every_days,
  template = excluded.template, subject = excluded.subject, kind = excluded.kind,
  delay_days = excluded.delay_days, method_note = excluded.method_note,
  fire_once = excluded.fire_once, stage = excluded.stage, assign_to = 'both';

-- Enroll live TMP motel files into the walker rules they do not already have.
insert into drip_enrollments (firm_id, lead_id, rule_id, next_due, active)
select l.firm_id, l.id, r.id,
       (coalesce(l.retention_started_at, l.created_at)::date + (coalesce(r.delay_days, r.every_days, 0) || ' days')::interval)::date,
       true
from leads l
join firms f on f.id = l.firm_id and f.slug = 'tmp'
join drip_rules r on r.campaign = 'motel6' and r.active
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and not exists (
    select 1 from drip_enrollments e where e.lead_id = l.id and e.rule_id = r.id
  );

-- Today extras on the existing security_invoker view. Same TMP motel fence.
drop view if exists lead_contact_status;
drop view if exists lead_contact_health;

create view lead_contact_health
with (security_invoker = true) as
with last_two_way as (
  select lead_id, max(occurred_at) as at
  from communications where outcome = 'two_way' group by lead_id
),
last_touch as (
  select distinct on (lead_id)
         lead_id, occurred_at as at, channel, direction, send_status
  from communications
  order by lead_id, occurred_at desc nulls last
),
inbound_waiting as (
  select lead_id, true as waiting
  from communications
  where direction = 'inbound' and outcome is null
  group by lead_id
),
failed_send as (
  select lead_id, true as failed
  from communications
  where send_status = 'failed' or outcome = 'undelivered'
  group by lead_id
),
opted as (
  select lead_id, true as opted
  from contact_points
  where status = 'opted_out' and retired_at is null
  group by lead_id
),
live_points as (
  select lead_id,
         count(*) filter (where status <> 'dead' and status <> 'opted_out') as live_count,
         count(*) filter (where kind = 'person' and status <> 'dead')      as person_count,
         count(*) filter (where kind = 'address' and status <> 'dead')     as address_count
  from contact_points where retired_at is null group by lead_id
),
next_due as (
  select lead_id, min(due_at) as at
  from call_schedule where status = 'open' group by lead_id
)
select
  l.id                                as lead_id,
  l.firm_id,
  l.lead_no,
  l.claimant_name,
  l.campaign,
  l.case_type,
  l.archived_at,
  l.retention_owner,
  l.retention_stage,
  l.retention_paused_until,
  l.comms_monitored,
  t.at                                as last_two_way_at,
  lt.at                               as last_touch_at,
  lt.channel                          as last_touch_channel,
  lt.direction                        as last_touch_direction,
  nd.at                               as next_touch_due,
  coalesce(p.live_count, 0)           as live_contact_points,
  coalesce(p.person_count, 0)         as stable_people,
  coalesce(p.address_count, 0)        as addresses,
  coalesce(iw.waiting, false)         as inbound_waiting,
  coalesce(fs.failed, false)          as last_send_failed,
  coalesce(op.opted, false)           as opted_out,
  case when t.at is null
       then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
       else extract(day from now() - t.at)::int end   as days_since_contact,
  case when l.retention_paused_until is not null and l.retention_paused_until >= current_date
       then 0
       else greatest(
         (case when t.at is null
               then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
               else extract(day from now() - t.at)::int end) - l.retention_cadence_days, 0)
  end                                                  as days_overdue
from leads l
left join last_two_way t on t.lead_id = l.id
left join last_touch  lt on lt.lead_id = l.id
left join live_points  p on p.lead_id = l.id
left join next_due    nd on nd.lead_id = l.id
left join inbound_waiting iw on iw.lead_id = l.id
left join failed_send fs on fs.lead_id = l.id
left join opted op on op.lead_id = l.id
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and l.firm_id = (select id from firms where slug = 'tmp');

create view lead_contact_status
with (security_invoker = true) as
select h.*,
  case
    when h.retention_paused_until is not null and h.retention_paused_until >= current_date then 'paused'
    when h.opted_out then 'paused'
    when h.days_overdue = 0  then 'green'
    when h.days_overdue <= 7  then 'yellow'
    when h.days_overdue <= 21 then 'red'
    else 'lost'
  end as health,
  (select max(e.step) from escalation_ladder e
    where e.campaign = 'motel6' and e.day_offset <= h.days_overdue
      and h.days_overdue > 0)                                as ladder_step,
  (select min(e.step) from escalation_ladder e
    where e.campaign = 'motel6' and e.day_offset > h.days_overdue
      and h.days_overdue > 0)                                as next_ladder_step
from lead_contact_health h;

comment on view lead_contact_health is
  'm6 retention clock + last touch / replies / opt-out. security_invoker. TMP motel files only.';
comment on view lead_contact_status is
  'm6 health + ladder. security_invoker. TMP motel files only.';

revoke all on lead_contact_health from anon, public;
revoke all on lead_contact_status from anon, public;
grant select on lead_contact_health to authenticated, service_role;
grant select on lead_contact_status to authenticated, service_role;

-- ============================================================================
-- 0094 M6 PROPERTY ADDRESS BACKFILL (apply after 0092; skip 0093 / PR #5)
-- Full file: supabase/migrations/0094_m6_property_address_backfill.sql
-- Does NOT touch lead_contact_health.
-- ============================================================================
-- ClaimReach 0094: backfill motel stay addresses from case_description
--
-- Live /m6/property and LOR read leads.property_street / city / state / zip.
-- The CSV ingest parked many stays in case_description, so motel files can
-- have a name and a null street. properties_canonical has the same hole
-- when Places returned a name + formatted address but no parsed components.
--
-- Conservative: only fill EMPTY property_* / street columns. Never overwrite
-- a street that is already set. TMP motel files only.
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

with parsed as (
  select
    l.id,
    regexp_match(
      l.case_description,
      '([0-9]{1,6}[[:space:]]+[A-Za-z0-9 .#''/-]+),[[:space:]]*([A-Za-z .]+),[[:space:]]*([A-Z]{2})[[:space:]]+([0-9]{5})'
    ) as m
  from leads l
  join firms f on f.id = l.firm_id
  where f.slug = 'tmp'
    and l.archived_at is null
    and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
    and (l.property_street is null or btrim(l.property_street) = '')
    and l.case_description is not null
    and l.case_description ~ '[0-9].+[A-Z]{2}[[:space:]]+[0-9]{5}'
)
update leads l
   set property_street = btrim(p.m[1]),
       property_city   = btrim(p.m[2]),
       property_state  = p.m[3],
       property_zip    = p.m[4],
       property_name   = coalesce(
         nullif(btrim(l.property_name), ''),
         case
           when l.case_description ~* 'studio[[:space:]]*6' then 'Studio 6'
           when l.case_description ~* 'motel[[:space:]]*6' then 'Motel 6'
           else l.property_name
         end
       )
  from parsed p
 where l.id = p.id
   and p.m is not null;

with parsed as (
  select
    c.id,
    regexp_match(
      regexp_replace(c.address, ',[[:space:]]*USA$', '', 'i'),
      '^(.+?),[[:space:]]*([^,]+),[[:space:]]*([A-Z]{2})[[:space:]]+([0-9]{5})'
    ) as m
  from properties_canonical c
  join firms f on f.id = c.firm_id
  where f.slug = 'tmp'
    and (c.street is null or btrim(c.street) = '')
    and c.address is not null
    and c.address ~ '[0-9].+[A-Z]{2}[[:space:]]+[0-9]{5}'
)
update properties_canonical c
   set street = btrim(p.m[1]),
       city   = coalesce(nullif(btrim(c.city), ''), btrim(p.m[2])),
       state  = coalesce(nullif(btrim(c.state), ''), p.m[3]),
       zip    = coalesce(nullif(btrim(c.zip), ''), p.m[4])
  from parsed p
 where c.id = p.id
   and p.m is not null;

-- ============================================================================
-- 0095 MVA: QUALIFY/DQ BEFORE SIGN, DETAILS AFTER
-- Full file: supabase/migrations/0095_mva_qualify_then_sign.sql
-- Master MVA form only. Does not rewrite campaign-owned forks.
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

with extras as (
  select jsonb_agg(x.f) as add
  from (
    select '{"id":"frame","scope":"lead","kind":"select","label":"I am going to get the broad strokes first to make sure this is something we can help with. Then we will initiate attorney-client privilege and gather the rest of the facts.","origin":"spine","locked":true,"script":"I am going to get the broad strokes first to make sure this is something we can help with. Then we will initiate attorney-client privilege and gather the rest of the facts.","agentNote":"Read this after the greeting, before the qualify questions. It is part of the script, not a side note.","choices":[{"value":"said","label":"Read it, continue"}],"options":["Read it, continue"]}'::jsonb as f
    union all
    select '{"id":"attorney_consult","scope":"lead","kind":"select","label":"Have you contacted or consulted with an attorney about this claim, even if you did not sign with them?","origin":"spine","locked":true,"script":"Have you contacted or consulted with an attorney about this claim, even if you did not sign with them?","agentNote":"Second of three dual-rep asks. Informational. Yes does not disqualify. Do not combine this with the current-attorney question.","choices":[{"value":"no","label":"No"},{"value":"yes","label":"Yes"}],"options":["No","Yes"],"showIf":{"match":"all","rules":[{"fieldId":"attorney","op":"is_not","value":"yes"}]}}'::jsonb
    union all
    select '{"id":"pending_legal","scope":"lead","kind":"select","label":"Is there a pending lawsuit, legal action, or settlement process on this matter?","origin":"spine","locked":true,"script":"Is there a pending lawsuit, legal action, or settlement process on this matter?","agentNote":"Third of three dual-rep asks. Informational. Pending is not the same as already settled — that is a later question. Do not combine this with the other two.","choices":[{"value":"no","label":"No"},{"value":"yes","label":"Yes"}],"options":["No","Yes"],"showIf":{"match":"all","rules":[{"fieldId":"attorney","op":"is_not","value":"yes"}]}}'::jsonb
  ) x
)
update intake_forms f
set fields = coalesce(f.fields, '[]'::jsonb) || coalesce((
  select jsonb_agg(e)
  from jsonb_array_elements(extras.add) e
  where not exists (
    select 1 from jsonb_array_elements(f.fields) existing
    where existing->>'id' = e->>'id'
  )
), '[]'::jsonb),
    ask_order = '["frame","authority","poa","attorney","attorney_consult","pending_legal","settled","fault","date","incident_city_state","injured","what_happened","role","agent_read","symptoms_ongoing","treatment","willing","commit_appointment","willing_more","injuries","surgery","hosp","bills","commercial","ins_other","ins_own","ins_uim","collision_type","incident_time","police_report","police_agency","police_report_number","citations","auto_policy_id","others_in_vehicle","others_names","others_injured","others_injured_contact","others_need_help","ins_forms","ins_forms_signed","ins_forms_said","how_found_us","referral_source","treatment_followup","case_manager_notes"]'::jsonb,
    version = coalesce(f.version, 10) + 1,
    updated_at = now()
from extras
where f.claim_type = 'mva'
  and f.firm_id is null
  and f.campaign_id is null;

update intake_forms
set fields = (
  select coalesce(jsonb_agg(
    case when elem->>'id' = 'how_found_us'
      then elem || '{"script":"How did you find us?","label":"How did you find us?","agentNote":"Marketing attribution. Asked after the signature. Tap what they say — do not read the list."}'::jsonb
      else elem
    end
  ), fields)
  from jsonb_array_elements(fields) elem
),
    updated_at = now()
where claim_type = 'mva'
  and firm_id is null
  and campaign_id is null;



-- ============================================================================
-- 0095 SIGNED DOCS PATH COLUMNS (run BEFORE deploying the signed-docs lockdown)
-- Full file: supabase/migrations/0095_signed_docs_paths.sql
-- ============================================================================
-- 0095: signed-docs lockdown, part 1 of 2 (safe to run any time, before deploy).
-- Adds the storage path columns the new code writes. Additive only.
alter table signable_documents add column if not exists completed_pdf_path text;
alter table signable_documents add column if not exists cert_pdf_path text;

-- ============================================================================
-- 0096 SIGNED DOCS PRIVATE (run AFTER /api/signed-doc is live)
-- Full file: supabase/migrations/0096_signed_docs_private.sql
-- ============================================================================
-- 0096: signed-docs lockdown, part 2 of 2. Run AFTER the code with
-- /api/signed-doc is live. Signed retainers carry SSN and DOB.
--
-- 1) Backfill storage paths from the old public URLs.
-- 2) Point stored links at the gated app route.
-- 3) Make the bucket private so the old public URLs stop working.
-- SignWell rows (external URLs) are untouched.

update signable_documents
   set completed_pdf_path = substring(completed_pdf_url from '/object/public/signed-docs/(.+)$')
 where completed_pdf_path is null
   and completed_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set cert_pdf_path = substring(cert_pdf_url from '/object/public/signed-docs/(.+)$')
 where cert_pdf_path is null
   and cert_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set completed_pdf_url = '/api/signed-doc/' || id || '/signed'
 where completed_pdf_path is not null
   and completed_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set cert_pdf_url = '/api/signed-doc/' || id || '/cert'
 where cert_pdf_path is not null
   and cert_pdf_url like '%/object/public/signed-docs/%';

update storage.buckets set public = false where id = 'signed-docs';

-- ============================================================================
-- 0097 (APPLIED in Supabase 2026-09-26 by Brett): MVA call console. Additive.
-- Kept here for the record; safe to run again.
alter table intake_calls add column if not exists campaign_id uuid references campaigns(id);
alter table intake_calls add column if not exists mode text;
alter table intake_calls add column if not exists status text not null default 'live';
alter table intake_calls add column if not exists dispo_reasons text[] not null default '{}';
alter table intake_calls add column if not exists callback_at timestamptz;
alter table intake_calls add column if not exists dispo_note text;
alter table intake_calls add column if not exists ended_at timestamptz;
alter table intake_calls add column if not exists updated_at timestamptz not null default now();
create index if not exists intake_calls_lead_idx on intake_calls (lead_id, created_at desc);
create index if not exists intake_calls_callback_idx on intake_calls (callback_at) where disposition = 'callback';
create index if not exists intake_calls_agent_idx on intake_calls (agent_id, created_at desc);

-- New DQ reasons the MVA lights produce. declined backs the Not interested
-- status (a disqualify status must carry a reason key); it stays out of the
-- general DQ pickers.
insert into dq_reasons (key, label, category, sort, active) values
  ('treatment_gap', '30+ day treatment gap', 'Medical', 26, true),
  ('no_coverage', 'No coverage anywhere', 'Eligibility', 36, true),
  ('low_limits', 'Fender bender, low limits', 'Representation', 58, true),
  ('declined', 'Declined, not interested', 'Contact', 78, false)
on conflict (key) do nothing;

create table if not exists call_dispo_reasons (
  dispo text not null check (dispo in ('esign', 'callback', 'ni')),
  key text not null,
  label text not null,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (dispo, key)
);
alter table call_dispo_reasons enable row level security;
drop policy if exists call_dispo_reasons_read on call_dispo_reasons;
create policy call_dispo_reasons_read on call_dispo_reasons for select using (is_internal());
drop policy if exists call_dispo_reasons_write on call_dispo_reasons;
create policy call_dispo_reasons_write on call_dispo_reasons for all
  using (exists (select 1 from app_users u where u.id = auth.uid() and u.role in ('owner', 'admin')))
  with check (exists (select 1 from app_users u where u.id = auth.uid() and u.role in ('owner', 'admin')));

insert into call_dispo_reasons (dispo, key, label, sort) values
  ('esign', 'tech_issue', 'Tech issue', 10),
  ('esign', 'phone_died', 'Phone died or dropped', 20),
  ('esign', 'spouse', 'Spouse or family', 30),
  ('esign', 'read_trust', 'Wants to read it (trust)', 40),
  ('esign', 'sign_later', 'Busy, will sign later', 50),
  ('esign', 'hung_up', 'Hung up', 60),
  ('esign', 'other_firm', 'Talking to another firm', 70),
  ('esign', 'other', 'Other', 90),
  ('callback', 'at_work', 'At work', 10),
  ('callback', 'driving', 'Driving', 20),
  ('callback', 'spouse', 'Wants spouse on', 30),
  ('callback', 'bad_connection', 'Bad connection', 40),
  ('callback', 'needs_papers', 'Needs her papers', 50),
  ('callback', 'other', 'Other', 90),
  ('ni', 'no_lawyer', 'Doesn''t want a lawyer', 10),
  ('ni', 'self', 'Handling it herself', 20),
  ('ni', 'not_hurt', 'Not hurt enough', 30),
  ('ni', 'hung_up', 'Hung up', 40),
  ('ni', 'other', 'Other', 90)
on conflict (dispo, key) do nothing;

create table if not exists esign_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  campaign_id uuid not null references campaigns(id),
  provider text not null default 'docuseal',
  key text not null,
  template_id text not null,
  name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (campaign_id, provider, key)
);
alter table esign_templates enable row level security;
drop policy if exists esign_templates_internal on esign_templates;
create policy esign_templates_internal on esign_templates for all using (is_internal()) with check (is_internal());

create table if not exists esign_submissions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  lead_id uuid not null references leads(id),
  call_id uuid references intake_calls(id),
  campaign_id uuid references campaigns(id),
  provider text not null default 'docuseal',
  template_key text,
  template_id text,
  submission_id text,
  client_submitter_id text,
  intake_submitter_id text,
  signer_name text,
  injured_name text,
  phone text,
  email text,
  via text,
  pax_index int,
  status text not null default 'sent',
  sign_url text,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  completed_pdf_path text,
  cert_pdf_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists esign_submissions_lead_idx on esign_submissions (lead_id, created_at desc);
create unique index if not exists esign_submissions_provider_sub_idx on esign_submissions (provider, submission_id) where submission_id is not null;
alter table esign_submissions enable row level security;
drop policy if exists esign_submissions_internal on esign_submissions;
create policy esign_submissions_internal on esign_submissions for all using (is_internal()) with check (is_internal());

-- ============================================================================
-- 0098 (APPLIED, confirmed 2026-09-27): speed indexes + leads.vendor_fields. Additive.
-- ============================================================================
-- 0098: speed, and room for what marketers send.
--
-- Safe to run more than once. Adds indexes and one nullable column; changes no
-- data. Each index takes a few seconds to build on the big tables; webhooks
-- that arrive during the build wait for it and then land normally.
-- ============================================================================

-- Everything a marketer or LawRuler sent that has no column of its own:
-- marketer name, channel, ad campaign, and the raw fields as they came in.
-- SSNs are never written here (the ingest drops them).
alter table leads add column if not exists vendor_fields jsonb;

-- App home, Texts tab: inbound texts newest first.
create index if not exists idx_comm_inbound_sms
  on communications (occurred_at desc)
  where channel = 'sms' and direction = 'inbound';

-- Dragging-files alert: "has this lead had any outbound text or call?"
create index if not exists idx_comm_lead_outbound
  on communications (lead_id)
  where direction = 'outbound';

-- Unmatched calls and texts, newest first (was 1.5 seconds a read). The old
-- partial index on lead_id alone could not help the sort.
create index if not exists idx_comm_unmatched_recent
  on communications (occurred_at desc)
  where lead_id is null;

-- App home: open files per campaign, newest first.
create index if not exists idx_leads_campaign_created
  on leads (campaign_id, created_at desc);

-- The LawRuler lead link in texts (/app/lr/<id>) looks leads up by this.
create index if not exists idx_leads_lawruler_ref
  on leads (lawruler_ref_no)
  where lawruler_ref_no is not null;

-- App home, Done tab: finished calls, newest first.
create index if not exists idx_intake_calls_status_ended
  on intake_calls (status, ended_at desc);

-- Integrations page and webhook troubleshooting (was 1 to 18 seconds a read).
create index if not exists idx_webhook_events_created
  on webhook_events (created_at desc);
create index if not exists idx_webhook_events_type_created
  on webhook_events (event_type, created_at desc);

-- Exact duplicate of idx_intake_calls_agent. Every insert paid for both.
drop index if exists intake_calls_agent_idx;

-- ============================================================================
-- 0099 (APPLIED 2026-09-27): who gets an email when a client signs. Additive.
-- ============================================================================
-- 0099: who gets an email when a client signs. Additive, safe to run twice.
--
-- One row per rule. A case-type rule (campaign_id empty) is the distro every
-- signing of that case type goes to, like mva@. A campaign rule adds CCs for
-- that campaign only, like tmpmva@. The To and CC lists of every rule that
-- matches a signing are combined.
--
-- Staff only (is_internal), the same as esign_submissions. Firm portal users
-- never see or change these.
-- ============================================================================
create table if not exists notify_routes (
  id uuid primary key default gen_random_uuid(),
  event text not null default 'signed',
  case_type text,
  campaign_id uuid references campaigns(id) on delete cascade,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notify_routes_event on notify_routes (event, case_type, campaign_id);

alter table notify_routes enable row level security;
drop policy if exists notify_routes_internal on notify_routes;
create policy notify_routes_internal on notify_routes for all using (is_internal()) with check (is_internal());

-- Each signing emails once, even if DocuSeal's webhook and the agent's screen
-- both notice it at the same moment.
alter table esign_submissions add column if not exists signed_notified_at timestamptz;


-- ============================================================================
-- 0100 - Pre-launch security hardening (Astra audit, Sep 27 2026).
-- Full text in supabase/migrations/0100_audit_hardening.sql.
-- PART A (safe any time): lock the three operational views away from the
-- public anon key; add campaigns.ssn_require_full.
-- PART B (read first): app_users trigger blocking role/firm/active/permission
-- self-changes; case_documents trigger enforcing lead/claim/firm agreement.
-- ============================================================================
-- ============================================================================
-- 0100 — Pre-launch security hardening (Astra audit, Sep 27 2026).
--
-- PART A is safe to run any time: it stops the public anon key from reading
-- three operational views that today expose claimant name, phone and email,
-- and adds the campaign switch for requiring a full 9-digit SSN.
--
-- PART B changes write behavior (blocks role self-escalation and cross-case
-- document relabeling). The app's own server writes use the service role and
-- are exempt. Run after Brett reads it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A1. Operational views: owned by postgres, so they bypass RLS, and they
-- were granted to anon + authenticated. drips_due includes claimant name,
-- phone and email. Only server cron (service role) reads these.
-- ---------------------------------------------------------------------------
alter view public.drips_due set (security_invoker = true);
alter view public.automation_queue_due set (security_invoker = true);
alter view public.leads_purgeable set (security_invoker = true);
revoke all on public.drips_due from anon, authenticated;
revoke all on public.automation_queue_due from anon, authenticated;
revoke all on public.leads_purgeable from anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART A2. Per-campaign switch: the firm requires the full 9-digit SSN on the
-- agreement (no last-4). Enforced server-side in /api/calls/esign/complete.
-- ---------------------------------------------------------------------------
alter table campaigns add column if not exists ssn_require_full boolean not null default false;

-- ---------------------------------------------------------------------------
-- PART B1. app_users: RLS lets a user update their own row, and role/firm_id/
-- active/perm_overrides live on that row. Block self-service changes to the
-- authorization columns. Admin screens use the service role and are exempt;
-- users with can_manage_users() keep editing everyone through RLS.
-- ---------------------------------------------------------------------------
create or replace function public.guard_app_users_priv()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Server-side (service role) writes are the admin path; let them through.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if (new.role is distinct from old.role)
     or (new.firm_id is distinct from old.firm_id)
     or (new.active is distinct from old.active)
     or (new.perm_overrides is distinct from old.perm_overrides)
     or (new.email is distinct from old.email) then
    if not public.can_manage_users() then
      raise exception 'Only a user manager can change role, firm, active or permissions.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_app_users_priv on public.app_users;
create trigger trg_guard_app_users_priv
  before update on public.app_users
  for each row execute function public.guard_app_users_priv();

-- ---------------------------------------------------------------------------
-- PART B2. case_documents: the firm policy only checks firm_id, so a row could
-- be pointed at another case's lead/claim. Enforce that the labels agree.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid;
begin
  if new.lead_id is not null then
    select firm_id into v_lead_firm from public.leads where id = new.lead_id;
    if v_lead_firm is null then raise exception 'case_documents: lead does not exist'; end if;
    if new.firm_id is distinct from v_lead_firm then
      raise exception 'case_documents: firm does not match the lead''s firm';
    end if;
  end if;
  if new.claim_id is not null then
    select lead_id, firm_id into v_claim_lead, v_claim_firm from public.claims where id = new.claim_id;
    if v_claim_lead is null then raise exception 'case_documents: claim does not exist'; end if;
    if new.lead_id is not null and v_claim_lead is distinct from new.lead_id then
      raise exception 'case_documents: claim does not belong to this lead';
    end if;
    if v_claim_firm is not null and new.firm_id is distinct from v_claim_firm then
      raise exception 'case_documents: firm does not match the claim''s firm';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_case_documents on public.case_documents;
create trigger trg_guard_case_documents
  before insert or update on public.case_documents
  for each row execute function public.guard_case_documents();


-- 0101 - Supabase security-advisor cleanup. Full text in
-- supabase/migrations/0101_advisor_hardening.sql. Part A (anon loses EXECUTE
-- on every SECURITY DEFINER function) is already applied live. Part B
-- (trigger-function grants, search_path pinning) runs after Brett reads it.
-- ============================================================================
-- 0101 — Supabase security-advisor cleanup (follow-up to 0100).
--
-- PART A (applied live Sep 27: pure exposure reduction, nothing pre-login
-- calls these): the signed-OUT role can no longer execute any SECURITY
-- DEFINER function. Every caller in the app runs signed in (auth callback
-- provisions AFTER the session exists; m6 landing check runs post-login).
--
-- PART B (run after reading): pin search_path on flagged functions and drop
-- pointless EXECUTE grants on trigger functions. Low risk, but touches the
-- RLS helper functions, so it waits for Brett like 0100 Part B.
--
-- Advisor items intentionally left alone:
--   * automation_events/automation_queue/automation_runs/firm_access/
--     routing_rules/sources have RLS on with no policies. That is DENY-ALL
--     for browser clients; only the server (service role) reads them. Safe.
--   * pg_net sits in the public schema (Supabase's default install target).
--   * Leaked-password protection is a dashboard toggle (Auth, Passwords):
--     turn it on — there is no SQL for it.
-- ============================================================================

-- PART A — signed-out callers lose every definer function.
revoke execute on function public.current_app_user() from anon;
revoke execute on function public.firm_stage_only_guard() from anon;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.is_m6_landing_email(text) from anon;
revoke execute on function public.m6_log_touch(uuid, text, text, text, uuid, text) from anon;
revoke execute on function public.my_firm_id() from anon;
revoke execute on function public.on_two_way_contact() from anon;
revoke execute on function public.provision_self_from_firm_access() from anon;
revoke execute on function public.role_is_firm() from anon;
revoke execute on function public.set_lead_no() from anon;
revoke execute on function public.mint_lead_no(uuid) from anon;
revoke execute on function public.enroll_drips_for_lead(uuid, uuid) from anon;

-- PART B1 — trigger functions are fired by triggers, never called over the
-- API; signed-in users don't need EXECUTE on them either.
revoke execute on function public.firm_stage_only_guard() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.on_two_way_contact() from authenticated;
revoke execute on function public.set_lead_no() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated, anon;
revoke execute on function public.set_updated_at() from authenticated, anon;
revoke execute on function public.log_status_change() from authenticated, anon;
revoke execute on function public.touch_intake_form() from authenticated, anon;
revoke execute on function public.touch_pdf_template() from authenticated, anon;

-- PART B2 — pin search_path so a hostile schema on the path can never swap
-- what these names resolve to.
alter function public.touch_updated_at() set search_path = public;
alter function public.is_internal() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.log_status_change() set search_path = public;
alter function public.touch_intake_form() set search_path = public;
alter function public.can_manage_users() set search_path = public;
alter function public.norm_phone(text) set search_path = public;
alter function public.touch_pdf_template() set search_path = public;
alter function public.can_see_money() set search_path = public;


-- ============================================================================
-- CORRECTION: the "0100 Part B" block earlier in this file is SUPERSEDED and
-- must NOT be run. Its trigger was SECURITY DEFINER, so current_user inside
-- it was the function owner and the postgres exemption fired for every
-- caller: the guard checked nothing. 0102 below is the corrected version.
-- ============================================================================
-- ============================================================================
-- 0102 — Corrected write-protection (supersedes 0100 Part B, which is NOT to
-- be run: its trigger was SECURITY DEFINER, and inside such a function
-- current_user is the function OWNER, so the postgres exemption fired for
-- every caller and the guard never checked anything. Astra caught it before
-- it was ever applied. This version runs as the INVOKER, so current_user is
-- the real acting role: 'authenticated' for browser writes, 'service_role'
-- for the app server.)
--
-- Run the whole file at once. Then test with a synthetic agent account:
-- editing their own name/phone works; editing their own role, firm, active
-- or permissions fails; the Users screen (service role) still manages everyone.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. app_users: the own-row RLS policy lets a user write their own row, and
-- role/firm_id/active/perm_overrides live on it. Block self-service changes
-- to the authorization columns, self-INSERT, and self-DELETE.
-- ---------------------------------------------------------------------------
create or replace function public.guard_app_users_priv()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default): current_user is the real acting role.
set search_path = public as $$
declare acting text := current_user;
begin
  -- The app server and the platform manage users through the service role.
  if acting in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if not public.can_manage_users() then
      raise exception 'Accounts are created by a user manager, not self-service.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.can_manage_users() then
      raise exception 'Accounts are removed by a user manager, not self-service.';
    end if;
    return old;
  end if;

  -- UPDATE: profile fields are free; authorization fields are not.
  if (new.role is distinct from old.role)
     or (new.firm_id is distinct from old.firm_id)
     or (new.active is distinct from old.active)
     or (new.perm_overrides is distinct from old.perm_overrides)
     or (new.email is distinct from old.email)
     or (new.id is distinct from old.id) then
    if not public.can_manage_users() then
      raise exception 'Only a user manager can change role, firm, active, email or permissions.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_app_users_priv on public.app_users;
create trigger trg_guard_app_users_priv
  before insert or update or delete on public.app_users
  for each row execute function public.guard_app_users_priv();

-- ---------------------------------------------------------------------------
-- 2. case_documents: the firm policy only checks firm_id. Bind the row to a
-- real lead/claim of that firm AND bind the storage pointer itself: uploads
-- live at "<firm_id>/<lead_id>/...", so a row cannot point another case's
-- label at someone else's stored file.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger
language plpgsql
set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid; acting text := current_user;
begin
  if acting in ('service_role', 'postgres', 'supabase_admin') then
    -- Server writes still get the referential checks below; skip nothing else.
    null;
  end if;
  if new.lead_id is not null then
    select firm_id into v_lead_firm from public.leads where id = new.lead_id;
    if v_lead_firm is null then raise exception 'case_documents: lead does not exist'; end if;
    if new.firm_id is distinct from v_lead_firm then
      raise exception 'case_documents: firm does not match the lead''s firm';
    end if;
  end if;
  if new.claim_id is not null then
    select lead_id, firm_id into v_claim_lead, v_claim_firm from public.claims where id = new.claim_id;
    if v_claim_lead is null then raise exception 'case_documents: claim does not exist'; end if;
    if new.lead_id is not null and v_claim_lead is distinct from new.lead_id then
      raise exception 'case_documents: claim does not belong to this lead';
    end if;
    if v_claim_firm is not null and new.firm_id is distinct from v_claim_firm then
      raise exception 'case_documents: firm does not match the claim''s firm';
    end if;
  end if;
  -- The stored object must live under this firm (and this lead, when set).
  if new.storage_path is not null then
    if position(new.firm_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this firm';
    end if;
    if new.lead_id is not null
       and position(new.firm_id::text || '/' || new.lead_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this lead';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_case_documents on public.case_documents;
create trigger trg_guard_case_documents
  before insert or update on public.case_documents
  for each row execute function public.guard_case_documents();

-- ---------------------------------------------------------------------------
-- 3. A deactivated account dies at the DATABASE too, not just in the app:
-- every RLS helper now treats active=false as no access, so a still-valid
-- JWT gets nothing through the Data API either.
-- ---------------------------------------------------------------------------
create or replace function public.is_internal()
returns boolean language sql stable set search_path = public as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and coalesce(active, true)
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

create or replace function public.can_manage_users()
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and ( u.role in ('owner','admin')
            or coalesce((u.perm_overrides->>'users.manage')::boolean, false) )
  );
$$;

create or replace function public.can_see_money()
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and case
            when u.perm_overrides ? 'money.view'
              then (u.perm_overrides->>'money.view')::boolean
            else u.role::text in ('owner','admin')
          end
  );
$$;

create or replace function public.role_is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_users where id = auth.uid() and coalesce(active, true) and role = 'firm')
$$;

create or replace function public.my_firm_id()
returns uuid language sql stable security definer set search_path = public as $$
  select firm_id from app_users where id = auth.uid() and coalesce(active, true)
$$;

create or replace function public.current_app_user()
returns table(uid uuid, firm_id uuid, role app_role)
language sql stable security definer set search_path = public as $$
  select id, firm_id, role from app_users where id = auth.uid() and coalesce(active, true)
$$;

-- ============================================================================
-- STATUS UPDATE, Sep 27 2026: 0101 Part B and 0102 are ALREADY APPLIED to the
-- live database (Claude applied them directly at Brett's direction) and
-- verified with impersonated-agent probes. You do NOT need to run anything
-- above. This file stays as the record.
--
-- One correction was made during live verification: the three helper
-- functions just above (is_internal, can_manage_users, can_see_money) caused
-- infinite recursion as written (the app_users policies call them, and as
-- invoker functions they re-entered those same policies — "stack depth limit
-- exceeded"). The versions actually live are SECURITY DEFINER with a pinned
-- search_path, reading only the caller's own row, anon EXECUTE revoked —
-- the same pattern my_firm_id/role_is_firm always used. That corrected text
-- is below and in supabase/migrations/0102_hardening_v2.sql. Already applied;
-- re-running is harmless.
-- ============================================================================

create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and coalesce(active, true)
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

create or replace function public.can_manage_users()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and ( u.role in ('owner','admin')
            or coalesce((u.perm_overrides->>'users.manage')::boolean, false) )
  );
$$;

create or replace function public.can_see_money()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = auth.uid()
      and coalesce(u.active, true)
      and case
            when u.perm_overrides ? 'money.view'
              then (u.perm_overrides->>'money.view')::boolean
            else u.role::text in ('owner','admin')
          end
  );
$$;

revoke execute on function public.is_internal() from anon;
revoke execute on function public.can_manage_users() from anon;
revoke execute on function public.can_see_money() from anon;

-- ============================================================================
-- 0103 (Astra round 3), Sep 28 2026: ALREADY APPLIED to the live database and
-- probe-verified (traversal and percent-encoded storage keys refused, clean
-- keys accepted, atomic property replace ends with the later full set).
-- Record only, nothing to run. Full text in supabase/migrations/0103_round3_hardening.sql.
-- ============================================================================
-- ============================================================================
-- 0103 — Astra round-3 repairs (Sep 28 2026).
--
-- 1. replace_claim_properties: property sets are replaced in ONE transaction.
--    The old insert-then-delete pair in the API could interleave across two
--    concurrent saves into ZERO rows. SECURITY INVOKER, so RLS still decides
--    who may touch the claim's rows.
-- 2. guard_case_documents: storage keys are authorized on their CANONICAL
--    form. A key that starts with the right "firm/lead/" prefix can still
--    normalize elsewhere via traversal or encoding; those keys are refused
--    outright.
-- 3. anon EXECUTE stripped from the remaining public functions that carried
--    it (trigger guards and norm_phone are not signed-out entry points).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic property replacement.
-- ---------------------------------------------------------------------------
create or replace function public.replace_claim_properties(p_claim_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  -- One transaction: the old set only leaves when the new set is in. Two
  -- concurrent replaces serialize on the row locks; the later full set wins,
  -- never an empty overlap.
  delete from claim_properties where claim_id = p_claim_id;
  insert into claim_properties (
    firm_id, claim_id, canonical_id, sequence_order, remembered_brand, current_brand,
    name_as_recalled, address, cross_streets, city, state, place_id, lat, lng,
    loc_confidence, landmarks, stay_month, stay_year, stay_duration, room_floor,
    age_at_time, under_18, acts_count_here, who_booked_paid, payment_method,
    men_per_day, asked_staff_for_help, asked_whom, police_emt_called,
    repeatedly_same_motel, specific_rooms_req, room_change_freq, visitors_check_desk,
    men_waiting_areas, housekeeping_entered, towel_change_freq, sheet_change_freq,
    dnd_long_periods, condoms_visible, staff_interact_traffk, staff_interact_victim,
    mgmt_intervened, violence_public_areas, drug_paraphernalia, staff_witnessed_drugs,
    staff_knowledge_other, has_variance, variance_notes, variance_trafficker,
    variance_control, custom
  )
  select
    p.firm_id, p_claim_id, p.canonical_id, p.sequence_order, p.remembered_brand, p.current_brand,
    p.name_as_recalled, p.address, p.cross_streets, p.city, p.state, p.place_id, p.lat, p.lng,
    p.loc_confidence, p.landmarks, p.stay_month, p.stay_year, p.stay_duration, p.room_floor,
    p.age_at_time, p.under_18, p.acts_count_here, p.who_booked_paid, p.payment_method,
    p.men_per_day, p.asked_staff_for_help, p.asked_whom, p.police_emt_called,
    p.repeatedly_same_motel, p.specific_rooms_req, p.room_change_freq, p.visitors_check_desk,
    p.men_waiting_areas, p.housekeeping_entered, p.towel_change_freq, p.sheet_change_freq,
    p.dnd_long_periods, p.condoms_visible, p.staff_interact_traffk, p.staff_interact_victim,
    p.mgmt_intervened, p.violence_public_areas, p.drug_paraphernalia, p.staff_witnessed_drugs,
    p.staff_knowledge_other, p.has_variance, p.variance_notes, p.variance_trafficker,
    p.variance_control, coalesce(p.custom, '{}'::jsonb)
  from jsonb_populate_recordset(null::claim_properties, coalesce(p_rows, '[]'::jsonb)) p;
end $$;

revoke execute on function public.replace_claim_properties(uuid, jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 2. Canonical storage keys in the document guard.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger
language plpgsql
set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid; acting text := current_user;
begin
  if acting in ('service_role', 'postgres', 'supabase_admin') then
    -- Server writes still get the referential checks below; skip nothing else.
    null;
  end if;
  if new.lead_id is not null then
    select firm_id into v_lead_firm from public.leads where id = new.lead_id;
    if v_lead_firm is null then raise exception 'case_documents: lead does not exist'; end if;
    if new.firm_id is distinct from v_lead_firm then
      raise exception 'case_documents: firm does not match the lead''s firm';
    end if;
  end if;
  if new.claim_id is not null then
    select lead_id, firm_id into v_claim_lead, v_claim_firm from public.claims where id = new.claim_id;
    if v_claim_lead is null then raise exception 'case_documents: claim does not exist'; end if;
    if new.lead_id is not null and v_claim_lead is distinct from new.lead_id then
      raise exception 'case_documents: claim does not belong to this lead';
    end if;
    if v_claim_firm is not null and new.firm_id is distinct from v_claim_firm then
      raise exception 'case_documents: firm does not match the claim''s firm';
    end if;
  end if;
  -- The stored object must live under this firm (and this lead, when set),
  -- and the key must already BE canonical: no traversal, no doubled or
  -- leading separators, no backslashes, no percent-encoding, no control
  -- characters. A prefix match on a non-canonical key authorizes the wrong
  -- object once a storage client normalizes it (Astra round 3).
  if new.storage_path is not null then
    if new.storage_path ~ '\.\.' or new.storage_path like '%//%'
       or left(new.storage_path, 1) = '/' or new.storage_path like '%\\%'
       or new.storage_path like '%\%%' or new.storage_path ~ '[\x00-\x1f]' then
      raise exception 'case_documents: storage path is not canonical';
    end if;
    if position(new.firm_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this firm';
    end if;
    if new.lead_id is not null
       and position(new.firm_id::text || '/' || new.lead_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this lead';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Strip anon EXECUTE from the stragglers.
-- ---------------------------------------------------------------------------
revoke execute on function public.guard_app_users_priv() from anon;
revoke execute on function public.guard_case_documents() from anon;
revoke execute on function public.norm_phone(text) from anon;

-- ============================================================================
-- 0104 (Astra round 4), Sep 28 2026: ALREADY APPLIED and probe-verified (agent
-- reads zero rows from all four credential tables and cannot call the drip
-- enrollment function; the owner still reads them). Record only.
-- Full text in supabase/migrations/0104_credentials_boundary.sql.
-- ============================================================================
-- ============================================================================
-- 0104 — Credentials boundary (Astra round 4, Sep 28 2026).
--
-- The four integration tables carried provider secrets behind is_internal()
-- ALL policies, so ANY active internal login — an agent — could read and
-- rewrite API keys and webhook secrets through the Data API. The admin
-- screens are owner/admin, but the DATABASE was not. These tables now answer
-- only to a user manager (owner/admin, or an explicit users.manage override),
-- through the same active-aware definer helper the app_users guard uses.
-- The server (service role) is unaffected.
--
-- Also: enroll_drips_for_lead ran as SECURITY DEFINER and was executable by
-- any authenticated user with no ownership validation. Only the server may
-- call it now.
-- ============================================================================

drop policy if exists api_keys_internal on public.api_keys;
create policy api_keys_admin on public.api_keys
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists webhook_ep_internal on public.webhook_endpoints;
create policy webhook_ep_admin on public.webhook_endpoints
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists jc_internal on public.justcall_accounts;
create policy jc_admin on public.justcall_accounts
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists esign_acct_internal on public.esign_accounts;
create policy esign_acct_admin on public.esign_accounts
  for all using (public.can_manage_users()) with check (public.can_manage_users());

revoke execute on function public.enroll_drips_for_lead(uuid, uuid) from anon, authenticated;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026 and probe-verified with
-- impersonated JWTs (rolled back): an active agent reads zero rows from all
-- four tables; the owner still reads them. Record only, nothing to run.
-- ============================================================================

-- ============================================================================
-- 0105 (speed to lead), Sep 28 2026: ALREADY APPLIED. Record only.
-- ============================================================================
-- ============================================================================
-- 0105 — Speed to lead (Sep 28 2026, Brett's ask).
--
-- Two clocks per lead, both starting at leads.created_at (the moment the lead
-- dropped in, whatever the source):
--   first_opened_at / first_opened_by — the first time internal staff opened
--     the file in ClaimReach (the call screen or the classic lead page).
--   first_dialed_at — the first outbound call or voicemail attempt to the
--     lead's number, stamped from the JustCall webhook at the call's own time.
-- Both are write-once (guarded .is null in the app), and a call that predates
-- the lead never stamps (created_at <= call time), so a speed can never be
-- negative. Reports reads these per campaign.
-- ============================================================================
alter table leads add column if not exists first_opened_at timestamptz;
alter table leads add column if not exists first_opened_by uuid;
alter table leads add column if not exists first_dialed_at timestamptz;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026. Record only.
-- ============================================================================

-- ============================================================================
-- 0106 (round 5), Sep 28 2026: ALREADY APPLIED and probe-verified (anon has no
-- effective EXECUTE on the guards/helpers; agent RLS unchanged at 150 lead
-- rows; locked property replace works and refuses a bogus claim). Record only.
-- ============================================================================
-- ============================================================================
-- 0106 — Round-5 repairs from Astra's review of round 3 (Sep 28 2026).
--
-- 1. esign_submissions.doc_count: the packet's manifest size, stamped when a
--    submission completes. Recovery retries until the stored files match it
--    and delivery refuses a shorter packet.
-- 2. replace_claim_properties gains a per-claim advisory transaction lock and
--    a claim existence/authorization check. The round-3 version was atomic
--    per call but two overlapping calls on an EMPTY set could both insert
--    (nothing to lock). The advisory lock serializes the claim's set no
--    matter what rows exist. Supersedes the 0103 function body.
-- 3. Effective EXECUTE privileges. The earlier "revoke from anon" left
--    PUBLIC's implicit EXECUTE in place, so anon still had effective EXECUTE
--    on the guards, helpers and norm_phone (Astra round-3 review, verified
--    with has_function_privilege). Revoke PUBLIC and grant back exactly the
--    roles each function needs.
-- ============================================================================

alter table esign_submissions add column if not exists doc_count int;

create or replace function public.replace_claim_properties(p_claim_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  -- Serialize per claim, whatever rows exist: two overlapping replaces queue
  -- here instead of both inserting into an empty set.
  perform pg_advisory_xact_lock(hashtextextended('claim_properties:' || p_claim_id::text, 0));
  -- The claim must exist AND be visible to the caller (RLS applies here,
  -- SECURITY INVOKER), so the function cannot write into someone else's claim.
  if not exists (select 1 from claims where id = p_claim_id) then
    raise exception 'replace_claim_properties: no such claim';
  end if;
  delete from claim_properties where claim_id = p_claim_id;
  insert into claim_properties (
    firm_id, claim_id, canonical_id, sequence_order, remembered_brand, current_brand,
    name_as_recalled, address, cross_streets, city, state, place_id, lat, lng,
    loc_confidence, landmarks, stay_month, stay_year, stay_duration, room_floor,
    age_at_time, under_18, acts_count_here, who_booked_paid, payment_method,
    men_per_day, asked_staff_for_help, asked_whom, police_emt_called,
    repeatedly_same_motel, specific_rooms_req, room_change_freq, visitors_check_desk,
    men_waiting_areas, housekeeping_entered, towel_change_freq, sheet_change_freq,
    dnd_long_periods, condoms_visible, staff_interact_traffk, staff_interact_victim,
    mgmt_intervened, violence_public_areas, drug_paraphernalia, staff_witnessed_drugs,
    staff_knowledge_other, has_variance, variance_notes, variance_trafficker,
    variance_control, custom
  )
  select
    p.firm_id, p_claim_id, p.canonical_id, p.sequence_order, p.remembered_brand, p.current_brand,
    p.name_as_recalled, p.address, p.cross_streets, p.city, p.state, p.place_id, p.lat, p.lng,
    p.loc_confidence, p.landmarks, p.stay_month, p.stay_year, p.stay_duration, p.room_floor,
    p.age_at_time, p.under_18, p.acts_count_here, p.who_booked_paid, p.payment_method,
    p.men_per_day, p.asked_staff_for_help, p.asked_whom, p.police_emt_called,
    p.repeatedly_same_motel, p.specific_rooms_req, p.room_change_freq, p.visitors_check_desk,
    p.men_waiting_areas, p.housekeeping_entered, p.towel_change_freq, p.sheet_change_freq,
    p.dnd_long_periods, p.condoms_visible, p.staff_interact_traffk, p.staff_interact_victim,
    p.mgmt_intervened, p.violence_public_areas, p.drug_paraphernalia, p.staff_witnessed_drugs,
    p.staff_knowledge_other, p.has_variance, p.variance_notes, p.variance_trafficker,
    p.variance_control, coalesce(p.custom, '{}'::jsonb)
  from jsonb_populate_recordset(null::claim_properties, coalesce(p_rows, '[]'::jsonb)) p;
end $$;

-- Effective privileges: close the PUBLIC hole, grant back exactly what each
-- function needs. The RLS helper functions must stay executable by
-- authenticated (the policies evaluate as the querying role).
revoke execute on function public.guard_app_users_priv() from public;
revoke execute on function public.guard_case_documents() from public;

revoke execute on function public.norm_phone(text) from public;
grant execute on function public.norm_phone(text) to authenticated, service_role;

revoke execute on function public.replace_claim_properties(uuid, jsonb) from public;
grant execute on function public.replace_claim_properties(uuid, jsonb) to authenticated, service_role;

revoke execute on function public.is_internal() from public;
grant execute on function public.is_internal() to authenticated, service_role;
revoke execute on function public.can_manage_users() from public;
grant execute on function public.can_manage_users() to authenticated, service_role;
revoke execute on function public.can_see_money() from public;
grant execute on function public.can_see_money() to authenticated, service_role;
revoke execute on function public.my_firm_id() from public;
grant execute on function public.my_firm_id() to authenticated, service_role;
revoke execute on function public.role_is_firm() from public;
grant execute on function public.role_is_firm() to authenticated, service_role;
revoke execute on function public.current_app_user() from public;
grant execute on function public.current_app_user() to authenticated, service_role;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026 and probe-verified:
-- anon has NO effective EXECUTE on any of the functions above; authenticated
-- keeps the helpers; an active agent's RLS access is unchanged; the property
-- replace still works and refuses a nonexistent claim. Record only.
-- ============================================================================

-- ============================================================================
-- 0107 — Round 6 (Sep 28 2026): move_leads_to_firm — a firm move is ONE
-- transaction over the whole graph (lead, claims, documents, signings,
-- communications, notes, QA, activity, deliveries), so a failure moves
-- nothing and a success leaves nothing half-owned. service_role only;
-- PUBLIC/anon/authenticated revoked and probe-verified with
-- has_function_privilege. STATUS: APPLIED live on Sep 28 2026 and
-- probe-verified (synthetic two-firm move rolled back; bogus firm refused).
-- Record only — nothing for you to run. Full text:
-- supabase/migrations/0107_round6_hardening.sql
-- ============================================================================

-- ============================================================================
-- 0108 — Round 7 (Sep 28 2026): matter identity. claim_id on intake_calls,
-- esign_submissions, retainers and firm_deliveries; claim-level firm_sent_at /
-- firm_send_result; signed-notice lease columns on esign_submissions
-- (notify_state; the two rows claimed with no send recorded are marked
-- legacy_unknown); inbound_media (one row per MMS attachment, internal read
-- only); move_leads_to_firm replaced by a campaign-aware version that moves
-- documents with their storage paths and claim_properties, and refuses a
-- move that would leave a stored document under the old firm's path.
-- ACL note, corrected (Astra round 6): CREATE OR REPLACE on an existing
-- function with the same identity KEEPS its grants. 0108 drops and recreates
-- move_leads_to_firm because the argument list changed, then grants
-- service_role only. STATUS: APPLIED live on Sep 28 2026 and probe-verified
-- (unrelocated document refused and rolled back; wrong-firm campaign refused;
-- full transfer checked; privileges checked). Record only, nothing to run.
-- Full text: supabase/migrations/0108_round7_matter_identity.sql
-- ============================================================================

-- ============================================================================
-- 0109 — Standard fields + void (Sep 28 2026). leads gains home_phone,
-- work_phone, dl_number, incident_city, incident_state (one column per
-- standard field; cell stays leads.phone). esign_submissions gains
-- voided_at, voided_by, void_reason: a voided agreement is kept, never
-- deleted, and its DocuSeal link is archived. Additive only.
-- STATUS: APPLIED live on Sep 28 2026 (0109_standard_fields + 0109b_esign_void);
-- columns checked, authenticated can read and update them. Record only.
-- Full text: supabase/migrations/0109_standard_fields.sql
-- ============================================================================

-- 0110 firm delivery dispatch: LOCAL ONLY, not applied. Review/apply before deploying v9.

-- 0110: one durable delivery reservation per claim. LOCAL / NOT APPLIED.
-- The route remains the permission boundary. Only service_role can call these
-- functions or read/write this table; ordinary app roles receive no new access.
-- A provider timeout is never retried automatically: reconcile its outcome.
begin;
alter table public.firm_deliveries add column if not exists dispatch_key uuid;
create table if not exists public.firm_delivery_dispatch (
  claim_id uuid primary key references public.claims(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  attempt_key uuid not null,
  state text not null check (state in ('sending','sent','failed','uncertain')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  reconciled_at timestamptz,
  reconciled_by uuid references public.app_users(id),
  reconciliation_note text
);
alter table public.firm_delivery_dispatch enable row level security;
revoke all on public.firm_delivery_dispatch from public, anon, authenticated;
grant all on public.firm_delivery_dispatch to service_role;

create or replace function public.begin_firm_delivery(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid, p_campaign_id uuid, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.claims%rowtype; l public.leads%rowtype; d public.firm_delivery_dispatch%rowtype; k uuid;
begin
  select * into l from public.leads where id=p_lead_id for update;
  if not found or l.archived_at is not null then raise exception 'The file is missing or archived'; end if;
  select * into c from public.claims where id=p_claim_id and lead_id=p_lead_id for update;
  if not found then raise exception 'The selected matter does not belong to this file'; end if;
  if l.firm_id is distinct from p_firm_id or coalesce(c.firm_id,l.firm_id) is distinct from p_firm_id
    or coalesce(c.campaign_id,l.campaign_id) is distinct from p_campaign_id then
    raise exception 'The firm or campaign changed while preparing delivery. Refresh and check the recipient';
  end if;
  select * into d from public.firm_delivery_dispatch where claim_id=p_claim_id;
  if d.state in ('sending','uncertain') then
    return jsonb_build_object('state','blocked','attempt_key',d.attempt_key);
  end if;
  if not coalesce(p_force,false) and (c.firm_sent_at is not null or d.state='sent') then
    return jsonb_build_object('state','sent','attempt_key',d.attempt_key);
  end if;
  k := gen_random_uuid();
  insert into public.firm_delivery_dispatch(claim_id,lead_id,attempt_key,state)
  values(p_claim_id,p_lead_id,k,'sending')
  on conflict(claim_id) do update set lead_id=excluded.lead_id,attempt_key=k,state='sending',
    started_at=now(),finished_at=null,error=null,reconciled_at=null,reconciled_by=null,reconciliation_note=null;
  return jsonb_build_object('state','acquired','attempt_key',k);
end $$;

create or replace function public.finish_firm_delivery(p_claim_id uuid, p_attempt_key uuid, p_state text, p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_state not in ('sent','failed','uncertain') then raise exception 'Invalid delivery outcome'; end if;
  perform 1 from public.claims where id=p_claim_id for update;
  update public.firm_delivery_dispatch set state=p_state,finished_at=now(),error=p_error
    where claim_id=p_claim_id and attempt_key=p_attempt_key and state='sending';
  get diagnostics n = row_count;
  if n=1 and p_state='sent' then
    update public.claims set firm_sent_at=coalesce(firm_sent_at,now()),firm_send_result='sent' where id=p_claim_id;
  end if;
  return n=1;
end $$;

-- A logged, deliberate correction after checking the provider. This is NOT a
-- resend. 'not delivered' unlocks a later attempt; 'delivered' keeps the guard.
create or replace function public.reconcile_firm_delivery(p_lead_id uuid, p_claim_id uuid, p_attempt_key uuid, p_delivered boolean, p_actor_id uuid, p_note text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; c public.claims%rowtype; d public.firm_delivery_dispatch%rowtype;
begin
  if p_delivered is null or length(trim(coalesce(p_note,''))) < 10 then raise exception 'Explain the provider check before reconciling'; end if;
  if not exists(select 1 from public.app_users where id=p_actor_id and role in ('owner','admin') and active is not false) then
    raise exception 'Only an active owner or admin may reconcile delivery';
  end if;
  select * into c from public.claims where id=p_claim_id and lead_id=p_lead_id for update;
  if not found then raise exception 'The selected matter does not belong to this file'; end if;
  select * into d from public.firm_delivery_dispatch where claim_id=p_claim_id and attempt_key=p_attempt_key;
  if d.state='sending' and d.started_at > now() - interval '2 minutes' then
    raise exception 'The send may still be running. Wait two minutes before reconciling it';
  end if;
  update public.firm_delivery_dispatch set state=case when p_delivered then 'sent' else 'failed' end,
    finished_at=now(),error=null,reconciled_at=now(),reconciled_by=p_actor_id,reconciliation_note=trim(p_note)
    where claim_id=p_claim_id and lead_id=p_lead_id and attempt_key=p_attempt_key and state in ('sending','uncertain');
  get diagnostics n = row_count;
  if n=1 and p_delivered then
    update public.claims set firm_sent_at=coalesce(firm_sent_at,now()),firm_send_result='sent (reconciled)' where id=p_claim_id;
  end if;
  if n=1 then
    insert into public.firm_deliveries(lead_id,claim_id,campaign_id,firm_id,ok,error,triggered_by,actor_name,dispatch_key)
      select p_lead_id,p_claim_id,c.campaign_id,c.firm_id,p_delivered,'Reconciled: ' || trim(p_note),'reconciliation',u.full_name,p_attempt_key
      from public.app_users u where u.id=p_actor_id;
  end if;
  return n=1;
end $$;
-- Keep the assembled recipient binding stable after the reservation commits.
-- A transfer's copy phase may run, but its atomic row switch must wait for a
-- known delivery outcome; the existing transfer handler preserves originals.
-- The trigger must read the private reservation even for an ordinary session
-- update. Keep its narrowly privileged, read-only implementation off the API
-- schema; it grants no client access to dispatch metadata or RPCs.
create schema if not exists claimreach_delivery_private;
revoke all on schema claimreach_delivery_private from public,anon,authenticated;
grant usage on schema claimreach_delivery_private to service_role;
create or replace function claimreach_delivery_private.guard_delivery_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='leads' then
    if (new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id or new.archived_at is distinct from old.archived_at)
      and exists(select 1 from public.firm_delivery_dispatch where lead_id=old.id and state in ('sending','uncertain')) then
      raise exception 'Resolve the active or uncertain firm delivery before moving or archiving this file';
    end if;
  else
    if (new.lead_id is distinct from old.lead_id or new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id)
      and exists(select 1 from public.firm_delivery_dispatch where claim_id=old.id and state in ('sending','uncertain')) then
      raise exception 'Resolve the active or uncertain firm delivery before changing this matter association';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_delivery_lead_binding on public.leads;
create trigger guard_delivery_lead_binding before update of firm_id,campaign_id,archived_at on public.leads
  for each row execute function claimreach_delivery_private.guard_delivery_binding();
drop trigger if exists guard_delivery_claim_binding on public.claims;
create trigger guard_delivery_claim_binding before update of lead_id,firm_id,campaign_id on public.claims
  for each row execute function claimreach_delivery_private.guard_delivery_binding();
revoke all on function claimreach_delivery_private.guard_delivery_binding() from public,anon,authenticated;
grant execute on function claimreach_delivery_private.guard_delivery_binding() to service_role;
revoke all on function public.begin_firm_delivery(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.finish_firm_delivery(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reconcile_firm_delivery(uuid,uuid,uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_firm_delivery(uuid,uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.finish_firm_delivery(uuid,uuid,text,text) to service_role;
grant execute on function public.reconcile_firm_delivery(uuid,uuid,uuid,boolean,uuid,text) to service_role;
commit;


-- 0111_emergency_signing_evidence (v9 local; not applied live)
begin;
-- Local v9 migration. Apply only with the matching emergency signing routes.
-- No public RPC: the server validates the capability, consent and PNG first.
-- Evidence and packet membership are immutable once a signing begins.
create or replace function public.guard_emergency_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.audit->'emergency'->>'version' = '1' then
    if tg_op = 'DELETE' then
      raise exception 'Emergency signing history cannot be deleted; cancel the pending agreement instead';
    end if;
    if ((new.audit->'emergency') - 'evidence') is distinct from ((old.audit->'emergency') - 'evidence')
       or (new.audit->'emergency'->'snapshot') is distinct from (old.audit->'emergency'->'snapshot')
       or (new.audit->'emergency'->'packet_manifest') is distinct from (old.audit->'emergency'->'packet_manifest')
       or (new.audit->'emergency'->>'claim_id') is distinct from (old.audit->'emergency'->>'claim_id')
       or (new.audit->'emergency'->>'campaign_id') is distinct from (old.audit->'emergency'->>'campaign_id')
       or new.lead_id is distinct from old.lead_id or new.firm_id is distinct from old.firm_id
       or new.envelope_id is distinct from old.envelope_id or new.packet_group is distinct from old.packet_group or new.created_at is distinct from old.created_at
       or new.provider is distinct from old.provider or new.certified is distinct from old.certified
       or new.title is distinct from old.title or new.signer_name is distinct from old.signer_name
       or new.signer_email is distinct from old.signer_email or new.signer_phone is distinct from old.signer_phone
       or new.sender_ip is distinct from old.sender_ip or new.sent_at is distinct from old.sent_at then
      raise exception 'The issued emergency document snapshot is immutable';
    end if;
    if new.status = 'signed' and old.status not in ('signing', 'signed') then
      raise exception 'Emergency completion requires recorded signature evidence';
    end if;
    if current_user not in ('postgres', 'service_role', 'supabase_admin') and (
      (new.status in ('signing','signed') and new.status is distinct from old.status)
      or new.signature_data is distinct from old.signature_data or new.consent_at is distinct from old.consent_at
      or (new.audit->'emergency'->'evidence') is distinct from (old.audit->'emergency'->'evidence')
      or new.completed_pdf_path is distinct from old.completed_pdf_path or new.cert_pdf_path is distinct from old.cert_pdf_path
    ) then raise exception 'Emergency evidence is written only by the signing transaction'; end if;
    if old.status in ('signing', 'signed', 'cancelled', 'declined') then
      if new.signature_data is distinct from old.signature_data or new.signed_name is distinct from old.signed_name
         or new.signed_at is distinct from old.signed_at or new.signed_ip is distinct from old.signed_ip
         or new.signature_type is distinct from old.signature_type or new.doc_hash is distinct from old.doc_hash
         or new.consent_at is distinct from old.consent_at
         or (new.audit->'emergency'->'evidence') is distinct from (old.audit->'emergency'->'evidence') then
        raise exception 'Recorded signature and consent evidence cannot be replaced';
      end if;
      if new.status is distinct from old.status and not (old.status = 'signing' and new.status = 'signed') then
        raise exception 'This emergency agreement cannot be reopened or cancelled after signing began';
      end if;
    end if;
    if old.completed_pdf_path is not null and new.completed_pdf_path is distinct from old.completed_pdf_path then
      raise exception 'The signed PDF reference is immutable';
    end if;
    if old.cert_pdf_path is not null and new.cert_pdf_path is distinct from old.cert_pdf_path then
      raise exception 'The signing certificate reference is immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_emergency_evidence on public.signable_documents;
create trigger trg_emergency_evidence before update or delete on public.signable_documents
for each row execute function public.guard_emergency_evidence();

create or replace function public.begin_emergency_signing(p_ids uuid[], p_hash text, p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.signable_documents; n integer; manifest jsonb; at_time timestamptz := now();
begin
  if cardinality(p_ids) is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 30
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid packet evidence'; end if;
  if p_evidence->>'consent_version' is distinct from 'emergency-v1'
     or p_evidence->>'consent_accepted' is distinct from 'true'
     or length(trim(coalesce(p_evidence->>'signed_name', ''))) < 2
     or coalesce(p_evidence->>'signature_data', '') not like 'data:image/png;base64,%' then
    raise exception 'Signature and electronic consent are required';
  end if;
  perform id from public.signable_documents where id = any(p_ids) order by id for update;
  select count(*) into n from public.signable_documents where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Packet membership changed'; end if;
  select jsonb_agg(x::text order by x::text) into manifest from unnest(p_ids) x;
  for d in select * from public.signable_documents where id = any(p_ids) order by id loop
    if d.certified or d.provider is distinct from 'builtin' or d.audit->'emergency'->>'version' is distinct from '1'
       or (select jsonb_agg(v order by v) from jsonb_array_elements_text(d.audit->'emergency'->'packet_manifest') v) is distinct from manifest
       or d.audit->'emergency'->'snapshot'->>'source_sha256' is null then raise exception 'Emergency snapshot unavailable'; end if;
    if d.status in ('signing', 'signed') then
      if d.audit->'emergency'->'evidence'->>'hash' is distinct from p_hash then raise exception 'This packet already has different signature evidence'; end if;
    elsif d.status not in ('sent', 'viewed') then raise exception 'This signing link is no longer open'; end if;
  end loop;
  update public.signable_documents set status = 'signing', signed_at = at_time, consent_at = at_time,
    signature_data = p_evidence->>'signature_data', signed_name = p_evidence->>'signed_name',
    signature_type = p_evidence->>'signature_type', signed_ip = p_evidence->>'ip',
    doc_hash = audit->'emergency'->'snapshot'->>'source_sha256',
    audit = jsonb_set(audit, '{emergency,evidence}', p_evidence || jsonb_build_object('hash', p_hash, 'at', at_time))
    where id = any(p_ids) and status in ('sent', 'viewed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.finish_emergency_signing(p_ids uuid[], p_hash text, p_artifacts jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.signable_documents; a jsonb; n integer; changed integer; folder text; signed_path text; cert_path text;
begin
  if cardinality(p_ids) is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 30
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or jsonb_array_length(p_artifacts) <> cardinality(p_ids) then raise exception 'Invalid packet artifacts'; end if;
  perform id from public.signable_documents where id = any(p_ids) order by id for update;
  select count(*) into n from public.signable_documents where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Packet membership changed'; end if;
  for d in select * from public.signable_documents where id = any(p_ids) order by id loop
    if d.status not in ('signing', 'signed') or d.audit->'emergency'->'evidence'->>'hash' is distinct from p_hash
       or cardinality(p_ids) <> jsonb_array_length(d.audit->'emergency'->'packet_manifest')
       or not (d.audit->'emergency'->'packet_manifest' @> to_jsonb(p_ids)) then raise exception 'Signature evidence does not match'; end if;
    select value into a from jsonb_array_elements(p_artifacts) where value->>'id' = d.id::text;
    folder := coalesce(d.firm_id::text, 'master');
    signed_path := folder || '/signed-' || d.envelope_id || '.pdf';
    cert_path := folder || '/cert-' || d.envelope_id || '.pdf';
    if a is null or a->>'completed_pdf_path' is distinct from signed_path or a->>'cert_pdf_path' is distinct from cert_path
       or not exists(select 1 from storage.objects where bucket_id = 'signed-docs' and name = signed_path)
       or not exists(select 1 from storage.objects where bucket_id = 'signed-docs' and name = cert_path) then raise exception 'The complete signed packet is not stored'; end if;
  end loop;
  update public.signable_documents target_doc set status = 'signed',
    completed_pdf_path = artifact_row.value->>'completed_pdf_path', cert_pdf_path = artifact_row.value->>'cert_pdf_path',
    completed_pdf_url = '/api/signed-doc/' || target_doc.id || '/signed', cert_pdf_url = '/api/signed-doc/' || target_doc.id || '/cert'
    from jsonb_array_elements(p_artifacts) artifact_row where target_doc.id = any(p_ids) and artifact_row.value->>'id' = target_doc.id::text and target_doc.status = 'signing';
  get diagnostics changed = row_count;
  if changed > 0 then
    select * into d from public.signable_documents where id = p_ids[1];
    insert into public.notifications (firm_id, sender_name, lead_id, body)
      values(d.firm_id, 'E-Sign', d.lead_id, 'Emergency agreement recorded for ' || coalesce(d.signed_name, 'client') || '. DocuSeal re-sign is still required.');
  end if;
  return jsonb_build_object('ok', true, 'already', changed = 0, 'needs_resign', true);
end $$;

revoke all on function public.guard_emergency_evidence() from public, anon, authenticated;
revoke all on function public.begin_emergency_signing(uuid[], text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_emergency_signing(uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.guard_emergency_evidence() to service_role;
grant execute on function public.begin_emergency_signing(uuid[], text, jsonb) to service_role;
grant execute on function public.finish_emergency_signing(uuid[], text, jsonb) to service_role;

commit;

-- 0112_partner_readonly_access (v9 local; not applied live)
-- Partner identities deliberately have no app_users row. Existing staff/firm
-- RLS therefore grants them no direct access to case or document tables.
-- The server reads only exact, owner-approved source IDs from this allowlist.
begin;
create table if not exists public.partner_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  partner_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint partner_accounts_email_lower check (email = lower(email)),
  constraint partner_accounts_key_format check (partner_key ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
create index if not exists partner_accounts_key_idx on public.partner_accounts(partner_key) where active;
alter table public.partner_accounts enable row level security;
drop policy if exists partner_accounts_self_read on public.partner_accounts;
create policy partner_accounts_self_read on public.partner_accounts
  for select to authenticated using (auth_user_id = auth.uid() and active);
revoke all on public.partner_accounts from anon, authenticated;
grant select on public.partner_accounts to authenticated;

create table if not exists public.partner_source_leads (
  partner_key text not null,
  source_system text not null,
  source_lead_id text not null,
  firm_id uuid not null references public.firms(id),
  approved_at timestamptz not null default now(),
  approved_by uuid references public.app_users(id),
  primary key (partner_key, source_system, source_lead_id),
  constraint partner_source_leads_lawruler_id check
    (source_system <> 'lawruler' or source_lead_id ~ '^[0-9]{1,30}$')
);
create index if not exists partner_source_leads_lookup_idx
  on public.partner_source_leads(source_system, source_lead_id, firm_id);
alter table public.partner_source_leads enable row level security;
revoke all on public.partner_source_leads from anon, authenticated;
-- No authenticated policy: only the service-role server path can read or write
-- this table. A partner cannot enumerate another partner's approved IDs.
commit;

-- 0113_auth_read_boundary (v9 local; not applied live)
-- The old authenticated-wide SELECT policies survived in production even
-- though 0085 intended to replace several of them. Permissive RLS policies
-- combine with OR, so a scoped policy does not cancel an older broad one.
-- An external partner has an auth account but no app_users profile. The
-- partner page uses the service role to emit an explicitly limited report;
-- their own JWT must not read application tables directly.
begin;
drop policy if exists campaigns_read on public.campaigns;
drop policy if exists firm_deliveries_read on public.firm_deliveries;
drop policy if exists automations_read on public.automations;
drop policy if exists sla_read on public.sla_settings;

drop policy if exists boards_read on public.boards;
create policy boards_read on public.boards for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists bull_read on public.bulletins;
create policy bull_read on public.bulletins for select to authenticated
  using (public.is_internal() or
    (public.role_is_firm() and firm_id = public.my_firm_id()));

-- Shared vocabularies remain available to staff and firm users, but a
-- partner's direct JWT cannot enumerate internal workflows or rules.
drop policy if exists ctr_read on public.case_type_registry;
create policy ctr_read on public.case_type_registry for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists ladder_read on public.escalation_ladder;
create policy ladder_read on public.escalation_ladder for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists statuses_read on public.statuses;
create policy statuses_read on public.statuses for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists dq_reasons_read on public.dq_reasons;
create policy dq_reasons_read on public.dq_reasons for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists aliases_read on public.lawruler_aliases;
create policy aliases_read on public.lawruler_aliases for select to authenticated
  using (public.is_internal() or public.role_is_firm());
drop policy if exists option_lists_firm_read on public.option_lists;
create policy option_lists_firm_read on public.option_lists for select to authenticated
  using (public.is_internal() or
    (public.role_is_firm() and (firm_id is null or firm_id = public.my_firm_id())));

-- mint_lead_no is a SECURITY DEFINER RPC callable by authenticated users.
-- An account without an internal profile must not advance the global counter
-- for an arbitrary firm. Staff create routes and service-role ingest still work.
create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  if auth.role() <> 'service_role' and not public.is_internal() then
    raise exception 'Only internal staff may mint a lead number';
  end if;
  select coalesce(lead_prefix, 'CR') into pfx from public.firms where id = p_firm;
  if pfx is null then pfx := 'CR'; end if;
  nxt := nextval('public.global_lead_seq');
  return pfx || '-' || nxt::text;
end $$;

-- The existing authenticated self-provisioning RPC must not turn a partner
-- identity into a firm account if its email is later added to firm_access.
create or replace function public.provision_self_from_firm_access()
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; account_type text;
begin
  if uid is null then return false; end if;
  select email, raw_app_meta_data->>'account_type' into em, account_type
    from auth.users where id = uid;
  if account_type = 'partner' then return false; end if;
  return public.provision_firm_user_for(uid, em);
end $$;
commit;

-- 0115 INNO MVA staff wall (LOCAL; apply before allowing agents into production).
-- Pilot access boundary: internal staff other than the owner may work only
-- active INNO MVA files. Firm and partner policies keep their own boundaries.
-- Apply atomically before giving agents production access. Service-role
-- ingestion, provider webhooks and scheduled jobs bypass RLS as before.
begin;

create or replace function public.cr_is_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.active = true and u.role::text = 'owner'
  );
$$;

create or replace function public.cr_inno_mva_campaign_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then (array_agg(c.id))[1] else null end
  from public.campaigns c join public.firms f on f.id = c.firm_id
  where c.name = 'INNO MVA' and c.case_type = 'mva'
    and c.active = true and f.slug = 'tmp';
$$;

create or replace function public.cr_inno_mva_firm_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select c.firm_id from public.campaigns c
  where c.id = public.cr_inno_mva_campaign_id();
$$;

create or replace function public.cr_can_access_inno_mva_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id and l.archived_at is null
      and l.campaign_id = public.cr_inno_mva_campaign_id()
      and l.firm_id = public.cr_inno_mva_firm_id()
  );
$$;

create or replace function public.cr_can_access_inno_mva_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.claims c
    where c.id = p_claim_id
      and c.campaign_id = public.cr_inno_mva_campaign_id()
      and c.firm_id = public.cr_inno_mva_firm_id()
      and public.cr_can_access_inno_mva_lead(c.lead_id)
  );
$$;

create or replace function public.cr_claim_matches_lead(p_claim_id uuid, p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.claims c
    where c.id = p_claim_id and c.lead_id = p_lead_id
      and public.cr_can_access_inno_mva_claim(c.id)
  );
$$;

revoke all on function public.cr_is_owner() from public;
revoke all on function public.cr_inno_mva_campaign_id() from public;
revoke all on function public.cr_inno_mva_firm_id() from public;
revoke all on function public.cr_can_access_inno_mva_lead(uuid) from public;
revoke all on function public.cr_can_access_inno_mva_claim(uuid) from public;
revoke all on function public.cr_claim_matches_lead(uuid,uuid) from public;
grant execute on function public.cr_is_owner() to authenticated, service_role;
grant execute on function public.cr_inno_mva_campaign_id() to authenticated, service_role;
grant execute on function public.cr_inno_mva_firm_id() to authenticated, service_role;
grant execute on function public.cr_can_access_inno_mva_lead(uuid) to authenticated, service_role;
grant execute on function public.cr_can_access_inno_mva_claim(uuid) to authenticated, service_role;
grant execute on function public.cr_claim_matches_lead(uuid,uuid) to authenticated, service_role;

-- A restrictive policy ANDs with every existing permissive policy. This is
-- crucial: adding one more permissive scoped policy would leave is_internal()
-- granting the entire database. Default for non-owner staff is no rows.
do $$
declare t record; predicate text; column_type text;
begin
  for t in
    select c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and has_table_privilege('authenticated', c.oid, 'SELECT')
  loop
    predicate := 'false';
    if t.table_name = 'leads' then
      predicate := 'archived_at is null and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'claims' then
      predicate := 'public.cr_can_access_inno_mva_lead(lead_id) and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'campaigns' then
      predicate := 'id = public.cr_inno_mva_campaign_id()';
    elsif t.table_name = 'firms' then
      predicate := 'id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'app_users' then
      predicate := 'id = auth.uid() or (role::text = ''owner'' and active = true)';
    elsif t.table_name = 'routing_rules' then
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and (case_type = ''mva'' or case_type is null)';
    elsif t.table_name in ('statuses', 'dq_reasons', 'call_dispo_reasons') then
      predicate := 'true';
    else
      select data_type into column_type from information_schema.columns
       where table_schema = 'public' and table_name = t.table_name and column_name = 'lead_id';
      if column_type = 'uuid' then
        predicate := 'public.cr_can_access_inno_mva_lead(lead_id)';
        if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'claim_id' and data_type = 'uuid') then
          predicate := predicate || ' and (claim_id is null or public.cr_claim_matches_lead(claim_id,lead_id))';
        end if;
      elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'claim_id' and data_type = 'uuid') then
        predicate := 'public.cr_can_access_inno_mva_claim(claim_id)';
      elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'campaign_id' and data_type = 'uuid') then
        predicate := 'campaign_id = public.cr_inno_mva_campaign_id()';
      end if;
      if predicate <> 'false' and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'firm_id' and data_type = 'uuid') then
        predicate := predicate || ' and firm_id = public.cr_inno_mva_firm_id()';
      end if;
      if predicate <> 'false' and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'campaign_id' and data_type = 'uuid') then
        predicate := predicate || ' and campaign_id = public.cr_inno_mva_campaign_id()';
      end if;
    end if;
    execute format('drop policy if exists cr_inno_mva_staff_wall on public.%I', t.table_name);
    execute format(
      'create policy cr_inno_mva_staff_wall on public.%I as restrictive for all to authenticated using (not public.is_internal() or public.cr_is_owner() or (%s)) with check (not public.is_internal() or public.cr_is_owner() or (%s))',
      t.table_name, predicate, predicate
    );
    -- The existing internal ALL policies also permit hard DELETE. The pilot
    -- uses archive/update paths, so only the owner may delete rows directly.
    execute format('drop policy if exists cr_pilot_no_hard_delete on public.%I', t.table_name);
    execute format('create policy cr_pilot_no_hard_delete on public.%I as restrictive for delete to authenticated using (not public.is_internal() or public.cr_is_owner())', t.table_name);
  end loop;
end $$;

-- Hide settings from staff and also deny direct Data API writes to the
-- configuration behind them. The read wall alone does not block updates.
do $$
declare t text;
begin
  foreach t in array array['campaigns','firms','routing_rules','statuses','dq_reasons','call_dispo_reasons'] loop
    execute format('drop policy if exists cr_pilot_config_insert on public.%I', t);
    execute format('drop policy if exists cr_pilot_config_update on public.%I', t);
    execute format('drop policy if exists cr_pilot_config_delete on public.%I', t);
    execute format('create policy cr_pilot_config_insert on public.%I as restrictive for insert to authenticated with check (not public.is_internal() or public.cr_is_owner())', t);
    execute format('create policy cr_pilot_config_update on public.%I as restrictive for update to authenticated using (not public.is_internal() or public.cr_is_owner()) with check (not public.is_internal() or public.cr_is_owner())', t);
    execute format('create policy cr_pilot_config_delete on public.%I as restrictive for delete to authenticated using (not public.is_internal() or public.cr_is_owner())', t);
  end loop;
end $$;

-- app_users_manage lets a user update their own entire row, including role and
-- permission overrides. Staff cannot write app_users during the pilot; firm
-- users may continue editing profile fields but cannot change access fields.
drop policy if exists cr_pilot_user_update on public.app_users;
create policy cr_pilot_user_update on public.app_users as restrictive for update to authenticated
  using (not public.is_internal() or public.cr_is_owner())
  with check (not public.is_internal() or public.cr_is_owner());
drop policy if exists cr_pilot_user_insert on public.app_users;
create policy cr_pilot_user_insert on public.app_users as restrictive for insert to authenticated
  with check (public.cr_is_owner());

create or replace function public.cr_guard_user_privileges()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not public.cr_is_owner() and (
    new.id is distinct from old.id or new.role is distinct from old.role
    or new.firm_id is distinct from old.firm_id
    or new.active is distinct from old.active
    or new.perm_overrides is distinct from old.perm_overrides
    or new.email is distinct from old.email
  ) then
    raise exception 'Only the owner may change account access or login identity.';
  end if;
  return new;
end $$;
revoke all on function public.cr_guard_user_privileges() from public;
drop trigger if exists cr_guard_user_privileges on public.app_users;
create trigger cr_guard_user_privileges before update on public.app_users
  for each row execute function public.cr_guard_user_privileges();

-- Two callable SECURITY DEFINER functions can bypass row policies. Number
-- minting must be pinned to the pilot firm, and the Motel 6 touch RPC must
-- refuse non-owner internal accounts. Firm portal users retain their existing
-- Motel permissions.
create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  if auth.role() <> 'service_role' and not public.is_internal() then
    raise exception 'Only internal staff may mint a lead number';
  end if;
  if auth.role() <> 'service_role' and not public.cr_is_owner()
     and p_firm is distinct from public.cr_inno_mva_firm_id() then
    raise exception 'This campaign is not available to staff.';
  end if;
  select coalesce(lead_prefix, 'CR') into pfx from public.firms where id = p_firm;
  if pfx is null then pfx := 'CR'; end if;
  nxt := nextval('public.global_lead_seq');
  return pfx || '-' || nxt::text;
end $$;

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.m6_log_touch(uuid,text,text,text,uuid,text)'::regprocedure);
  if position('if uid is null then' in definition) = 0 then
    raise exception 'Motel touch guard could not be installed; function changed. No policies were committed.';
  end if;
  definition := replace(definition, 'if uid is null then',
    'if public.is_internal() and not public.cr_is_owner() then
       raise exception ''Only the owner may work Motel 6 during the INNO MVA pilot.'';
     end if;
     if uid is null then');
  execute definition;
end $$;
commit;

-- 0116 LawRuler agent assignment (LOCAL; apply after 0115).
-- Restore the source assignee on existing INNO MVA files. Only a single active
-- exact display-name match may be assigned; preserve every manual assignment.
begin;

with active_names as (
  select lower(regexp_replace(trim(full_name), '[^a-zA-Z0-9@.]+', ' ', 'g')) as source_name,
         min(id::text)::uuid as user_id,
         count(*) as matches
  from public.app_users
  where active = true and role::text in ('agent', 'manager', 'admin', 'owner', 'qa')
    and nullif(trim(full_name), '') is not null
  group by 1
)
update public.leads l set assigned_agent = n.user_id
from active_names n
where n.matches = 1
  and l.assigned_agent is null and l.archived_at is null
  and l.campaign_id = public.cr_inno_mva_campaign_id()
  and l.firm_id = public.cr_inno_mva_firm_id()
  and lower(regexp_replace(trim(l.vendor_fields->>'assignee'), '[^a-zA-Z0-9@.]+', ' ', 'g')) = n.source_name;

commit;

-- 0117 INNO MVA intake handoff formats (LOCAL; apply after 0116).
-- The final INNO MVA handoff carries the same intake Q&A in its body, PDF
-- and CSV. Keep the existing manual/automatic delivery switch unchanged.
begin;

update public.campaigns
set attach_intake_pdf = true, attach_intake_csv = true
where id = public.cr_inno_mva_campaign_id()
  and firm_id = public.cr_inno_mva_firm_id();

commit;

-- 0118 Agreement correction and agent review (LOCAL; apply after 0117).
-- Signed originals remain evidence while a corrected copy is sent. The
-- correction is held from QA and firm delivery until supervisor resolution.
begin;

alter table public.esign_submissions
  add column if not exists replacement_requested_at timestamptz,
  add column if not exists replacement_requested_by uuid,
  add column if not exists replacement_reason text,
  add column if not exists replacement_of uuid references public.esign_submissions(id) on delete set null,
  add column if not exists agent_reviewed_at timestamptz,
  add column if not exists agent_reviewed_by uuid;

create index if not exists esign_submissions_replacement_review_idx
  on public.esign_submissions (lead_id, claim_id, replacement_requested_at)
  where replacement_requested_at is not null and voided_at is null;

commit;

-- 0119 DQ stays closed (apply after 0118).
-- Missing source reasons are data cleanup, never QA or a reason to call again.
-- Preserve the imported status key/reason history and all genuine sibling work.
begin;

update public.statuses
set label = 'DQ: reason missing', track = 'terminal', phase = 'terminal',
    tone = 'bad', qualify = 'disqualify', is_final = true,
    requires_esign = false, unlocks_firm = false, updated_at = now()
where key = 'external_dq_review';

update public.claims
set qualification = 'dq'
where status = 'external_dq_review'
  and qualification is distinct from 'dq';

with affected as (
  select l.id, l.firm_id
  from public.leads l
  where exists (
    select 1 from public.claims c
    where c.lead_id = l.id and c.firm_id = l.firm_id
      and c.status = 'external_dq_review'
  )
), flags as (
  select a.id,
    exists (
      select 1 from public.claims c join public.statuses s on s.key = c.status
      where c.lead_id = a.id and c.firm_id = a.firm_id
        and s.phase = 'in_qa' and s.qualify <> 'disqualify'
        and c.status not in ('wip', 'signed_wip')
    ) as qa_pending,
    exists (
      select 1 from public.claims c join public.statuses s on s.key = c.status
      where c.lead_id = a.id and c.firm_id = a.firm_id
        and s.phase = 'in_qa' and s.qualify <> 'disqualify'
        and c.status in ('wip', 'signed_wip')
    ) as wip_pending
  from affected a
)
update public.leads l
set qa_pending = f.qa_pending, wip_pending = f.wip_pending,
    qa_entered_at = case when f.qa_pending or f.wip_pending then l.qa_entered_at else null end
from flags f
where l.id = f.id;

commit;

-- 0120 Secure identity capture (apply after 0119).
-- Full SSN is encrypted by Supabase Vault; public metadata carries no SSN value.
-- RPCs are service-role only; callers must first resolve the exact matter with RLS.
begin;

do $$
begin
  if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is required for secure identity storage.';
  end if;
end $$;

create table if not exists public.lead_identity_secrets (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  firm_id uuid not null references public.firms(id),
  vault_secret_id uuid not null unique references vault.secrets(id),
  mode text not null check (mode in ('full', 'last4')),
  version integer not null check (version > 0),
  saved_at timestamptz not null default now(),
  saved_by uuid references public.app_users(id) on delete set null
);
alter table public.lead_identity_secrets enable row level security;
revoke all on public.lead_identity_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.lead_identity_secrets to service_role;

-- Existing firm transfers update the lead and its related rows atomically, but
-- do not yet transfer this private identity association. Block the switch until
-- that transfer path explicitly handles it; never silently strand saved SSN.
create or replace function public.cr_guard_identity_firm_move()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.firm_id is distinct from old.firm_id and exists (
    select 1 from public.lead_identity_secrets i where i.lead_id = old.id
  ) then
    raise exception using errcode = '23514', message = 'This file has saved identity information. Secure identity transfer is required before changing firms.';
  end if;
  return new;
end $$;
revoke all on function public.cr_guard_identity_firm_move() from public, anon, authenticated;
drop trigger if exists cr_guard_identity_firm_move on public.leads;
create trigger cr_guard_identity_firm_move before update of firm_id on public.leads
for each row execute function public.cr_guard_identity_firm_move();

create or replace function public.cr_identity_metadata(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare saved public.lead_identity_secrets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if not exists (
    select 1 from public.leads l join public.claims c on c.lead_id = l.id and c.firm_id = l.firm_id
    where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null and c.id = p_claim_id
  ) then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id;
  if not found then return jsonb_build_object('saved', false, 'mode', null, 'version', 0, 'saved_at', null); end if;
  if saved.firm_id is distinct from p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  return jsonb_build_object('saved', true, 'mode', saved.mode, 'version', saved.version, 'saved_at', saved.saved_at);
end $$;

create or replace function public.cr_save_identity(
  p_lead_id uuid, p_claim_id uuid, p_firm_id uuid, p_ssn text,
  p_mode text, p_expected_version integer, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  saved public.lead_identity_secrets%rowtype;
  secret_id uuid;
  next_version integer;
  stamp timestamptz := now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_mode is null
     or p_mode not in ('full', 'last4') or p_ssn is null
     or (p_mode = 'full' and p_ssn !~ '^[0-9]{9}$')
     or (p_mode = 'last4' and p_ssn !~ '^[0-9]{4}$') then
    raise exception using errcode = '22023', message = 'Invalid identity input.';
  end if;
  if not exists (
    select 1 from public.app_users u where u.id = p_actor_id and u.active = true
      and u.role::text in ('owner', 'admin', 'manager', 'agent', 'qa')
  ) then raise exception using errcode = '42501', message = 'Active staff required.'; end if;
  -- Lock the lead even on first capture: two simultaneous version-zero saves
  -- cannot create orphan Vault secrets or overwrite one another.
  perform 1 from public.leads l
   where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null
     and exists (select 1 from public.claims c where c.id = p_claim_id and c.lead_id = l.id and c.firm_id = l.firm_id)
   for update;
  if not found then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id for update;
  if found and saved.firm_id <> p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  if coalesce(saved.version, 0) <> p_expected_version then
    raise exception using errcode = '40001', message = 'Identity version changed.';
  end if;
  -- Selecting last-four mode must never silently destroy an already captured
  -- full SSN. Correcting an existing full SSN requires a complete replacement.
  if saved.mode = 'full' and p_mode = 'last4' then
    raise exception using errcode = '40001', message = 'Full identity cannot be reduced to last four.';
  end if;
  next_version := coalesce(saved.version, 0) + 1;
  if saved.vault_secret_id is null then
    secret_id := vault.create_secret(p_ssn, 'claimreach_identity_' || p_lead_id::text, 'Private claimant identity');
    insert into public.lead_identity_secrets (lead_id, firm_id, vault_secret_id, mode, version, saved_at, saved_by)
    values (p_lead_id, p_firm_id, secret_id, p_mode, next_version, stamp, p_actor_id);
  else
    perform vault.update_secret(saved.vault_secret_id, p_ssn);
    update public.lead_identity_secrets set mode = p_mode, version = next_version, saved_at = stamp, saved_by = p_actor_id
      where lead_id = p_lead_id and firm_id = p_firm_id;
  end if;
  update public.leads set ssn_last4 = right(p_ssn, 4) where id = p_lead_id and firm_id = p_firm_id;
  -- Audit belongs in the same transaction and includes no value, last4 or hash.
  insert into public.lead_activity (firm_id, lead_id, kind, actor, body, meta)
  values (p_firm_id, p_lead_id, 'system', p_actor_id, 'Secure identity information saved.',
    jsonb_build_object('event', 'secure_identity_saved', 'claim_id', p_claim_id, 'mode', p_mode, 'version', next_version));
  return jsonb_build_object('saved', true, 'mode', p_mode, 'version', next_version, 'saved_at', stamp);
end $$;

create or replace function public.cr_read_identity_for_signing(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare saved public.lead_identity_secrets%rowtype; identity_value text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if not exists (
    select 1 from public.leads l join public.claims c on c.lead_id = l.id and c.firm_id = l.firm_id
    where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null and c.id = p_claim_id
  ) then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id;
  if not found then return null; end if;
  if saved.firm_id is distinct from p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  select s.decrypted_secret into identity_value from vault.decrypted_secrets s where s.id = saved.vault_secret_id;
  if identity_value is null then raise exception using errcode = 'P0001', message = 'Secure identity unavailable.'; end if;
  return jsonb_build_object('ssn', identity_value, 'mode', saved.mode, 'version', saved.version);
end $$;

revoke all on function public.cr_identity_metadata(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cr_save_identity(uuid, uuid, uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.cr_read_identity_for_signing(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cr_identity_metadata(uuid, uuid, uuid) to service_role;
grant execute on function public.cr_save_identity(uuid, uuid, uuid, text, text, integer, uuid) to service_role;
grant execute on function public.cr_read_identity_for_signing(uuid, uuid, uuid) to service_role;

commit;


-- 0121 Pilot database boundary (apply standalone; replaces unapplied 0115).
-- Production: apply supabase/migrations/0121_pilot_database_boundary.sql only.
-- The INNO MVA pilot is a database boundary, not only navigation filtering.
-- Additive replacement for the unapplied 0115. No campaign data, user roles,
-- templates, signed documents or tenant assignments are changed.
-- Existing permissive policies still govern owner, firm and partner access.
begin;

create or replace function public.cr_is_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users where id = auth.uid()
    and active = true and role::text = 'owner');
$$;

-- Includes disabled staff: deactivation must not turn an internal account into
-- an external account that bypasses the pilot restriction.
create or replace function public.cr_is_internal_account()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users where id = auth.uid()
    and role::text in ('owner','admin','manager','agent','qa'));
$$;

create or replace function public.cr_inno_mva_campaign_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then (array_agg(c.id))[1] else null end
  from public.campaigns c join public.firms f on f.id = c.firm_id
  where c.name = 'INNO MVA' and c.case_type = 'mva' and c.active = true and f.slug = 'tmp';
$$;
create or replace function public.cr_inno_mva_firm_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select firm_id from public.campaigns where id = public.cr_inno_mva_campaign_id();
$$;
create or replace function public.cr_can_access_inno_mva_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.leads where id = p_lead_id and archived_at is null
    and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()
    and case_type = 'mva');
$$;
create or replace function public.cr_can_access_inno_mva_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.claims where id = p_claim_id and claim_type = 'mva'
    and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()
    and public.cr_can_access_inno_mva_lead(lead_id));
$$;
create or replace function public.cr_claim_matches_lead(p_claim_id uuid, p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.claims where id = p_claim_id and lead_id = p_lead_id
    and public.cr_can_access_inno_mva_claim(id));
$$;
create or replace function public.cr_pilot_legacy_matter_allowed(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  -- Count ALL siblings, including claims hidden from the caller by RLS.
  select count(*)=1 and coalesce(bool_and(public.cr_can_access_inno_mva_claim(id)),false)
  from public.claims where lead_id=p_lead_id;
$$;
create or replace function public.cr_pilot_signable_allowed(p_lead_id uuid, p_audit jsonb)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare claim_text text := p_audit #>> '{emergency,claim_id}';
        campaign_text text := p_audit #>> '{emergency,campaign_id}';
begin
  if not public.cr_can_access_inno_mva_lead(p_lead_id) then return false; end if;
  if campaign_text is not null and campaign_text is distinct from public.cr_inno_mva_campaign_id()::text then return false; end if;
  if claim_text is null then return public.cr_pilot_legacy_matter_allowed(p_lead_id); end if;
  if claim_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.cr_claim_matches_lead(claim_text::uuid,p_lead_id);
end $$;

do $$
declare fn regprocedure;
begin
  foreach fn in array array[
    'public.cr_is_owner()'::regprocedure, 'public.cr_is_internal_account()'::regprocedure,
    'public.cr_inno_mva_campaign_id()'::regprocedure, 'public.cr_inno_mva_firm_id()'::regprocedure,
    'public.cr_can_access_inno_mva_lead(uuid)'::regprocedure,
    'public.cr_can_access_inno_mva_claim(uuid)'::regprocedure,
    'public.cr_claim_matches_lead(uuid,uuid)'::regprocedure,
    'public.cr_pilot_legacy_matter_allowed(uuid)'::regprocedure,
    'public.cr_pilot_signable_allowed(uuid,jsonb)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  if public.cr_inno_mva_campaign_id() is null then
    raise exception 'Expected exactly one active TMP INNO MVA campaign. No boundary changes committed.';
  end if;
end $$;

-- Restrictive policies AND with existing policies. Never add another broad
-- permissive grant. Include write-only tables and reject unprotected tables.
do $$
declare t record; predicate text; bypass text; scoped_to_file boolean; col_type text;
begin
  bypass := 'not public.cr_is_internal_account() or public.cr_is_owner()';
  for t in
    select c.oid, c.relname as table_name, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
  loop
    if not t.relrowsecurity then
      raise exception 'Exposed table % has no RLS. Review before applying this boundary.', t.table_name;
    end if;
    predicate := 'false';
    scoped_to_file := false;
    if t.table_name = 'leads' then
      predicate := 'archived_at is null and case_type = ''mva'' and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'claims' then
      predicate := 'claim_type = ''mva'' and public.cr_can_access_inno_mva_lead(lead_id) and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'campaigns' then
      predicate := 'id = public.cr_inno_mva_campaign_id()';
    elsif t.table_name = 'firms' then
      predicate := 'id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'app_users' then
      predicate := 'id = auth.uid() or (role::text = ''owner'' and active = true)';
    elsif t.table_name = 'routing_rules' then
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and (case_type = ''mva'' or case_type is null)';
    elsif t.table_name = 'intake_forms' then
      -- Keep the published master form used by the live app. Other case types,
      -- other firms' forms and draft forms are not pilot data.
      predicate := 'claim_type = ''mva'' and status = ''published'' and (firm_id is null or firm_id = public.cr_inno_mva_firm_id()) and (campaign_id is null or campaign_id = public.cr_inno_mva_campaign_id())';
    elsif t.table_name = 'signable_documents' then
      -- This legacy table stores emergency matter identity in audit JSON.
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and public.cr_pilot_signable_allowed(lead_id,audit)';
    elsif t.table_name = 'case_type_registry' then
      predicate := 'key = ''mva''';
    elsif t.table_name in ('statuses','dq_reasons','call_dispo_reasons') then
      predicate := 'true';
    else
      select data_type into col_type from information_schema.columns
        where table_schema = 'public' and table_name = t.table_name and column_name = 'lead_id';
      if col_type = 'uuid' then
        scoped_to_file := true;
        predicate := 'public.cr_can_access_inno_mva_lead(lead_id)';
        if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='claim_id' and data_type='uuid') then
          if t.table_name in ('esign_submissions','retainers','case_documents','firm_deliveries','intake_calls','qa_reviews','grievous_reviews','report_cards','audit_log') then
            predicate := predicate || ' and ((claim_id is null and public.cr_pilot_legacy_matter_allowed(lead_id)) or public.cr_claim_matches_lead(claim_id,lead_id))';
          else
            -- Contacts, communications and ordinary notes are intentionally
            -- lead-level. A stamped claim must still match the pilot matter.
            predicate := predicate || ' and (claim_id is null or public.cr_claim_matches_lead(claim_id,lead_id))';
          end if;
        end if;
      elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='claim_id' and data_type='uuid') then
        scoped_to_file := true;
        predicate := 'public.cr_can_access_inno_mva_claim(claim_id)';
      elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='campaign_id' and data_type='uuid') then
        predicate := 'campaign_id = public.cr_inno_mva_campaign_id()';
      end if;
      if predicate <> 'false' and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='firm_id' and data_type='uuid') then
        predicate := predicate || ' and (firm_id is null or firm_id = public.cr_inno_mva_firm_id())';
      end if;
      if scoped_to_file and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='campaign_id' and data_type='uuid') then
        -- Legacy rows may lack this redundant column. A non-null wrong
        -- campaign is never accepted, even when the lead points at INNO.
        predicate := predicate || ' and (campaign_id is null or campaign_id = public.cr_inno_mva_campaign_id())';
      end if;
    end if;
    execute format('drop policy if exists cr_inno_mva_staff_wall on public.%I',t.table_name);
    execute format('create policy cr_inno_mva_staff_wall on public.%I as restrictive for all to authenticated using (%s or (public.is_internal() and (%s))) with check (%s or (public.is_internal() and (%s)))',t.table_name,bypass,predicate,bypass,predicate);
    execute format('drop policy if exists cr_pilot_no_hard_delete on public.%I',t.table_name);
    execute format('create policy cr_pilot_no_hard_delete on public.%I as restrictive for delete to authenticated using (%s)',t.table_name,bypass);

    -- Session clients need these intake/contact/note operations. Provider
    -- evidence, PDF paths, account settings and templates are server-managed.
    if t.table_name not in ('leads','claims','intake_calls','communications','notes','lead_notes','claim_notes','lead_activity','call_logs','case_documents','contact_points','call_schedule','notifications') then
      execute format('drop policy if exists cr_pilot_config_insert on public.%I',t.table_name);
      execute format('drop policy if exists cr_pilot_config_update on public.%I',t.table_name);
      execute format('create policy cr_pilot_config_insert on public.%I as restrictive for insert to authenticated with check (%s)',t.table_name,bypass);
      execute format('create policy cr_pilot_config_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',t.table_name,bypass,bypass);
    end if;
    -- TRUNCATE ignores row security entirely. No application session needs it.
    execute format('revoke truncate on public.%I from public, anon, authenticated',t.table_name);
  end loop;
end $$;

-- Account-management permission overrides cannot create an owner, delete an
-- existing identity, or change an internal user into a firm to evade the wall.
drop policy if exists cr_pilot_user_insert on public.app_users;
create policy cr_pilot_user_insert on public.app_users as restrictive for insert to authenticated with check (public.cr_is_owner());
drop policy if exists cr_pilot_user_delete on public.app_users;
create policy cr_pilot_user_delete on public.app_users as restrictive for delete to authenticated using (public.cr_is_owner());
drop policy if exists cr_pilot_user_update on public.app_users;
create policy cr_pilot_user_update on public.app_users as restrictive for update to authenticated
  using (public.cr_is_owner() or (not public.cr_is_internal_account() and id=auth.uid()))
  with check (public.cr_is_owner() or (not public.cr_is_internal_account() and id=auth.uid()));
create or replace function public.cr_guard_user_privileges()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not public.cr_is_owner() and (
    new.id is distinct from old.id or new.role is distinct from old.role
    or new.firm_id is distinct from old.firm_id or new.active is distinct from old.active
    or new.perm_overrides is distinct from old.perm_overrides or new.email is distinct from old.email
  ) then raise exception 'Only the owner may change account access or login identity.'; end if;
  return new;
end $$;
revoke all on function public.cr_guard_user_privileges() from public, anon, authenticated;
drop trigger if exists cr_guard_user_privileges on public.app_users;
create trigger cr_guard_user_privileges before update on public.app_users for each row execute function public.cr_guard_user_privileges();

-- A valid old row and valid new row can still belong to different files.
-- Staff may correct answers/status, but cannot transplant the matter (and its
-- signed evidence) to another claimant, even inside the same pilot campaign.
create or replace function public.cr_guard_claim_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and public.cr_is_internal_account() and not public.cr_is_owner() and (
    new.id is distinct from old.id or new.lead_id is distinct from old.lead_id
    or new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id
    or new.claim_type is distinct from old.claim_type
  ) then raise exception 'Only the owner may change a matter identity or file association.'; end if;
  return new;
end $$;
revoke all on function public.cr_guard_claim_identity() from public, anon, authenticated;
drop trigger if exists cr_guard_claim_identity on public.claims;
create trigger cr_guard_claim_identity before update on public.claims for each row execute function public.cr_guard_claim_identity();

-- Keep firm first-login provisioning, but never rewrite an existing account.
-- The allowlist cannot be used to provision an internal role through this RPC.
create or replace function public.provision_self_from_firm_access()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); em text; account_type text;
begin
  if uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 121));
  if exists (select 1 from public.app_users where id = uid) then return false; end if;
  select email, raw_app_meta_data->>'account_type' into em, account_type from auth.users where id = uid;
  if account_type = 'partner' then return false; end if;
  if not exists (select 1 from public.firm_access where lower(trim(email)) = lower(trim(em)) and role::text = 'firm') then return false; end if;
  -- No upsert: concurrent owner creation cannot be overwritten by provisioning.
  insert into public.app_users (id, firm_id, role, full_name, email)
    select uid, f.id, fa.role, coalesce(nullif(trim(fa.full_name),''),lower(trim(em))),lower(trim(em))
    from public.firm_access fa join public.firms f on f.slug = fa.firm_slug
    where lower(trim(fa.email)) = lower(trim(em)) and fa.role::text = 'firm'
    on conflict (id) do nothing;
  return found;
end $$;
revoke all on function public.provision_self_from_firm_access() from public, anon;
grant execute on function public.provision_self_from_firm_access() to authenticated, service_role;

create or replace function public.is_m6_landing_email(p_email text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (public.cr_is_owner() or exists (select 1 from auth.users
    where id=auth.uid() and lower(trim(email))=lower(trim(p_email))))
    and exists (select 1 from public.retention_alert_recipients
      where campaign='motel6' and active=true and email=lower(trim(p_email)));
$$;
revoke all on function public.is_m6_landing_email(text) from public, anon;
grant execute on function public.is_m6_landing_email(text) to authenticated, service_role;

create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare nxt bigint; pfx text;
begin
  if auth.role() is distinct from 'service_role' then
    if not public.is_internal() then raise exception 'Only internal staff may mint a lead number'; end if;
    if not public.cr_is_owner() and p_firm is distinct from public.cr_inno_mva_firm_id() then
      raise exception 'This campaign is not available to staff.';
    end if;
  end if;
  select coalesce(lead_prefix,'CR') into pfx from public.firms where id=p_firm;
  nxt := nextval('public.global_lead_seq');
  return coalesce(pfx,'CR') || '-' || nxt::text;
end $$;
revoke all on function public.mint_lead_no(uuid) from public, anon;
grant execute on function public.mint_lead_no(uuid) to authenticated, service_role;

-- Preserve the existing Motel 6 function body and its firm permission checks.
-- Abort atomically if its reviewed insertion point changed; never silently
-- skip a SECURITY DEFINER bypass. This also safely upgrades an applied 0115.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.m6_log_touch(uuid,text,text,text,uuid,text)'::regprocedure);
  if position('cr_is_internal_account()' in definition)=0 then
    if (length(definition)-length(replace(definition,'if uid is null then','')))/length('if uid is null then') <> 1 then
      raise exception 'Motel touch function changed; review before applying boundary.';
    end if;
    definition := replace(definition,'if uid is null then',
      'if public.cr_is_internal_account() and not public.cr_is_owner() then
         raise exception ''Only the owner may work Motel 6 during the INNO MVA pilot.'';
       end if;
       if uid is null then');
    execute definition;
  end if;
end $$;
revoke all on function public.m6_log_touch(uuid,text,text,text,uuid,text) from public, anon;
grant execute on function public.m6_log_touch(uuid,text,text,text,uuid,text) to authenticated, service_role;

-- Existing invoker views inherit the table wall. A definer view/materialized
-- view would bypass it: abort for review rather than unexpectedly change it.
do $$
declare v record;
begin
  for v in select c.relname,c.relkind,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('v','m') and has_table_privilege('authenticated',c.oid,'SELECT')
  loop
    if v.relkind='m' or not coalesce(v.reloptions @> array['security_invoker=true'],false) then
      raise exception 'Exposed view % can bypass RLS; review before applying boundary.',v.relname;
    end if;
  end loop;
  if to_regclass('storage.buckets') is not null then
    if exists (select 1 from storage.buckets where id in ('case-docs','retainer-pdfs','signed-docs') and public=true) then
      raise exception 'Claimant document bucket is public; review before applying boundary.';
    end if;
  end if;
end $$;

-- Storage downloads use scoped, short-lived URLs from the server. Supabase
-- owns storage.objects; the project migration role cannot alter its policies
-- or ownership. Verify its existing default-deny boundary without changing it.
do $$
begin
  if to_regclass('storage.objects') is not null then
    if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass)
       or exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
         and permissive='PERMISSIVE' and roles && array['public','anon','authenticated']::name[]) then
      raise exception 'Storage object access changed; review policies before applying boundary.';
    end if;
  end if;
end $$;
commit;


-- 0122_durable_esign_send.sql
-- Reserve a signer before creating a passenger file or touching DocuSeal.
-- No elapsed-time cleanup: pending/uncertain attempts require reconciliation.
begin;

create table public.esign_send_attempts (
  id uuid primary key default gen_random_uuid(),
  parent_lead_id uuid not null references public.leads(id),
  parent_claim_id uuid not null references public.claims(id),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  actor_id uuid not null,
  pax_key text not null default '' check (pax_key='' or pax_key ~ '^[A-Za-z0-9_-]{1,40}$'),
  pax_index integer check (pax_index is null or pax_index>=0),
  target_lead_id uuid references public.leads(id),
  target_claim_id uuid references public.claims(id),
  expected_submission_id uuid references public.esign_submissions(id),
  expected_status text,
  emergency_document_id uuid references public.signable_documents(id),
  template_key text,
  template_id text,
  via text check (via in ('Text','Email')),
  send_context jsonb not null default '{}' check (jsonb_typeof(send_context)='object'),
  state text not null default 'reserved' check (state in ('reserved','provider_pending','uncertain','linked','rejected')),
  bound_at timestamptz,
  provider_started_at timestamptz,
  linked_submission_id uuid unique references public.esign_submissions(id),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_code text check (resolution_code is null or resolution_code in ('provider_linked','provider_rejected','pre_provider_abort','provider_expired')),
  reconciled_provider_submission_id text,
  verified_expired_at timestamptz,
  check ((target_lead_id is null) = (target_claim_id is null)),
  check ((state='linked') = (linked_submission_id is not null))
);
create unique index esign_send_attempts_one_pending_signer on public.esign_send_attempts(parent_claim_id,pax_key)
  where state in ('reserved','provider_pending','uncertain');
create unique index esign_send_attempts_one_pending_target on public.esign_send_attempts(target_claim_id)
  where target_claim_id is not null and state in ('reserved','provider_pending','uncertain');
create index esign_send_attempts_target_history on public.esign_send_attempts(target_claim_id,created_at desc);
alter table public.esign_send_attempts enable row level security;
revoke all on public.esign_send_attempts from public,anon,authenticated,service_role;
grant select on public.esign_send_attempts to service_role;

-- Internal checks take the authenticated actor selected by the trusted route,
-- not JWT metadata or a role supplied in the request body. Entry RPCs below are
-- executable only by service_role; the browser cannot impersonate this actor.
create function public.cr_esign_attempt_scope(p_actor_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims%rowtype; l public.leads%rowtype; u public.app_users%rowtype;
begin
  select * into u from public.app_users where id=p_actor_id;
  if not found or u.active is distinct from true or u.role not in ('owner','admin','manager','agent','qa') then
    raise exception 'An active intake user is required.' using errcode='42501';
  end if;
  select * into c from public.claims where id=p_claim_id;
  if not found then raise exception 'Signing matter is unavailable.'; end if;
  select * into l from public.leads where id=c.lead_id;
  if not found or l.archived_at is not null or c.firm_id is distinct from l.firm_id or c.campaign_id is null
    or not exists(select 1 from public.campaigns where id=c.campaign_id and firm_id=c.firm_id and active) then
    raise exception 'Signing matter scope changed. Refresh before sending.';
  end if;
  if u.role<>'owner' and (c.campaign_id is distinct from public.cr_inno_mva_campaign_id()
    or c.firm_id is distinct from public.cr_inno_mva_firm_id() or c.claim_type is distinct from 'mva') then
    raise exception 'This signing matter is outside the intake pilot.' using errcode='42501';
  end if;
  return jsonb_build_object('lead_id',l.id,'claim_id',c.id,'firm_id',c.firm_id,'campaign_id',c.campaign_id,'external_id',l.external_id,'status',c.status);
end $$;

create function public.cr_esign_attempt_latest(p_lead_id uuid,p_claim_id uuid,p_campaign_id uuid)
returns public.esign_submissions language plpgsql security definer set search_path='' as $$
declare r public.esign_submissions%rowtype; n integer; passenger boolean;
begin
  select count(*) into n from public.claims where lead_id=p_lead_id;
  select coalesce(external_id,'') ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' into passenger from public.leads where id=p_lead_id;
  if n<>1 and exists(select 1 from public.esign_submissions where lead_id=p_lead_id and claim_id is null
    and voided_at is null and status in ('sending','sent','opened','signed','completed','uncertain')
    and (campaign_id is null or campaign_id=p_campaign_id)) then
    raise exception 'An unassigned legacy agreement needs owner review before another send.';
  end if;
  select * into r from public.esign_submissions where lead_id=p_lead_id
    and (claim_id=p_claim_id or (claim_id is null and n=1 and (campaign_id is null or campaign_id=p_campaign_id)))
    and (passenger or pax_index is null)
    order by created_at desc,id desc limit 1;
  return r;
end $$;

create function public.cr_esign_attempt_emergency(p_document_id uuid,p_lead_id uuid,p_claim_id uuid,p_firm_id uuid,p_campaign_id uuid,p_primary_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.signable_documents d where d.id=p_document_id and d.lead_id=p_lead_id and d.firm_id=p_firm_id
    and d.status='signed' and d.audit->'emergency'->>'claim_id'=p_claim_id::text
    and (d.audit->'emergency'->>'campaign_id' is null or d.audit->'emergency'->>'campaign_id'=p_campaign_id::text)
    and d.id=(select e.id from public.signable_documents e where e.lead_id=p_lead_id and e.audit->'emergency'->>'claim_id'=p_claim_id::text order by e.created_at desc,e.id desc limit 1)
    and (p_primary_id is null or d.created_at>(select created_at from public.esign_submissions where id=p_primary_id)));
$$;

create function public.cr_reserve_esign_send(p_parent_claim_id uuid,p_actor_id uuid,p_pax_key text default null,p_pax_index integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; parent_scope jsonb; parent_claim uuid:=p_parent_claim_id; parent_lead uuid; key text:=coalesce(p_pax_key,'');
  ext text; candidates uuid[]; a public.esign_send_attempts%rowtype;
begin
  scope:=public.cr_esign_attempt_scope(p_actor_id,p_parent_claim_id);
  parent_lead:=(scope->>'lead_id')::uuid; ext:=coalesce(scope->>'external_id','');
  if key<>'' and (key !~ '^[A-Za-z0-9_-]{1,40}$' or p_pax_index is null or p_pax_index<0) then raise exception 'Invalid passenger signing key.'; end if;
  if key='' and p_pax_index is not null then raise exception 'Passenger signing key is required.'; end if;
  -- Opening a passenger directly and opening it from its parent use one mutex.
  if ext ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' then
    if key<>'' then raise exception 'Open this passenger directly before adding another signer.'; end if;
    parent_lead:=split_part(ext,':pax:',1)::uuid; key:=split_part(ext,':pax:',2);
    select array_agg(id) into candidates from public.claims where lead_id=parent_lead
      and firm_id=(scope->>'firm_id')::uuid and campaign_id=(scope->>'campaign_id')::uuid;
    if coalesce(array_length(candidates,1),0)<>1 then raise exception 'Passenger parent matter is ambiguous. Ask the owner to review it.'; end if;
    parent_claim:=candidates[1];
  end if;
  -- The legacy passenger external key contains lead+person, not claim. Two
  -- same-campaign matters cannot safely create separate files with that key.
  if key<>'' and 1<>(select count(*) from public.claims where lead_id=parent_lead and campaign_id=(scope->>'campaign_id')::uuid and firm_id=(scope->>'firm_id')::uuid) then
    raise exception 'Passenger parent matter is ambiguous. Ask the owner to review it.';
  end if;
  perform 1 from public.claims where id=parent_claim for update;
  parent_scope:=public.cr_esign_attempt_scope(p_actor_id,parent_claim);
  if parent_scope->>'lead_id' is distinct from parent_lead::text or parent_scope->>'firm_id' is distinct from scope->>'firm_id'
    or parent_scope->>'campaign_id' is distinct from scope->>'campaign_id' then raise exception 'Passenger parent scope changed.'; end if;
  if exists(select 1 from public.esign_send_attempts where parent_claim_id=parent_claim and pax_key=key and state in ('reserved','provider_pending','uncertain')) then
    raise exception 'Agreement send already pending. Check its status; an owner must reconcile an uncertain send.' using errcode='55000';
  end if;
  insert into public.esign_send_attempts(parent_lead_id,parent_claim_id,firm_id,campaign_id,actor_id,pax_key,pax_index)
    values(parent_lead,parent_claim,(scope->>'firm_id')::uuid,(scope->>'campaign_id')::uuid,p_actor_id,key,p_pax_index) returning * into a;
  return to_jsonb(a)||jsonb_build_object('acquired',true);
end $$;

create function public.cr_bind_esign_send(p_attempt_id uuid,p_target_lead_id uuid,p_target_claim_id uuid,p_expected_submission_id uuid,p_expected_status text,p_template_key text,p_template_id text,p_via text,p_send_context jsonb default '{}',p_emergency_document_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype; k text;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state<>'reserved' or a.bound_at is not null then raise exception 'Signing reservation is not available for binding.'; end if;
  perform 1 from public.claims where id=p_target_claim_id for update;
  scope:=public.cr_esign_attempt_scope(a.actor_id,p_target_claim_id);
  parent_scope:=public.cr_esign_attempt_scope(a.actor_id,a.parent_claim_id);
  if scope->>'lead_id' is distinct from p_target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text then raise exception 'Signing reservation scope changed.'; end if;
  if (a.pax_key='' and (p_target_claim_id<>a.parent_claim_id or p_target_lead_id<>a.parent_lead_id))
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key) then
    raise exception 'Signing reservation belongs to a different signer.';
  end if;
  old:=public.cr_esign_attempt_latest(p_target_lead_id,p_target_claim_id,a.campaign_id);
  if old.id is distinct from p_expected_submission_id or old.status is distinct from p_expected_status then
    raise exception 'The current agreement changed. Refresh before sending.' using errcode='55000';
  end if;
  if coalesce(length(trim(p_template_key)),0)=0 or coalesce(length(trim(p_template_id)),0)=0 or p_via not in ('Text','Email') or p_via is null then
    raise exception 'A template and delivery channel are required.';
  end if;
  if scope->>'status' in ('delivered','retained') then raise exception 'This matter was already delivered. Owner review is required.'; end if;
  if p_emergency_document_id is not null and not public.cr_esign_attempt_emergency(p_emergency_document_id,p_target_lead_id,p_target_claim_id,a.firm_id,a.campaign_id,p_expected_submission_id) then
    raise exception 'The signed emergency agreement is no longer current for this matter.';
  end if;
  if jsonb_typeof(p_send_context) is distinct from 'object' then raise exception 'Invalid signing context.'; end if;
  for k in select jsonb_object_keys(p_send_context) loop
    if k<>all(array['signer_name','injured_name','phone','email','call_id','pax_index','replacement_of']) then raise exception 'Unsupported signing context field.'; end if;
    if jsonb_typeof(p_send_context->k) not in ('null','string','number') then raise exception 'Invalid signing context value.'; end if;
    if length(p_send_context->>k)>320 then raise exception 'Signing context value is too long.'; end if;
  end loop;
  if nullif(p_send_context->>'replacement_of','')::uuid is not null and nullif(p_send_context->>'replacement_of','')::uuid is distinct from p_expected_submission_id then raise exception 'Replacement context does not match the current agreement.'; end if;
  update public.esign_send_attempts set target_lead_id=p_target_lead_id,target_claim_id=p_target_claim_id,
    expected_submission_id=p_expected_submission_id,expected_status=p_expected_status,emergency_document_id=p_emergency_document_id,template_key=p_template_key,template_id=p_template_id,via=p_via,send_context=p_send_context,bound_at=now(),updated_at=now()
    where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_mark_esign_send_pending(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state<>'reserved' or a.bound_at is null then raise exception 'Signing reservation cannot start another provider request.'; end if;
  perform 1 from public.claims where id=a.target_claim_id for update;
  scope:=public.cr_esign_attempt_scope(a.actor_id,a.target_claim_id); parent_scope:=public.cr_esign_attempt_scope(a.actor_id,a.parent_claim_id);
  if scope->>'lead_id' is distinct from a.target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key)
    or scope->>'status' in ('delivered','retained') then raise exception 'Signing reservation scope changed before sending.'; end if;
  old:=public.cr_esign_attempt_latest(a.target_lead_id,a.target_claim_id,a.campaign_id);
  -- An original may have been safely expired or held by the correction flow,
  -- but no different agreement may appear between binding and provider create.
  if old.id is distinct from a.expected_submission_id then raise exception 'The current agreement changed before sending.'; end if;
  if a.emergency_document_id is not null and not public.cr_esign_attempt_emergency(a.emergency_document_id,a.target_lead_id,a.target_claim_id,a.firm_id,a.campaign_id,a.expected_submission_id) then
    raise exception 'The signed emergency agreement changed before sending.';
  end if;
  if a.emergency_document_id is null and old.id is not null and old.voided_at is null and old.status not in ('voided','expired','declined','failed') then
    if old.status='completed' or old.completed_at is not null or not(old.signed_at is not null or old.status='signed')
      or old.agent_reviewed_at is null or old.replacement_requested_at is null then
      raise exception 'The original agreement has not been cleared for correction.';
    end if;
  end if;
  update public.esign_send_attempts set state='provider_pending',provider_started_at=now(),updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_hold_esign_send(p_attempt_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z_]{1,64}$' then raise exception 'Use a non-sensitive error code.'; end if;
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or not(a.state in ('provider_pending','uncertain') or (a.state='reserved' and p_error_code in ('prior_expiry_unconfirmed','prior_retirement_failed','passenger_creation_unconfirmed'))) then raise exception 'This attempt cannot be marked uncertain.'; end if;
  update public.esign_send_attempts set state='uncertain',error_code=p_error_code,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_reject_esign_send(p_attempt_id uuid,p_error_code text,p_provider_rejected boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Signing reservation is unavailable.'; end if;
  if ((a.state='reserved' and p_error_code='pre_provider_abort' and p_provider_rejected is false)
    or (a.state='provider_pending' and p_provider_rejected is true and p_error_code='definitive_provider_rejection')) is not true then
    raise exception 'An uncertain send cannot be released for retry.';
  end if;
  update public.esign_send_attempts set state='rejected',error_code=p_error_code,resolved_at=now(),resolved_by=a.actor_id,
    resolution_code=case when p_provider_rejected then 'provider_rejected' else 'pre_provider_abort' end,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_finalize_esign_send(p_attempt_id uuid,p_submission jsonb,p_reconciled_by uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; r public.esign_submissions%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype; provider_id text; k text; call_id uuid; replacement_id uuid;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Signing reservation is unavailable.'; end if;
  if jsonb_typeof(p_submission) is distinct from 'object' then raise exception 'A provider-backed signing record is required.'; end if;
  if p_reconciled_by is not null and not exists(select 1 from public.app_users where id=p_reconciled_by and active and role='owner') then raise exception 'Only an active owner can reconcile a send.' using errcode='42501'; end if;
  for k in select jsonb_object_keys(p_submission) loop
    if k<>all(array['firm_id','lead_id','call_id','campaign_id','provider','template_key','template_id','claim_id','submission_id','client_submitter_id','intake_submitter_id','signer_name','injured_name','phone','email','via','pax_index','status','sign_url','sent_by','replacement_of']) then
      raise exception 'Unsupported signing record field.';
    end if;
  end loop;
  p_submission:=a.send_context||p_submission;
  provider_id:=nullif(trim(p_submission->>'submission_id'),'');
  if provider_id is null or nullif(trim(p_submission->>'client_submitter_id'),'') is null then raise exception 'Provider submission and client signer IDs are required.'; end if;
  if a.state='linked' then
    select * into r from public.esign_submissions where id=a.linked_submission_id;
    if r.submission_id is distinct from provider_id then raise exception 'This attempt is already linked to another provider submission.'; end if;
    return jsonb_build_object('id',r.id,'attempt_id',a.id);
  end if;
  if a.state not in ('provider_pending','uncertain') or a.bound_at is null or a.provider_started_at is null then raise exception 'This attempt has no pending provider request.'; end if;
  -- Scope changes after provider create hold the attempt, rather than attaching
  -- a signature to a reassigned file. The failure leaves its mutex in place.
  scope:=public.cr_esign_attempt_scope(coalesce(p_reconciled_by,a.actor_id),a.target_claim_id);
  parent_scope:=public.cr_esign_attempt_scope(coalesce(p_reconciled_by,a.actor_id),a.parent_claim_id);
  if scope->>'lead_id' is distinct from a.target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key) then raise exception 'Signing matter changed. Owner reconciliation is required.'; end if;
  old:=public.cr_esign_attempt_latest(a.target_lead_id,a.target_claim_id,a.campaign_id);
  if old.id is distinct from a.expected_submission_id then raise exception 'Agreement changed during provider create. Owner reconciliation is required.'; end if;
  if a.emergency_document_id is not null and not public.cr_esign_attempt_emergency(a.emergency_document_id,a.target_lead_id,a.target_claim_id,a.firm_id,a.campaign_id,a.expected_submission_id) then
    raise exception 'The signed emergency agreement changed during provider create. Owner reconciliation is required.';
  end if;
  for k in select unnest(array['firm_id','lead_id','campaign_id','claim_id','template_key','template_id','via','sent_by']) loop
    if p_submission ? k and p_submission->>k is distinct from (case k
      when 'firm_id' then a.firm_id::text when 'lead_id' then a.target_lead_id::text when 'campaign_id' then a.campaign_id::text
      when 'claim_id' then a.target_claim_id::text when 'template_key' then a.template_key when 'template_id' then a.template_id when 'via' then a.via when 'sent_by' then a.actor_id::text end) then
      raise exception 'Provider signing record does not match its reservation.';
    end if;
  end loop;
  if coalesce(p_submission->>'provider','docuseal')<>'docuseal' or coalesce(p_submission->>'status','sent')<>'sent' then raise exception 'Only a newly created DocuSeal submission can be finalized.'; end if;
  call_id:=nullif(p_submission->>'call_id','')::uuid;
  if call_id is not null and not exists(select 1 from public.intake_calls where id=call_id and lead_id in (a.parent_lead_id,a.target_lead_id)
    and (claim_id in (a.parent_claim_id,a.target_claim_id) or (claim_id is null and 1=(select count(*) from public.claims where lead_id=intake_calls.lead_id)))) then
    raise exception 'The intake call belongs to another matter.';
  end if;
  replacement_id:=nullif(p_submission->>'replacement_of','')::uuid;
  if replacement_id is not null and replacement_id is distinct from a.expected_submission_id then raise exception 'Replacement agreement does not match its reservation.'; end if;
  insert into public.esign_submissions(firm_id,lead_id,call_id,campaign_id,provider,template_key,template_id,claim_id,
    submission_id,client_submitter_id,intake_submitter_id,signer_name,injured_name,phone,email,via,pax_index,status,sign_url,sent_by,replacement_of,sent_at)
  values(a.firm_id,a.target_lead_id,call_id,a.campaign_id,'docuseal',a.template_key,a.template_id,a.target_claim_id,
    provider_id,p_submission->>'client_submitter_id',nullif(p_submission->>'intake_submitter_id',''),p_submission->>'signer_name',p_submission->>'injured_name',
    p_submission->>'phone',p_submission->>'email',a.via,a.pax_index,'sent',p_submission->>'sign_url',a.actor_id,replacement_id,a.provider_started_at) returning * into r;
  update public.esign_send_attempts set state='linked',linked_submission_id=r.id,resolved_at=now(),resolved_by=coalesce(p_reconciled_by,a.actor_id),resolution_code='provider_linked',reconciled_provider_submission_id=provider_id,updated_at=now() where id=a.id;
  return jsonb_build_object('id',r.id,'attempt_id',a.id);
end $$;

-- Deliberate owner reconciliation can retire an untracked provider submission
-- only after a trusted route has GET-verified that exact provider ID expired.
-- There is deliberately no "not found", elapsed-time, or blanket unlock RPC.
create function public.cr_reconcile_expired_esign_send(p_attempt_id uuid,p_owner_id uuid,p_provider_submission_id text,p_verified_expired_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  if not exists(select 1 from public.app_users where id=p_owner_id and active and role='owner') then raise exception 'An active owner must reconcile this send.' using errcode='42501'; end if;
  if nullif(trim(p_provider_submission_id),'') is null or p_verified_expired_at is null or p_verified_expired_at>now() then raise exception 'A verified expired provider submission is required.'; end if;
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state not in ('provider_pending','uncertain') then raise exception 'This send does not need provider reconciliation.'; end if;
  -- Provider identity is kept as a fixed field, not a free-form payload.
  update public.esign_send_attempts set state='rejected',resolved_at=now(),resolved_by=p_owner_id,resolution_code='provider_expired',error_code='provider_expired',reconciled_provider_submission_id=p_provider_submission_id,verified_expired_at=p_verified_expired_at,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_pending_esign_send(p_claim_id uuid,p_pax_key text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.claims%rowtype; l public.leads%rowtype; parent_claim uuid:=p_claim_id; key text:=coalesce(p_pax_key,''); candidates uuid[]; a public.esign_send_attempts%rowtype;
begin
  select * into c from public.claims where id=p_claim_id;
  if not found then raise exception 'Signing matter is unavailable.'; end if;
  select * into l from public.leads where id=c.lead_id;
  if key<>'' and key !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Invalid passenger signing key.'; end if;
  if coalesce(l.external_id,'') ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' then
    if key<>'' then raise exception 'Nested passenger signing is unavailable.'; end if;
    key:=split_part(l.external_id,':pax:',2);
    select array_agg(id) into candidates from public.claims where lead_id=split_part(l.external_id,':pax:',1)::uuid and firm_id=c.firm_id and campaign_id=c.campaign_id;
    if coalesce(array_length(candidates,1),0)<>1 then raise exception 'Passenger parent matter is ambiguous.'; end if;
    parent_claim:=candidates[1];
  end if;
  select * into a from public.esign_send_attempts where parent_claim_id=parent_claim and pax_key=key and state in ('reserved','provider_pending','uncertain');
  if not found then return null; end if;
  return to_jsonb(a);
end $$;

-- Function ownership runs the atomic writes; only the trusted server role can
-- enter them. Table writes stay unavailable even to a direct service client.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cr_esign_attempt_scope','cr_esign_attempt_latest','cr_esign_attempt_emergency','cr_reserve_esign_send','cr_bind_esign_send','cr_mark_esign_send_pending','cr_hold_esign_send','cr_reject_esign_send','cr_finalize_esign_send','cr_reconcile_expired_esign_send','cr_pending_esign_send') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('cr_esign_attempt_scope','cr_esign_attempt_latest','cr_esign_attempt_emergency') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
commit;

-- 0123_pilot_password_document_boundary.sql
-- First-login credentials cannot access claimant data until changed. Document
-- index writes remain server/owner managed during the INNO MVA staff pilot.
-- Additive: no claimant data, signed files, users, passwords or roles changed.
begin;

create or replace function public.cr_pilot_password_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users a join public.app_users u on u.id = a.id
    where a.id = auth.uid() and u.role::text in ('admin','manager','agent','qa')
      and a.raw_app_meta_data->>'must_change_password' = 'true'
  );
$$;
revoke all on function public.cr_pilot_password_required() from public, anon;
grant execute on function public.cr_pilot_password_required() to authenticated, service_role;

-- Read current trusted Auth metadata, not user-editable metadata or a stale JWT.
-- The own-profile exception lets onboarding read role/active. Existing 0121
-- restrictions still deny staff profile mutations and identity escalation.
do $$
declare t record; predicate text;
begin
  for t in
    select c.oid, c.relname as table_name, c.relrowsecurity
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
  loop
    if not t.relrowsecurity then
      raise exception 'Exposed table % has no RLS. Password boundary not applied.',t.table_name;
    end if;
    predicate := '(select not public.cr_pilot_password_required())';
    if t.table_name='app_users' then predicate := predicate || ' or id = (select auth.uid())'; end if;
    execute format('drop policy if exists cr_pilot_password_wall on public.%I',t.table_name);
    execute format('create policy cr_pilot_password_wall on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.table_name,predicate,predicate);
  end loop;
end $$;

-- case_documents keys are scoped to firm/lead, not claim. Allowing an agent
-- to point an INNO index row at a hidden sibling claim's object would make
-- the file route sign that hidden path. Staff retain RLS-scoped reads only.
-- Server ingestion/reindex uses service_role; owner and firm rules are kept.
drop policy if exists cr_pilot_document_index_insert on public.case_documents;
create policy cr_pilot_document_index_insert on public.case_documents
  as restrictive for insert to authenticated
  with check (not public.cr_is_internal_account() or public.cr_is_owner());
drop policy if exists cr_pilot_document_index_update on public.case_documents;
create policy cr_pilot_document_index_update on public.case_documents
  as restrictive for update to authenticated
  using (not public.cr_is_internal_account() or public.cr_is_owner())
  with check (not public.cr_is_internal_account() or public.cr_is_owner());
drop policy if exists cr_pilot_document_index_delete on public.case_documents;
create policy cr_pilot_document_index_delete on public.case_documents
  as restrictive for delete to authenticated
  using (not public.cr_is_internal_account() or public.cr_is_owner());

-- This older definer RPC is server-only. Revoking named roles alone leaves
-- PostgreSQL's implicit PUBLIC EXECUTE grant effective.
revoke all on function public.enroll_drips_for_lead(uuid,uuid) from public, anon, authenticated;
grant execute on function public.enroll_drips_for_lead(uuid,uuid) to service_role;

-- The remaining staff write RPC runs as definer and must check the password
-- gate before consuming a number; table RLS cannot protect a sequence.
create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare nxt bigint; pfx text;
begin
  if auth.role() is distinct from 'service_role' then
    if not public.is_internal() then raise exception 'Only internal staff may mint a lead number'; end if;
    if public.cr_pilot_password_required() then raise exception 'Change your temporary password first.'; end if;
    if not public.cr_is_owner() and p_firm is distinct from public.cr_inno_mva_firm_id() then
      raise exception 'This campaign is not available to staff.';
    end if;
  end if;
  select coalesce(lead_prefix,'CR') into pfx from public.firms where id=p_firm;
  nxt := nextval('public.global_lead_seq');
  return coalesce(pfx,'CR') || '-' || nxt::text;
end $$;
revoke all on function public.mint_lead_no(uuid) from public, anon;
grant execute on function public.mint_lead_no(uuid) to authenticated, service_role;
commit;

-- 0124_atomic_drip_reminders.sql
-- Generic drip QA: fail-closed eligibility and atomic note-only reminders.
-- Does not enable any sender, create an INNO sequence or change existing enrollments.
begin;

create or replace function public.cr_check_drip_enrollment(p_enrollment uuid, p_expected_due date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.drip_enrollments; r public.drip_rules; l public.leads;
  c public.claims; s public.statuses; matter_count integer; released_at timestamptz;
begin
  select * into e from public.drip_enrollments where id=p_enrollment;
  if not found or e.active is not true or e.next_due is distinct from p_expected_due
     or e.next_due is null or e.next_due > (now() at time zone 'UTC')::date then
    return jsonb_build_object('allowed',false,'reason','The enrollment is no longer due.');
  end if;
  select * into r from public.drip_rules where id=e.rule_id;
  if not found or r.active is not true or r.campaign is not null or r.every_days is null
     or r.every_days < 1 or r.every_days > 3650 or r.channel is null or r.channel not in ('sms','email','call_reminder') then
    return jsonb_build_object('allowed',false,'reason','This rule is inactive, invalid, or belongs to a separate campaign workflow.');
  end if;
  select * into l from public.leads where id=e.lead_id;
  if not found or l.archived_at is not null or l.firm_id is null or l.firm_id is distinct from e.firm_id
     or (r.firm_id is not null and r.firm_id is distinct from l.firm_id) then
    return jsonb_build_object('allowed',false,'reason','The file is archived, missing, or does not match the rule firm.');
  end if;
  -- Legacy enrollments have no claim_id. Count every sibling, including ones
  -- hidden from the requesting staff account, instead of guessing a matter.
  select count(*) into matter_count from public.claims where lead_id=l.id;
  if matter_count <> 1 then
    return jsonb_build_object('allowed',false,'reason','This lead-scoped enrollment cannot identify one exact matter.');
  end if;
  select * into c from public.claims where lead_id=l.id;
  if c.firm_id is distinct from l.firm_id or c.claim_type::text is distinct from 'mva' or l.case_type::text is distinct from 'mva' then
    return jsonb_build_object('allowed',false,'reason','This file belongs to a separate campaign workflow.');
  end if;
  if not exists(select 1 from public.campaigns where id=c.campaign_id and firm_id=l.firm_id and active
      and case_type::text='mva') then
    return jsonb_build_object('allowed',false,'reason','The matter campaign is missing, inactive, or belongs to another firm.');
  end if;
  select * into s from public.statuses where key=c.status;
  if not found or s.active is not true or s.phase <> 'pre_qa' or s.is_final or s.unlocks_firm
     or s.qualify='disqualify' or c.status in ('test','external_dq_review') then
    return jsonb_build_object('allowed',false,'reason','This matter is signed, closed, a test, or no longer eligible for acquisition follow-up.');
  end if;
  if l.signed_at is not null or exists(select 1 from public.esign_submissions x
      where x.lead_id=l.id and x.firm_id=l.firm_id and (x.claim_id=c.id or x.claim_id is null)
        and x.voided_at is null and (x.signed_at is not null or x.status in ('signed','completed'))) then
    return jsonb_build_object('allowed',false,'reason','A client signature is already recorded.');
  end if;
  select max(created_at) into released_at from public.lead_activity a
    where a.lead_id=l.id and a.firm_id=l.firm_id and a.meta->>'source'='lawruler'
      and a.meta->>'event'='mva_status_reconciliation' and a.meta->>'claim_id'=c.id::text
      and a.meta->>'campaign_id'=c.campaign_id::text and a.meta->>'hold_release_reviewed'='true'
      and a.meta->>'acquisition_hold'='false';
  if exists(select 1 from public.lead_activity a where a.lead_id=l.id and a.firm_id=l.firm_id
      and a.meta->>'source'='lawruler' and a.meta->>'event'='mva_status_reconciliation'
      and a.meta->>'claim_id'=c.id::text and a.meta->>'campaign_id'=c.campaign_id::text
      and a.meta->>'acquisition_hold'='true' and (released_at is null or a.created_at>=released_at)) then
    return jsonb_build_object('allowed',false,'reason','LawRuler reported a signature or closure that needs review.');
  end if;
  if e.created_at is null or exists(select 1 from public.communications m where m.lead_id=l.id
      and m.firm_id=l.firm_id and m.direction='inbound' and m.occurred_at>=e.created_at) then
    return jsonb_build_object('allowed',false,'reason','The client responded after enrollment; review the file before further acquisition follow-up.');
  end if;
  if (r.channel='sms' and l.perm_text is false) or (r.channel='email' and l.perm_email is false)
     or (r.channel='call_reminder' and l.perm_call is false) then
    return jsonb_build_object('allowed',false,'reason','The requested contact channel is blocked on this file.');
  end if;
  if l.comms_monitored and not exists(select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(l.comms_safe_channels)='array' then l.comms_safe_channels else '[]'::jsonb end) ch
      where lower(ch)=case r.channel when 'sms' then 'text' when 'email' then 'email' else 'call' end) then
    return jsonb_build_object('allowed',false,'reason','This is not an approved safe contact channel.');
  end if;
  if r.channel in ('sms','email') then
    return jsonb_build_object('allowed',false,'reason',r.channel||' delivery is not configured for scheduled drips.');
  end if;
  return jsonb_build_object('allowed',true,'reason','Eligible for a note-only call reminder.','claim_id',c.id);
end $$;
revoke all on function public.cr_check_drip_enrollment(uuid,date) from public,anon,authenticated;
grant execute on function public.cr_check_drip_enrollment(uuid,date) to service_role;

create or replace function public.cr_fire_drip_reminder(p_enrollment uuid,p_expected_due date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.drip_enrollments; r public.drip_rules; checked jsonb; note_id uuid;
begin
  -- Serializes duplicate cron/manual requests. A committed result changes the
  -- expected due date (or deactivates a one-shot), so its retry cannot repeat.
  select * into e from public.drip_enrollments where id=p_enrollment for update;
  if not found then return jsonb_build_object('fired',false,'reason','Enrollment not found.'); end if;
  if e.active is not true or e.next_due is distinct from p_expected_due then
    return jsonb_build_object('fired',false,'reason','The enrollment was already processed or changed.');
  end if;
  select * into r from public.drip_rules where id=e.rule_id for share;
  perform 1 from public.leads where id=e.lead_id for share;
  perform 1 from public.claims where lead_id=e.lead_id for share;
  checked := public.cr_check_drip_enrollment(p_enrollment,p_expected_due);
  if checked->>'allowed' is distinct from 'true' then
    return jsonb_build_object('fired',false,'reason',checked->>'reason');
  end if;
  if r.channel is distinct from 'call_reminder' then raise exception 'Only note-only reminders are supported'; end if;
  insert into public.notes(firm_id,lead_id,claim_id,author_name,scope,body)
    values(e.firm_id,e.lead_id,(checked->>'claim_id')::uuid,'Drip','file',
      'Call reminder: '||r.name||'. No call or message was sent.') returning id into note_id;
  update public.drip_enrollments set last_sent=now(),
    next_due=(now() at time zone 'UTC')::date+r.every_days,
    active=case when r.fire_once then false else true end where id=e.id;
  return jsonb_build_object('fired',true,'note_id',note_id);
end $$;
revoke all on function public.cr_fire_drip_reminder(uuid,date) from public,anon,authenticated;
grant execute on function public.cr_fire_drip_reminder(uuid,date) to service_role;

-- Existing enrollments are preserved. Serialize future enrollments per lead;
-- a transferred/archived file or a caller-supplied wrong firm cannot enroll.
create or replace function public.enroll_drips_for_lead(p_lead uuid,p_firm uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.leads;
begin
  select * into l from public.leads where id=p_lead for update;
  if not found or l.archived_at is not null or l.firm_id is null or l.firm_id is distinct from p_firm then
    raise exception 'The file cannot be enrolled under this firm';
  end if;
  insert into public.drip_enrollments(firm_id,lead_id,rule_id,next_due,active)
    select l.firm_id,l.id,r.id,(now() at time zone 'UTC')::date+r.every_days,true
    from public.drip_rules r where r.active and r.campaign is null and r.every_days between 1 and 3650
      and (r.firm_id is null or r.firm_id=l.firm_id)
      and not exists(select 1 from public.drip_enrollments e where e.lead_id=l.id and e.rule_id=r.id);
end $$;
revoke all on function public.enroll_drips_for_lead(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enroll_drips_for_lead(uuid,uuid) to service_role;
commit;

-- 0125_signed_intake_label.sql
-- Display wording only. Preserve the status key, workflow and custom labels.
begin;
update public.statuses set label='Signed: Finish intake'
where key='signed_grievous' and label='Signed: Grievous';
commit;
-- 0126 NETFLY ONTAKE: separate TMP secondary-intake campaign.
-- Apply supabase/migrations/0126_netfly_ontake_campaign.sql after reviewing.
begin;
do $$
declare tmp_id uuid; existing_count integer;
begin
  select id into tmp_id from public.firms where slug='tmp';
  if tmp_id is null then raise exception 'TMP firm missing; NETFLY not activated'; end if;
  select count(*) into existing_count from public.campaigns where firm_id=tmp_id and name='NETFLY ONTAKE';
  if existing_count > 1 then raise exception 'Ambiguous NETFLY campaign'; end if;
  if existing_count = 0 then
    insert into public.campaigns (name, firm_id, case_type, path, intake_template, active,
      esign_required, allow_live_sign, firm_delivery_on, attach_intake_pdf,
      attach_intake_csv, attach_retainer, attach_certificate, retainer_packet)
    values ('NETFLY ONTAKE', tmp_id, 'mva', 'secondary', 'netfly_secondary', true,
      false, false, false, true, false, true, false, '[]'::jsonb);
  else
    if not exists(select 1 from public.campaigns where firm_id=tmp_id and name='NETFLY ONTAKE'
      and case_type='mva' and path='secondary' and esign_required=false and allow_live_sign=false) then
      raise exception 'Existing NETFLY campaign is not the isolated secondary-intake configuration';
    end if;
  end if;
end $$;
commit;

-- 0127 JustCall call result and staff-scoped dial summary. Apply only after review.
begin;
-- Preserve JustCall's explicit call result. Duration is not an answer state:
-- an unanswered ring can have a duration and a short answer can be missed by
-- timing-based guesses. Nullable means the provider did not supply a result.
alter table public.communications
  add column if not exists provider_call_result text
  check (provider_call_result in ('answered', 'unanswered', 'busy', 'voicemail', 'failed'));

-- Completed standard and Sales Dialer webhooks carry an explicit result.
-- Match by provider call SID; leave other older records unclassified rather
-- than inventing a no-answer from duration or a preliminary event.
-- Scope historical backfill to INNO MVA; other campaigns' calls are untouched.
with target_calls as materialized (
  select c.id, c.call_sid
  from public.communications c
  join public.leads l on l.id = c.lead_id
  join public.campaigns cp on cp.id = l.campaign_id
  where cp.name = 'INNO MVA' and cp.case_type = 'mva'
    and c.call_sid is not null and c.channel = 'call'
    and c.provider_call_result is null
), provider_results as (
  select distinct on (payload->'data'->>'call_sid')
    payload->'data'->>'call_sid' as call_sid,
    case lower(replace(coalesce(payload->'data'->'call_info'->>'type', ''), ' ', '_'))
      when 'answered' then 'answered'
      when 'outgoing_answered_call' then 'answered'
      when 'outgoing_human_answered' then 'answered'
      when 'unanswered' then 'unanswered'
      when 'no_answer' then 'unanswered'
      when 'outgoing_unanswered_call' then 'unanswered'
      when 'busy' then 'busy'
      when 'voicemail' then 'voicemail'
      when 'outgoing_machine_answered' then 'voicemail'
      when 'failed' then 'failed'
      when 'outgoing_failed_call' then 'failed'
      when 'outgoing_restricted_call' then 'failed'
      when 'outgoing_blocked_call' then 'failed'
      when 'outgoing_cancelled_call' then 'failed'
      when 'outgoing_abandoned_call' then 'failed'
      else null
    end as result
  from public.webhook_events e
  join target_calls t on t.call_sid = e.payload->'data'->>'call_sid'
  where e.event_type in ('justcall.call.completed', 'justcall.sd.call_completed')
  order by e.payload->'data'->>'call_sid', e.created_at desc
)
update public.communications c
set provider_call_result = p.result
from provider_results p
join target_calls t on t.call_sid = p.call_sid
where c.id = t.id
  and c.provider_call_result is null
  and p.result is not null;

-- The Desk reads one bounded row per visible file, rather than downloading
-- every call each time it refreshes. The invoker's lead/communications RLS
-- applies; this view contains no phone number or communication body.
create or replace view public.cr_mva_dial_summary
with (security_invoker = true) as
select l.id as lead_id,
  z.zone as local_zone,
  coalesce(p.shared, false) as shared_phone,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail'))::int as total_dials,
  min(c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')) as first_call_at,
  max(c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')) as last_call_at,
  coalesce(array_agg(c.occurred_at order by c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')), '{}') as dial_times,
  coalesce((select array_agg(s.occurred_at order by s.occurred_at)
    from public.communications s where s.lead_id = l.id and s.direction = 'outbound'
      and s.channel = 'sms' and s.phone_norm = l.phone_norm and s.occurred_at >= l.created_at), '{}') as outbound_sms_times,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and z.zone is not null
    and (c.occurred_at at time zone z.zone)::date = (now() at time zone z.zone)::date)::int as dials_today,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result in ('unanswered', 'busy', 'voicemail'))::int as unanswered_dials,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result = 'answered')::int as answered_dials,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result is null)::int as unverified_dials
from public.leads l
cross join lateral (select case l.client_time_zone
  when 'Eastern' then 'America/New_York'
  when 'Central' then 'America/Chicago'
  when 'Mountain' then null
  when 'Pacific' then 'America/Los_Angeles'
  when 'Alaska' then 'America/Anchorage'
  when 'Hawaii' then 'Pacific/Honolulu'
  when 'America/New_York' then 'America/New_York'
  when 'America/Chicago' then 'America/Chicago'
  when 'America/Denver' then 'America/Denver'
  when 'America/Phoenix' then 'America/Phoenix'
  when 'America/Los_Angeles' then 'America/Los_Angeles'
  when 'America/Anchorage' then 'America/Anchorage'
  when 'Pacific/Honolulu' then 'Pacific/Honolulu'
  else null end as zone) z
cross join lateral (select exists(select 1 from public.leads other
  where other.phone_norm = l.phone_norm and other.id <> l.id and other.archived_at is null) as shared) p
left join public.communications c on c.lead_id = l.id
  and c.phone_norm = l.phone_norm and c.occurred_at >= l.created_at
where public.is_internal()
group by l.id, z.zone, p.shared;

revoke all on public.cr_mva_dial_summary from public, anon;
grant select on public.cr_mva_dial_summary to authenticated, service_role;
commit;
-- 0129: PR Digital read-only sheet. Independent of held payroll migration 0128.
-- No staff/firm auth profile, no access for anon/authenticated, no lead changes.
begin;
create table public.partner_report_access (
  report_key text primary key check (report_key = 'pr-digital'),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  scope text not null default 'approved_sources' check (scope in ('approved_sources', 'campaign')),
  active boolean not null default false,
  password_salt text not null check (password_salt ~ '^[0-9a-f]{32}$'),
  password_hash text not null check (password_hash ~ '^[0-9a-f]{64}$'),
  token_secret text not null check (token_secret ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.partner_report_access enable row level security;
revoke all on public.partner_report_access from public, anon, authenticated;
grant select, insert, update on public.partner_report_access to service_role;

create table public.partner_report_attempts (
  report_key text not null references public.partner_report_access(report_key),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (report_key, client_hash)
);
alter table public.partner_report_attempts enable row level security;
revoke all on public.partner_report_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.partner_report_attempts to service_role;
create index partner_report_attempts_window on public.partner_report_attempts(window_start);

-- Shared across edge instances; attempted logins consume the allowance even
-- when successful. Only a keyed IP hash is stored, never the IP or password.
create function public.consume_partner_report_attempt(p_report_key text, p_client_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; stamp timestamptz := clock_timestamp();
begin
  if p_report_key <> 'pr-digital' or p_client_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.partner_report_attempts where report_key = p_report_key and window_start < stamp - interval '1 day';
  insert into public.partner_report_attempts(report_key, client_hash, window_start, attempts)
  values(p_report_key, p_client_hash, stamp, 1)
  on conflict(report_key, client_hash) do update set
    attempts = case when partner_report_attempts.window_start <= stamp - interval '15 minutes' then 1 else least(partner_report_attempts.attempts + 1, 1000) end,
    window_start = case when partner_report_attempts.window_start <= stamp - interval '15 minutes' then stamp else partner_report_attempts.window_start end
  returning attempts into n;
  return n <= 12;
end;
$$;
revoke all on function public.consume_partner_report_attempt(text, text) from public, anon, authenticated;
grant execute on function public.consume_partner_report_attempt(text, text) to service_role;
commit;

-- Held 0128 payroll migration, appended after independent 0129. Not applied.
-- 0128 Owner-only weekly billing/payroll. Append-only history; no money moves.
begin;
create table public.cr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  period_start date not null,
  period_end date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null default auth.uid() references public.app_users(id),
  snapshot jsonb not null,
  check (extract(isodow from period_start)=1 and period_end=period_start+6),
  check (jsonb_typeof(snapshot)='object'),
  unique(firm_id,period_start), unique(id,firm_id)
);
create table public.cr_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  claim_id uuid not null references public.claims(id),
  run_id uuid,
  period_start date not null check (extract(isodow from period_start)=1),
  kind text not null check (kind in ('billing','commission','firm_credit','clawback')),
  source_line_id uuid,
  data jsonb not null check (jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_users(id),
  check ((kind in ('billing','commission') and source_line_id is null) or (kind in ('firm_credit','clawback') and source_line_id is not null)),
  unique(id,firm_id,claim_id,campaign_id),
  foreign key(run_id,firm_id) references public.cr_payroll_runs(id,firm_id),
  foreign key(source_line_id,firm_id,claim_id,campaign_id) references public.cr_payroll_lines(id,firm_id,claim_id,campaign_id)
);
create unique index cr_payroll_once_positive on public.cr_payroll_lines(firm_id,claim_id,kind) where kind in ('billing','commission');
create unique index cr_payroll_once_reversal on public.cr_payroll_lines(source_line_id) where source_line_id is not null;
create index cr_payroll_line_firm_period on public.cr_payroll_lines(firm_id,period_start);
create index cr_payroll_line_run on public.cr_payroll_lines(run_id,firm_id);
create index cr_payroll_line_campaign on public.cr_payroll_lines(campaign_id);
create table public.cr_payroll_notes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  claim_id uuid not null references public.claims(id),
  kind text not null check(kind in ('attorney_hold','attorney_release','signature_date','agent_credit','reconcile')),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_users(id)
);
create index cr_payroll_note_matter on public.cr_payroll_notes(firm_id,claim_id,created_at desc);
create index cr_payroll_note_campaign on public.cr_payroll_notes(campaign_id);

alter table public.cr_payroll_runs enable row level security;
alter table public.cr_payroll_lines enable row level security;
alter table public.cr_payroll_notes enable row level security;
revoke all on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes from public,anon,authenticated;
grant select,insert on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes to authenticated;
grant all on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes to service_role;
create policy payroll_run_read on public.cr_payroll_runs for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_run_write on public.cr_payroll_runs for insert to authenticated with check ((select public.cr_is_owner()) and closed_by=(select auth.uid()));
create policy payroll_line_read on public.cr_payroll_lines for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_line_write on public.cr_payroll_lines for insert to authenticated with check (
  (select public.cr_is_owner()) and created_by=(select auth.uid()) and exists (
    select 1 from public.claims c where c.id=cr_payroll_lines.claim_id and c.firm_id=cr_payroll_lines.firm_id and c.campaign_id=cr_payroll_lines.campaign_id
  ));
create policy payroll_note_read on public.cr_payroll_notes for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_note_write on public.cr_payroll_notes for insert to authenticated with check (
  (select public.cr_is_owner()) and created_by=(select auth.uid()) and exists (
    select 1 from public.claims c where c.id=cr_payroll_notes.claim_id and c.firm_id=cr_payroll_notes.firm_id and c.campaign_id=cr_payroll_notes.campaign_id
  ));

-- Authenticated invoker: RLS applies. One transaction closes all selected firms,
-- records both sides, and rejects repeat billing or repeat clawbacks atomically.
create function public.cr_close_payroll(p_runs jsonb,p_lines jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb; affected integer;
begin
  if not coalesce(public.cr_is_owner(),false) then raise exception 'Owner access required'; end if;
  if p_runs is null or p_lines is null or jsonb_typeof(p_runs)<>'array' or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_runs)=0 then raise exception 'Choose an open period'; end if;
  for r in select * from jsonb_array_elements(p_runs) loop
    perform pg_advisory_xact_lock(hashtextextended('payroll:'||(r->>'firm_id'),0));
    if (r->>'period_end')::date+3 > (now() at time zone 'America/Los_Angeles')::date then raise exception 'Close on or after Wednesday'; end if;
    if exists(select 1 from public.cr_payroll_runs where firm_id=(r->>'firm_id')::uuid and period_start >= (r->>'period_start')::date) then raise exception 'Period already closed or predates a closed payroll'; end if;
    if r->'snapshot'->>'start' <> r->>'period_start' or r->'snapshot'->>'end' <> r->>'period_end' then raise exception 'Snapshot period mismatch'; end if;
    insert into public.cr_payroll_runs(id,firm_id,period_start,period_end,snapshot)
      values((r->>'id')::uuid,(r->>'firm_id')::uuid,(r->>'period_start')::date,(r->>'period_end')::date,r->'snapshot');
  end loop;
  for r in select * from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from jsonb_array_elements(p_runs) run where run->>'id'=r->>'run_id' and run->>'firm_id'=r->>'firm_id' and run->>'period_start'=r->>'period_start') then raise exception 'Line is outside this payroll'; end if;
    if r->>'kind' in ('firm_credit','clawback') and not exists (
      select 1 from public.cr_payroll_lines source where source.id=(r->>'source_line_id')::uuid and source.firm_id=(r->>'firm_id')::uuid
        and source.claim_id=(r->>'claim_id')::uuid and source.campaign_id=(r->>'campaign_id')::uuid and source.period_start<(r->>'period_start')::date
        and source.kind=case r->>'kind' when 'firm_credit' then 'billing' else 'commission' end
    ) then raise exception 'Adjustment has no matching prior billing/payment'; end if;
    insert into public.cr_payroll_lines(firm_id,campaign_id,claim_id,run_id,period_start,kind,source_line_id,data)
      values((r->>'firm_id')::uuid,(r->>'campaign_id')::uuid,(r->>'claim_id')::uuid,(r->>'run_id')::uuid,(r->>'period_start')::date,r->>'kind',(r->>'source_line_id')::uuid,r->'data');
  end loop;
  affected:=jsonb_array_length(p_runs);
  return affected;
end $$;
revoke all on function public.cr_close_payroll(jsonb,jsonb) from public,anon;
grant execute on function public.cr_close_payroll(jsonb,jsonb) to authenticated;
commit;
