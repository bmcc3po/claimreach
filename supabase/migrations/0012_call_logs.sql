-- ============================================================================
-- ClaimReach — 0012: Call logs (catch-up / inbound calls with notes)
-- ============================================================================
create table if not exists call_logs (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete set null,
  author      uuid references app_users(id),
  author_name text,
  direction   text not null default 'outbound',   -- inbound / outbound
  outcome     text,                                -- reached / voicemail / no_answer / callback / question_answered
  duration_min int,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_call_logs_lead on call_logs(lead_id, created_at desc);

alter table call_logs enable row level security;
drop policy if exists call_logs_internal on call_logs;
create policy call_logs_internal on call_logs for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists call_logs_firm on call_logs;
create policy call_logs_firm on call_logs for all using ( firm_id = my_firm_id() ) with check ( firm_id = my_firm_id() );
