-- ============================================================================
-- ClaimReach — 0005: Bulletins (team board) + categorized claim notes
-- ============================================================================

-- Team bulletin board — firm-wide announcements/posts, categorized.
create table if not exists bulletins (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  author      uuid references app_users(id),
  author_name text,
  category    text not null default 'general',   -- general / announcement / win / alert / coaching
  title       text,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bulletins_firm on bulletins(firm_id, created_at desc);

-- Categorized notes on a claim/file (Claimant Request / OBO Note / Claim Update / General...)
create table if not exists claim_notes (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  author      uuid references app_users(id),
  author_name text,
  category    text not null default 'general',   -- claimant_request / obo_note / claim_update / general / flag
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cnotes_lead on claim_notes(lead_id, created_at desc);
create index if not exists idx_cnotes_claim on claim_notes(claim_id, created_at desc);

alter table bulletins   enable row level security;
alter table claim_notes enable row level security;

drop policy if exists bull_internal_all on bulletins;
create policy bull_internal_all on bulletins for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists bull_firm_read on bulletins;
create policy bull_firm_read on bulletins for select using ( firm_id = my_firm_id() );

drop policy if exists cnotes_internal_all on claim_notes;
create policy cnotes_internal_all on claim_notes for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cnotes_firm_read on claim_notes;
create policy cnotes_firm_read on claim_notes for select using ( firm_id = my_firm_id() );
drop policy if exists cnotes_firm_insert on claim_notes;
create policy cnotes_firm_insert on claim_notes for insert with check ( firm_id = my_firm_id() );
