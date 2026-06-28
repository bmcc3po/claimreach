-- ============================================================================
-- ClaimReach — 0022: Webhooks + API layer. Generic inbound lead hook, outbound
-- event webhooks, per-firm + master API keys (HMAC-signed), field mapping, event log.
-- ============================================================================

-- ---- API keys (master + per-firm). Secret is used to HMAC-sign payloads. ----
create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,  -- null = master key
  label       text not null,
  key_id      text not null unique,        -- public identifier sent in header
  secret      text not null,               -- HMAC secret (shown once on create)
  scope       text not null default 'firm',-- 'master' | 'firm'
  active      boolean not null default true,
  last_used_at timestamptz,
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_api_keys_keyid on api_keys(key_id);
alter table api_keys enable row level security;
drop policy if exists api_keys_internal on api_keys;
create policy api_keys_internal on api_keys for all using ( is_internal() ) with check ( is_internal() );

-- ---- Outbound webhook endpoints (where we POST events to). ----
create table if not exists webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,
  url         text not null,
  secret      text not null,               -- we HMAC-sign outbound with this
  events      text[] not null default '{}',-- e.g. {lead.created, lead.signed}
  active      boolean not null default true,
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now()
);
alter table webhook_endpoints enable row level security;
drop policy if exists webhook_ep_internal on webhook_endpoints;
create policy webhook_ep_internal on webhook_endpoints for all using ( is_internal() ) with check ( is_internal() );

-- ---- Field mapping per firm/source (translate their shape <-> ours). ----
create table if not exists field_mappings (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,
  direction   text not null default 'inbound', -- 'inbound' | 'outbound'
  -- map: { "their_field": "our_field", ... } plus transforms
  map         jsonb not null default '{}',
  transforms  jsonb not null default '{}',  -- { "phone":"digits", "claim_type":{"MVA":"mva"} }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table field_mappings enable row level security;
drop policy if exists field_map_internal on field_mappings;
create policy field_map_internal on field_mappings for all using ( is_internal() ) with check ( is_internal() );

-- ---- Event log: every inbound hit + outbound delivery (audit + retry). ----
create table if not exists webhook_events (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete set null,
  direction   text not null,               -- 'inbound' | 'outbound'
  event_type  text,                        -- lead.created, call.recording, etc
  endpoint    text,
  status      text,                        -- received | delivered | failed
  http_status int,
  payload     jsonb,
  response    text,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_webhook_events_firm on webhook_events(firm_id, created_at desc);
alter table webhook_events enable row level security;
drop policy if exists webhook_events_internal on webhook_events;
create policy webhook_events_internal on webhook_events for all using ( is_internal() ) with check ( is_internal() );

-- track inbound source on leads (which key/firm created it)
alter table leads add column if not exists source_key text;
alter table leads add column if not exists external_id text;  -- their id for this lead
create index if not exists idx_leads_external on leads(external_id);
