-- ============================================================================
-- ClaimReach — 0008: Automated drip messaging + structured notes
-- ============================================================================

-- Drip sequences: recurring auto-messages/reminders on a cadence.
create table if not exists drip_rules (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  name        text not null,
  channel     text not null default 'sms',     -- sms / email / call_reminder
  every_days  int not null,                    -- cadence
  template    text,                            -- message body / email body
  assign_to   text default 'agent',            -- agent / case_manager / both
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Per-lead drip enrollment + next-due tracking.
create table if not exists drip_enrollments (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  rule_id     uuid references drip_rules(id) on delete cascade,
  next_due    date,
  last_sent   timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_drip_enr_lead on drip_enrollments(lead_id);
create index if not exists idx_drip_due on drip_enrollments(next_due) where active;

-- Structured notes: self note, file note, plaintiff note, case note, call note.
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  author      uuid references app_users(id),
  author_name text,
  scope       text not null default 'file',    -- self / file / plaintiff / case / call
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notes_lead on notes(lead_id, created_at desc);

-- Seed a few sensible default drip rules.
insert into drip_rules (firm_id, name, channel, every_days, template, assign_to) values
  (null, 'Check-in text', 'sms', 10, 'Hi, just checking in on your claim. Reply here any time.', 'agent'),
  (null, 'Status email', 'email', 28, 'Your claim is active and progressing. We will update you as things move.', 'case_manager'),
  (null, 'Call reminder', 'call_reminder', 45, 'Time to call this client for a status touch.', 'both')
on conflict do nothing;

alter table drip_rules        enable row level security;
alter table drip_enrollments  enable row level security;
alter table notes             enable row level security;

drop policy if exists drip_rules_internal on drip_rules;
create policy drip_rules_internal on drip_rules for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists drip_enr_internal on drip_enrollments;
create policy drip_enr_internal on drip_enrollments for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists notes_internal on notes;
create policy notes_internal on notes for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists notes_firm_read on notes;
create policy notes_firm_read on notes for select using ( firm_id = my_firm_id() );
