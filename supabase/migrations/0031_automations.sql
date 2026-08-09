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
