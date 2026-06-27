-- ============================================================================
-- ClaimReach — 0015: Crissi training records (who completed what)
-- ============================================================================
create table if not exists training_progress (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid references firms(id),
  user_id      uuid references app_users(id) on delete cascade,
  user_name    text,
  module_id    text not null,                 -- course module id
  status       text not null default 'started', -- started / completed
  quiz_score   int,                           -- % if a quiz was taken
  quiz_total   int,
  started_at   timestamptz default now(),
  completed_at timestamptz,
  unique (user_id, module_id)
);
create index if not exists idx_training_user on training_progress(user_id);

alter table training_progress enable row level security;
-- A user sees and writes their own progress; internal staff (managers) can read all.
drop policy if exists training_self on training_progress;
create policy training_self on training_progress for all
  using ( user_id = auth.uid() or is_internal() )
  with check ( user_id = auth.uid() );
