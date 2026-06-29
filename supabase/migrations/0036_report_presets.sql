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
