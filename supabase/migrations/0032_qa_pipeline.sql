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
