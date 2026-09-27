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
