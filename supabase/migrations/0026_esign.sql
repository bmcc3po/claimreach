-- ============================================================================
-- ClaimReach — 0026: eSign. Two tiers:
--   CERTIFIED via SignWell (retainers, legal docs) — court-admissible audit trail
--   BUILT-IN PDF signing (non-certified) — lighter docs, no third party
-- ============================================================================

-- SignWell credentials per firm (or master/default).
create table if not exists esign_accounts (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,  -- null = master/default
  provider    text not null default 'signwell',
  api_key     text not null,
  webhook_secret text,                       -- SignWell HMAC for inbound verify
  test_mode   boolean not null default true, -- start in test mode
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table esign_accounts enable row level security;
drop policy if exists esign_acct_internal on esign_accounts;
create policy esign_acct_internal on esign_accounts for all using ( is_internal() ) with check ( is_internal() );

-- extra columns on retainers for the signing lifecycle
alter table retainers add column if not exists provider text default 'signwell'; -- signwell | builtin
alter table retainers add column if not exists signer_name text;
alter table retainers add column if not exists signer_email text;
alter table retainers add column if not exists signer_phone text;
alter table retainers add column if not exists signing_url text;        -- embedded/sign link
alter table retainers add column if not exists completed_pdf_url text;  -- final signed PDF
alter table retainers add column if not exists viewed_at timestamptz;
alter table retainers add column if not exists declined_at timestamptz;
alter table retainers add column if not exists sent_via text;           -- sms | email | both
alter table retainers add column if not exists audit jsonb default '{}';

-- generic signable documents (non-retainer): consent forms, acknowledgments, etc.
-- supports BOTH SignWell (certified) and built-in (non-certified) signing.
create table if not exists signable_documents (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid references firms(id) on delete set null,
  lead_id       uuid references leads(id) on delete cascade,
  title         text not null,
  doc_type      text default 'other',          -- consent | acknowledgment | hipaa | other
  certified     boolean not null default false,-- true = SignWell, false = built-in
  provider      text,                           -- signwell | builtin
  provider_ref  text,                           -- SignWell document id
  body_html     text,                           -- for built-in render
  status        text not null default 'draft', -- draft | sent | viewed | signed | declined
  signer_name   text, signer_email text, signer_phone text,
  signing_url   text, completed_pdf_url text,
  -- built-in signature capture
  signature_data text,                          -- base64 PNG of drawn signature
  signed_name   text, signed_ip text,
  signed_at     timestamptz, sent_at timestamptz, viewed_at timestamptz,
  audit         jsonb default '{}',
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_signable_lead on signable_documents(lead_id);
alter table signable_documents enable row level security;
drop policy if exists signable_internal on signable_documents;
create policy signable_internal on signable_documents for all using ( is_internal() ) with check ( is_internal() );
-- public can read a single doc by id for the built-in signing page (server-checked)
