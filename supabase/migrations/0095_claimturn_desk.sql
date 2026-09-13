-- ClaimReach 0095: ClaimTurn desk tables (additive).
-- Does NOT touch leads, communications, lead_notes, or /m6 objects.
-- Preview demo hydrates from src/lib/turn/seed.ts and does not require
-- this migration. Apply when you want a durable store for TMP PI files.
-- notes already exists (0008) so the desk uses turn_notes.

create table if not exists turn_matters (
  id              text primary key,
  firm_slug       text not null default 'tmp',
  file_no         text not null,
  case_type       text not null,
  phase           text,
  doi             date,
  sol             date,
  mmi             boolean,
  treating_status text,
  last_treat_kind text,
  last_treat_on   date,
  next_treat_kind text,
  next_treat_on   date,
  next_treat_where text,
  next_treat_time text,
  left_to_treat   text[] not null default '{}',
  records_in      int not null default 0,
  records_total   int not null default 0,
  last_human_on   date,
  last_human_who  text,
  last_human_how  text,
  keep_status     text,
  keep_step       int,
  pd_check_received boolean,
  client_pref     text not null default 'unspecified',
  demo            boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists turn_people (
  id          text primary key,
  matter_id   text not null references turn_matters(id) on delete cascade,
  role        text not null,
  first_name  text not null,
  last_name   text not null,
  phone       text,
  org         text
);

create table if not exists turn_providers (
  id          text primary key,
  matter_id   text not null references turn_matters(id) on delete cascade,
  name        text not null,
  kind        text not null,
  last_visit  date,
  cadence     text,
  on_file     boolean not null default true
);

create table if not exists turn_carriers (
  id                   text primary key,
  matter_id            text not null references turn_matters(id) on delete cascade,
  name                 text not null,
  claim_no             text not null,
  insured              text,
  adjuster_person_id   text,
  lor_mailed_on        date,
  lor_channel          text,
  lor_in_claim_notes   boolean,
  limits_requested_on  date,
  limits_in            boolean not null default false,
  last_offer           text
);

create table if not exists turn_liens (
  id        text primary key,
  matter_id text not null references turn_matters(id) on delete cascade,
  holder    text not null,
  status    text,
  amount    text
);

create table if not exists turn_send_log (
  id         text primary key,
  matter_id  text not null references turn_matters(id) on delete cascade,
  kind       text not null,
  status     text not null,
  channel    text,
  to_label   text,
  body       text,
  live       boolean not null default false,
  created_on date not null default current_date
);

create table if not exists turn_tasks (
  id         text primary key,
  matter_id  text not null references turn_matters(id) on delete cascade,
  owner      text not null,
  playbook   text not null,
  title      text not null,
  due        date,
  due_label  text,
  status     text not null default 'open'
);

create table if not exists turn_notes (
  id         text primary key,
  matter_id  text not null references turn_matters(id) on delete cascade,
  kind       text not null default 'file',
  party      text,
  author     text,
  body       text not null,
  created_on date not null default current_date
);

alter table turn_matters enable row level security;
alter table turn_people enable row level security;
alter table turn_providers enable row level security;
alter table turn_carriers enable row level security;
alter table turn_liens enable row level security;
alter table turn_send_log enable row level security;
alter table turn_tasks enable row level security;
alter table turn_notes enable row level security;

-- Signed-in staff may read TMP demo rows only. Anon has no access.
-- Writes stay service_role until a real PI desk ships. Never leads.
drop policy if exists turn_matters_select on turn_matters;
create policy turn_matters_select on turn_matters for select to authenticated
  using (demo = true and firm_slug = 'tmp');

drop policy if exists turn_people_select on turn_people;
create policy turn_people_select on turn_people for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_providers_select on turn_providers;
create policy turn_providers_select on turn_providers for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_carriers_select on turn_carriers;
create policy turn_carriers_select on turn_carriers for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_liens_select on turn_liens;
create policy turn_liens_select on turn_liens for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_send_log_select on turn_send_log;
create policy turn_send_log_select on turn_send_log for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_tasks_select on turn_tasks;
create policy turn_tasks_select on turn_tasks for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

drop policy if exists turn_notes_select on turn_notes;
create policy turn_notes_select on turn_notes for select to authenticated
  using (exists (select 1 from turn_matters m where m.id = matter_id and m.demo and m.firm_slug = 'tmp'));

grant select on turn_matters, turn_people, turn_providers, turn_carriers,
  turn_liens, turn_send_log, turn_tasks, turn_notes to authenticated;
grant all on turn_matters, turn_people, turn_providers, turn_carriers,
  turn_liens, turn_send_log, turn_tasks, turn_notes to service_role;

-- One fake file. Idempotent. Cannot collide with leads (different tables).
insert into turn_matters (
  id, firm_slug, file_no, case_type, phase, doi, sol, mmi, treating_status,
  last_treat_kind, last_treat_on, next_treat_kind, next_treat_on, next_treat_where,
  next_treat_time, left_to_treat, records_in, records_total, last_human_on,
  last_human_who, last_human_how, keep_status, keep_step, pd_check_received,
  client_pref, demo
) values (
  'tmp-1182', 'tmp', 'TMP-1182', 'MVA', 'Pre-lit / records',
  '2026-03-12', '2028-03-12', false, 'still treating',
  'PT', '2026-08-22', 'MRI', '2026-09-04', 'Desert Radiology', '09:20',
  array['MRI','ortho'], 4, 11, '2026-08-10', 'Maya Chen', 'VM',
  'gone-dark', 3, false, 'unspecified', true
) on conflict (id) do nothing;

insert into turn_people (id, matter_id, role, first_name, last_name, phone, org) values
  ('p-ortiz', 'tmp-1182', 'client', 'Samuel', 'Ortiz', '+1 702-555-0138', null),
  ('p-dana', 'tmp-1182', 'adjuster', 'Dana', 'Ruiz', '800-555-0142', 'State Farm'),
  ('p-maya', 'tmp-1182', 'staff', 'Maya', 'Chen', null, 'TMP'),
  ('p-webb', 'tmp-1182', 'insured', 'Marcus', 'Webb', null, null)
on conflict (id) do nothing;

insert into turn_providers (id, matter_id, name, kind, last_visit, cadence, on_file) values
  ('prov-valley', 'tmp-1182', 'Valley Chiro', 'chiro', null, null, true),
  ('prov-desert', 'tmp-1182', 'Desert Radiology', 'imaging', null, null, true),
  ('prov-pt', 'tmp-1182', 'PT', 'pt', '2026-08-22', null, true)
on conflict (id) do nothing;

insert into turn_carriers (
  id, matter_id, name, claim_no, insured, adjuster_person_id,
  lor_mailed_on, lor_channel, lor_in_claim_notes, limits_requested_on, limits_in
) values (
  'car-sf', 'tmp-1182', 'State Farm', '18-449201', 'Marcus Webb', 'p-dana',
  '2026-03-18', 'PostGrid', null, '2026-08-01', false
) on conflict (id) do nothing;
