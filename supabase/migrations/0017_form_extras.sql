-- ============================================================================
-- ClaimReach — 0017: saved questions library for the form builder.
-- ============================================================================
create table if not exists saved_questions (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  label       text not null,
  field       jsonb not null,         -- a single Field object
  tags        text[] default '{}',
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_saved_q_firm on saved_questions(firm_id);

alter table saved_questions enable row level security;
drop policy if exists saved_q_internal on saved_questions;
create policy saved_q_internal on saved_questions for all using ( is_internal() ) with check ( is_internal() );
