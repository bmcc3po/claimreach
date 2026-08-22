-- ============================================================================
-- ClaimReach 0086: m6 LOR tracking (Phase G, launch week)
--
-- Day-one card so Josh can mark LOR status and pin a file on Today.
-- This is NOT the PostGrid pipeline (docs/LOR_PIPELINE_SPEC.md — parked).
-- Do not create lor_sends / defendants / PostGrid columns here.
--
-- lead_lor is a sidecar. Firm users cannot write arbitrary leads columns
-- (firm_stage_only_guard). Do not weaken that trigger.
--
-- Ingest-ready lead columns: LawRuler Part 1 fields have a real place to
-- land. Admin/webhook writes them; firm still cannot.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Case facts the later LOR letter needs. Real columns — a phantom name
--    on the webhook update would discard the entire row.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists gender           text;
alter table leads add column if not exists incident_start   date;
alter table leads add column if not exists incident_end     date;
alter table leads add column if not exists property_name    text;
alter table leads add column if not exists property_street  text;
alter table leads add column if not exists property_city    text;
alter table leads add column if not exists property_state   text;
alter table leads add column if not exists property_zip     text;

-- ---------------------------------------------------------------------------
-- 2. Operational LOR state. One row per file. Staff + TMP firm write.
-- ---------------------------------------------------------------------------
create table if not exists lead_lor (
  lead_id        uuid primary key references leads(id) on delete cascade,
  firm_id        uuid not null references firms(id),
  status         text not null default 'not_sent',
  flagged_today  boolean not null default false,
  sent_on        date,
  sent_to        text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references app_users(id),
  constraint lead_lor_status_chk check (status in ('not_sent','ready','sent','received'))
);
create index if not exists idx_lead_lor_today
  on lead_lor(firm_id) where flagged_today = true or status = 'ready';

alter table lead_lor enable row level security;
drop policy if exists lor_internal on lead_lor;
create policy lor_internal on lead_lor for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists lor_firm_read on lead_lor;
create policy lor_firm_read on lead_lor for select
  using ( firm_id = my_firm_id() );
drop policy if exists lor_firm_write on lead_lor;
create policy lor_firm_write on lead_lor for insert
  with check ( role_is_firm() and firm_id = my_firm_id() );
drop policy if exists lor_firm_update on lead_lor;
create policy lor_firm_update on lead_lor for update
  using ( role_is_firm() and firm_id = my_firm_id() )
  with check ( firm_id = my_firm_id() );
