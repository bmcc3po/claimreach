-- ============================================================================
-- 0079 OUTBOUND WEBHOOKS MAP TO THE RECEIVER'S FIELD NAMES
--
-- Three things were missing.
--
-- 1. NO OUTBOUND MAPPING. field_mappings carries a `direction` column that
--    allows 'outbound', but nothing ever read it. Only inbound mapped. Every
--    outbound webhook sent our field names and the receiver had to adapt, which
--    is exactly backwards for a platform whose pitch is that it adapts to you.
--
-- 2. ENDPOINTS WERE PER FIRM. A firm running MVA and motel trafficking asks
--    completely different questions, so one shape per firm cannot be right. The
--    endpoint is now optionally scoped to a campaign.
--
-- 3. THE PAYLOAD NEVER CARRIED THE ANSWERS. It sent lead columns only, so there
--    was nothing to map per question even if mapping had existed.
--
-- The map lives ON the endpoint rather than in a separate table, because the
-- endpoint IS the destination: Lexamica wants one shape, Make wants another,
-- and a shared per-firm map cannot express both. This is the same shape the
-- Lexamica work already proved out: a destination is a url, auth, a field map,
-- and the event that fires it.
--
-- Idempotent. An endpoint with no map keeps sending exactly what it sends today.
-- ============================================================================

alter table webhook_endpoints add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
alter table webhook_endpoints add column if not exists field_map jsonb not null default '{}'::jsonb;
alter table webhook_endpoints add column if not exists include_answers boolean not null default true;
alter table webhook_endpoints add column if not exists name text;

comment on column webhook_endpoints.campaign_id is
  'Null = every campaign for this firm. Set = only this campaign, so an MVA feed and a trafficking feed can send different shapes.';
comment on column webhook_endpoints.field_map is
  'our_key -> their_key. Keys may be lead columns (claimant_name, phone) or intake answer ids (injured, treatment, case_subtype). Empty = send our canonical shape unchanged.';
comment on column webhook_endpoints.include_answers is
  'Include the intake answers in the payload. Off for receivers that only want the contact record.';

create index if not exists idx_webhook_endpoints_campaign
  on webhook_endpoints(campaign_id) where campaign_id is not null;

-- ---------------------------------------------------------------- verify
select e.id, e.name, e.url, e.campaign_id, e.include_answers,
       (select count(*) from jsonb_object_keys(e.field_map)) as mapped_fields,
       e.events
  from webhook_endpoints e
 order by e.created_at;
