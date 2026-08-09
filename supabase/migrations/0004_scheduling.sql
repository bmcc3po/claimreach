-- Per-case-manager Calendly links + a scheduled-call record per claim.
create table if not exists case_managers (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid not null references firms(id),
  name          text not null,
  calendly_url  text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table case_managers enable row level security;
drop policy if exists cm_internal_all on case_managers;
create policy cm_internal_all on case_managers for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cm_firm_read on case_managers;
create policy cm_firm_read on case_managers for select using ( firm_id = my_firm_id() );

-- Record that a call was scheduled on a claim (audit + visibility).
alter table claims add column if not exists scheduled_with uuid references case_managers(id);
alter table claims add column if not exists scheduled_at   timestamptz;
