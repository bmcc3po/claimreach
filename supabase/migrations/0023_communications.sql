-- ============================================================================
-- ClaimReach — 0023: unified communications timeline. Every call (inbound/
-- outbound/dialer), SMS (in/out), and voicemail from JustCall lands here,
-- attributed to a file by phone. Recording + transcript + JC AI insights live
-- on the record so Grievous never has to hunt for the recording.
-- ============================================================================

create table if not exists communications (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,   -- null = unmatched
  firm_id       uuid references firms(id) on delete set null,
  channel       text not null,            -- 'call' | 'sms' | 'voicemail'
  direction     text not null,            -- 'inbound' | 'outbound'
  call_kind     text,                     -- 'inbound' | 'outbound' | 'dialer' (calls only)
  -- attribution
  phone_raw     text,
  phone_norm    text,                     -- digits-only, last-10 for matching
  agent_name    text,
  agent_email   text,
  -- content
  body          text,                     -- sms text / voicemail note
  duration_sec  int,
  recording_url text,
  transcript    text,
  -- JustCall AI insights (kept SEPARATE from Grievous)
  jc_summary    text,
  jc_sentiment  text,
  jc_insights   jsonb default '{}',
  -- provider refs
  provider      text default 'justcall',
  call_sid      text,
  sms_sid       text,
  external_ref  text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_comm_lead on communications(lead_id, occurred_at desc);
create index if not exists idx_comm_phone on communications(phone_norm);
create index if not exists idx_comm_unmatched on communications(lead_id) where lead_id is null;
create unique index if not exists idx_comm_callsid on communications(call_sid) where call_sid is not null;
create unique index if not exists idx_comm_smssid on communications(sms_sid) where sms_sid is not null;

alter table communications enable row level security;
drop policy if exists comm_internal on communications;
create policy comm_internal on communications for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists comm_firm on communications;
create policy comm_firm on communications for select using ( firm_id = my_firm_id() );

-- JustCall credentials per firm (or master). Stored server-side, used for
-- click-to-call + outbound SMS. Secret never leaves the server.
create table if not exists justcall_accounts (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,  -- null = master/default
  label       text,
  api_key     text not null,
  api_secret  text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table justcall_accounts enable row level security;
drop policy if exists jc_internal on justcall_accounts;
create policy jc_internal on justcall_accounts for all using ( is_internal() ) with check ( is_internal() );

-- helper: normalize a phone to last-10 digits for matching
create or replace function norm_phone(p text) returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 10)
$$;

-- backfill phone_norm-able column on leads for fast matching
alter table leads add column if not exists phone_norm text generated always as (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10)) stored;
create index if not exists idx_leads_phone_norm on leads(phone_norm);
