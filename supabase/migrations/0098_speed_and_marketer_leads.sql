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
