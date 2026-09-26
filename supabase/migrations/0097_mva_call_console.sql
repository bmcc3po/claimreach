-- ============================================================================
-- 0097: MVA call console (phone first). Additive only. Safe before deploy.
--
-- intake_calls is the call session: one row per call, autosaved while the
-- agent works, closed by the dispo. New columns carry the dispo detail so
-- reports can count it without parsing free text.
--
-- call_dispo_reasons: the "why" buttons for E-sign sent, Call back and Not
-- interested. Disqualified reasons stay in dq_reasons (one definition).
-- Owners and admins add or retire rows; nothing in code has to change.
--
-- esign_templates / esign_submissions: DocuSeal. One template per campaign
-- per agreement key (TX, FL, OTHER). One submission row per agreement sent.
-- ============================================================================

alter table intake_calls add column if not exists campaign_id uuid references campaigns(id);
alter table intake_calls add column if not exists mode text;
alter table intake_calls add column if not exists status text not null default 'live';
alter table intake_calls add column if not exists dispo_reasons text[] not null default '{}';
alter table intake_calls add column if not exists callback_at timestamptz;
alter table intake_calls add column if not exists dispo_note text;
alter table intake_calls add column if not exists ended_at timestamptz;
alter table intake_calls add column if not exists updated_at timestamptz not null default now();
create index if not exists intake_calls_lead_idx on intake_calls (lead_id, created_at desc);
create index if not exists intake_calls_callback_idx on intake_calls (callback_at) where disposition = 'callback';
create index if not exists intake_calls_agent_idx on intake_calls (agent_id, created_at desc);

-- New DQ reasons the MVA lights produce. declined backs the Not interested
-- status (a disqualify status must carry a reason key); it stays out of the
-- general DQ pickers.
insert into dq_reasons (key, label, category, sort, active) values
  ('treatment_gap', '30+ day treatment gap', 'Medical', 26, true),
  ('no_coverage', 'No coverage anywhere', 'Eligibility', 36, true),
  ('low_limits', 'Fender bender, low limits', 'Representation', 58, true),
  ('declined', 'Declined, not interested', 'Contact', 78, false)
on conflict (key) do nothing;

create table if not exists call_dispo_reasons (
  dispo text not null check (dispo in ('esign', 'callback', 'ni')),
  key text not null,
  label text not null,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (dispo, key)
);
alter table call_dispo_reasons enable row level security;
drop policy if exists call_dispo_reasons_read on call_dispo_reasons;
create policy call_dispo_reasons_read on call_dispo_reasons for select using (is_internal());
drop policy if exists call_dispo_reasons_write on call_dispo_reasons;
create policy call_dispo_reasons_write on call_dispo_reasons for all
  using (exists (select 1 from app_users u where u.id = auth.uid() and u.role in ('owner', 'admin')))
  with check (exists (select 1 from app_users u where u.id = auth.uid() and u.role in ('owner', 'admin')));

insert into call_dispo_reasons (dispo, key, label, sort) values
  ('esign', 'tech_issue', 'Tech issue', 10),
  ('esign', 'phone_died', 'Phone died or dropped', 20),
  ('esign', 'spouse', 'Spouse or family', 30),
  ('esign', 'read_trust', 'Wants to read it (trust)', 40),
  ('esign', 'sign_later', 'Busy, will sign later', 50),
  ('esign', 'hung_up', 'Hung up', 60),
  ('esign', 'other_firm', 'Talking to another firm', 70),
  ('esign', 'other', 'Other', 90),
  ('callback', 'at_work', 'At work', 10),
  ('callback', 'driving', 'Driving', 20),
  ('callback', 'spouse', 'Wants spouse on', 30),
  ('callback', 'bad_connection', 'Bad connection', 40),
  ('callback', 'needs_papers', 'Needs her papers', 50),
  ('callback', 'other', 'Other', 90),
  ('ni', 'no_lawyer', 'Doesn''t want a lawyer', 10),
  ('ni', 'self', 'Handling it herself', 20),
  ('ni', 'not_hurt', 'Not hurt enough', 30),
  ('ni', 'hung_up', 'Hung up', 40),
  ('ni', 'other', 'Other', 90)
on conflict (dispo, key) do nothing;

create table if not exists esign_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  campaign_id uuid not null references campaigns(id),
  provider text not null default 'docuseal',
  key text not null,
  template_id text not null,
  name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (campaign_id, provider, key)
);
alter table esign_templates enable row level security;
drop policy if exists esign_templates_internal on esign_templates;
create policy esign_templates_internal on esign_templates for all using (is_internal()) with check (is_internal());

create table if not exists esign_submissions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  lead_id uuid not null references leads(id),
  call_id uuid references intake_calls(id),
  campaign_id uuid references campaigns(id),
  provider text not null default 'docuseal',
  template_key text,
  template_id text,
  submission_id text,
  client_submitter_id text,
  intake_submitter_id text,
  signer_name text,
  injured_name text,
  phone text,
  email text,
  via text,
  pax_index int,
  status text not null default 'sent',
  sign_url text,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  completed_pdf_path text,
  cert_pdf_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists esign_submissions_lead_idx on esign_submissions (lead_id, created_at desc);
create unique index if not exists esign_submissions_provider_sub_idx on esign_submissions (provider, submission_id) where submission_id is not null;
alter table esign_submissions enable row level security;
drop policy if exists esign_submissions_internal on esign_submissions;
create policy esign_submissions_internal on esign_submissions for all using (is_internal()) with check (is_internal());
