-- ============================================================================
-- ClaimReach — 0019: tabbed case workspace. Splits the crammed questionnaire into
-- Contact (+ emergency), Case Details, and a Retainer scaffold. Fields are named
-- for stable token autofill into the retainer later ({{contact.first_name}} etc).
-- ============================================================================

-- ---- Contact: split names + preferences ----
alter table leads add column if not exists first_name text;
alter table leads add column if not exists last_name text;
-- full_name is DERIVED (generated) from first/last so a single string is always available.
alter table leads add column if not exists full_name text
  generated always as (trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) stored;
alter table leads add column if not exists dob date;
alter table leads add column if not exists mail_addr1 text;
alter table leads add column if not exists mail_addr2 text;
alter table leads add column if not exists mail_city text;
alter table leads add column if not exists mail_state text;
alter table leads add column if not exists mail_zip text;
alter table leads add column if not exists preferred_language text;
alter table leads add column if not exists preferred_time text;
alter table leads add column if not exists preferred_contact_method text;
alter table leads add column if not exists client_time_zone text;
-- emergency contact: permission to discuss (the rest of EC already exists in 0001)
alter table leads add column if not exists ec_permission_to_discuss boolean;
alter table leads add column if not exists ec_mail text;

-- backfill split names from the legacy combined claimant_name (best effort)
update leads set
  first_name = coalesce(first_name, nullif(split_part(claimant_name, ' ', 1), '')),
  last_name  = coalesce(last_name, nullif(substring(claimant_name from position(' ' in claimant_name) + 1), ''))
where claimant_name is not null and (first_name is null or last_name is null);

-- ---- Case Details (case-management layer) ----
alter table leads add column if not exists marketing_source text;
alter table leads add column if not exists referring_attorney text;     -- free text
alter table leads add column if not exists handling_attorney text;      -- free text
alter table leads add column if not exists intake_agent_id uuid references app_users(id);
alter table leads add column if not exists qa_agent_id uuid references app_users(id);
alter table leads add column if not exists case_manager_id uuid references app_users(id);
alter table leads add column if not exists office_location text;
alter table leads add column if not exists case_rating text;            -- tier/rating free-form label
alter table leads add column if not exists case_tags text[] default '{}';
alter table leads add column if not exists call_outcome text;
alter table leads add column if not exists esign_date date;
alter table leads add column if not exists last_called_at timestamptz;
alter table leads add column if not exists case_summary text;
alter table leads add column if not exists case_description text;
create index if not exists idx_leads_tags on leads using gin (case_tags);
create index if not exists idx_leads_marketing on leads(marketing_source);

-- ---- Upcoming events for the file ----
create table if not exists case_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  title       text not null,
  event_at    timestamptz not null,
  notes       text,
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_case_events_lead on case_events(lead_id, event_at);
alter table case_events enable row level security;
drop policy if exists case_events_internal on case_events;
create policy case_events_internal on case_events for all using ( is_internal() ) with check ( is_internal() );

-- ---- Dropdown option lists (manageable later) ----
create table if not exists option_lists (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  list_key    text not null,            -- 'marketing_source' | 'language' | 'contact_method' | 'tier' | 'office'
  value       text not null,
  sort_order  int default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_option_lists_key on option_lists(list_key, sort_order);
alter table option_lists enable row level security;
drop policy if exists option_lists_read on option_lists;
create policy option_lists_read on option_lists for select using ( true );
drop policy if exists option_lists_manage on option_lists;
create policy option_lists_manage on option_lists for all using ( is_internal() ) with check ( is_internal() );

-- seed a few sensible defaults (id-stable, safe to re-run via not exists)
insert into option_lists (list_key, value, sort_order)
select v.list_key, v.value, v.sort_order from (values
  ('marketing_source','TV', 1),('marketing_source','Radio',2),('marketing_source','Social Media',3),('marketing_source','Referral',4),('marketing_source','Web Search',5),('marketing_source','Existing Client',6),('marketing_source','Other',7),
  ('language','English',1),('language','Spanish',2),('language','Other',3),
  ('contact_method','Phone',1),('contact_method','Text',2),('contact_method','Email',3),
  ('tier','A',1),('tier','B',2),('tier','C',3)
) as v(list_key, value, sort_order)
where not exists (select 1 from option_lists o where o.list_key = v.list_key and o.value = v.value);

-- ---- Retainer (generate from template -> eSign -> track) ----
create table if not exists retainer_templates (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  name        text not null,
  body        text not null,           -- template with {{tokens}}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table retainer_templates enable row level security;
drop policy if exists retainer_tpl_internal on retainer_templates;
create policy retainer_tpl_internal on retainer_templates for all using ( is_internal() ) with check ( is_internal() );

create table if not exists retainers (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  template_id   uuid references retainer_templates(id),
  status        text not null default 'draft',  -- draft | sent | viewed | signed | declined
  rendered_body text,                            -- tokens filled in at generate time
  sent_at       timestamptz,
  signed_at     timestamptz,
  provider_ref  text,                            -- eSign provider envelope id (future)
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_retainers_lead on retainers(lead_id);
alter table retainers enable row level security;
drop policy if exists retainers_internal on retainers;
create policy retainers_internal on retainers for all using ( is_internal() ) with check ( is_internal() );
