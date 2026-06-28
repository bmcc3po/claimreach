-- ClaimReach — 0021: Grievous intake reviews + eSign approval gate.
create table if not exists grievous_reviews (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  kind        text not null default 'full',   -- 'quick' | 'full'
  verdict     text,                            -- 'approved' | 'rejected' | 'advisory'
  score       int,
  issues      jsonb default '[]',
  summary     text,
  reviewed_by uuid references app_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_grievous_lead on grievous_reviews(lead_id, created_at desc);
alter table grievous_reviews enable row level security;
drop policy if exists grievous_internal on grievous_reviews;
create policy grievous_internal on grievous_reviews for all using ( is_internal() ) with check ( is_internal() );

-- approval flag the retainer gate reads
alter table leads add column if not exists grievous_approved boolean not null default false;
alter table leads add column if not exists grievous_approved_at timestamptz;
