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
