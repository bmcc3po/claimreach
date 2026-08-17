-- ============================================================================
-- ClaimReach 0082: Motel 6 retention bolt-on (m6.claimreach.com)
--
-- Design rules followed here:
--   * Reuse what exists. Touches live in `communications`, notes live in
--     `lead_notes`. No parallel tables for concepts we already define.
--   * No new enum values, no changes to firm_stage_only_guard. TMP users write
--     ONLY to the new tables plus lead_notes, granted by explicit RLS policies.
--     Leads stay stage-only for firm role, exactly as before.
--   * Everything derived (health, next due, ladder step) is computed at read
--     time in a view. Nothing is stored that can drift.
--   * Idempotent. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONTACT POINTS. The contact web. APPEND ONLY: never overwrite a number,
--    retire it. A dead number from last year is evidence for a skip trace.
-- ---------------------------------------------------------------------------
create table if not exists contact_points (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid not null references firms(id),
  lead_id       uuid not null references leads(id) on delete cascade,

  kind          text not null,        -- 'mobile'|'landline'|'email'|'social'|'address'|'person'
  value         text not null,        -- the number, address, handle
  label         text,                 -- 'primary mobile', 'mom', 'case mgr at Bridges'
  platform      text,                 -- social only: 'facebook'|'instagram'|'other'

  -- when kind = 'person' (stable person, case manager, sponsor, PO)
  person_name           text,
  relationship          text,
  permission_to_discuss boolean,
  contact_script        text,         -- what we are allowed to say to them

  is_primary    boolean not null default false,
  status        text not null default 'good',   -- 'good'|'shaky'|'dead'
  verified_at     timestamptz,        -- last time a human confirmed it
  last_success_at timestamptz,        -- last two-way contact through it
  last_attempt_at timestamptz,
  fail_count      int not null default 0,

  source_system text,                 -- 'lawruler'|'intake'|'skiptrace'|'manual'
  external_id   text,
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now(),
  retired_at    timestamptz
);
create index if not exists idx_cp_lead   on contact_points(lead_id) where retired_at is null;
create index if not exists idx_cp_live    on contact_points(lead_id, status) where retired_at is null;
create index if not exists idx_cp_value   on contact_points(value);
-- one row per lead+kind+value; a resend of the same number is an update, not a dupe
create unique index if not exists idx_cp_unique on contact_points(lead_id, kind, value);

alter table contact_points enable row level security;
drop policy if exists cp_internal on contact_points;
create policy cp_internal on contact_points for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cp_firm_read on contact_points;
create policy cp_firm_read on contact_points for select
  using ( firm_id = my_firm_id() );
drop policy if exists cp_firm_write on contact_points;
create policy cp_firm_write on contact_points for insert
  with check ( role_is_firm() and firm_id = my_firm_id() );
drop policy if exists cp_firm_update on contact_points;
create policy cp_firm_update on contact_points for update
  using ( role_is_firm() and firm_id = my_firm_id() )
  with check ( firm_id = my_firm_id() );

-- ---------------------------------------------------------------------------
-- 2. CALL SCHEDULE. "Call her Thursday 4pm" is a row, not a note somebody
--    has to read. Drives the Today screen.
-- ---------------------------------------------------------------------------
create table if not exists call_schedule (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid not null references firms(id),
  lead_id       uuid not null references leads(id) on delete cascade,

  due_at        timestamptz not null,
  kind          text not null default 'heartbeat',  -- 'heartbeat'|'onboarding'|'escalation'|'callback'|'ad_hoc'
  ladder_step   int,                                 -- escalation only, 1..9
  assigned_to   uuid references app_users(id),       -- null = shared pool
  note          text,                                -- "she said call after 6"

  status        text not null default 'open',        -- 'open'|'done'|'skipped'|'canceled'
  completed_at  timestamptz,
  completed_by  uuid references app_users(id),
  outcome       text,                                -- mirrors communications.outcome

  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_cs_due    on call_schedule(due_at) where status = 'open';
create index if not exists idx_cs_lead   on call_schedule(lead_id, due_at desc);
create index if not exists idx_cs_mine   on call_schedule(assigned_to, due_at) where status = 'open';
create index if not exists idx_cs_pool   on call_schedule(due_at) where status = 'open' and assigned_to is null;

alter table call_schedule enable row level security;
drop policy if exists cs_internal on call_schedule;
create policy cs_internal on call_schedule for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists cs_firm_read on call_schedule;
create policy cs_firm_read on call_schedule for select
  using ( firm_id = my_firm_id() );
drop policy if exists cs_firm_write on call_schedule;
create policy cs_firm_write on call_schedule for insert
  with check ( role_is_firm() and firm_id = my_firm_id() );
drop policy if exists cs_firm_update on call_schedule;
create policy cs_firm_update on call_schedule for update
  using ( role_is_firm() and firm_id = my_firm_id() )
  with check ( firm_id = my_firm_id() );

-- ---------------------------------------------------------------------------
-- 3. COMMUNICATIONS. Extend, do not duplicate. JustCall already writes here;
--    these columns turn a raw call log into a retention signal.
--    outcome is the load-bearing one: a 40-second call is either two-way
--    contact or a disconnect recording, and only a human knows which.
-- ---------------------------------------------------------------------------
alter table communications add column if not exists purpose          text;
alter table communications add column if not exists outcome          text;
alter table communications add column if not exists contact_point_id uuid references contact_points(id) on delete set null;
alter table communications add column if not exists ladder_step      int;
alter table communications add column if not exists logged_manually  boolean not null default false;
alter table communications add column if not exists dispositioned_by uuid references app_users(id);
alter table communications add column if not exists dispositioned_at timestamptz;

comment on column communications.purpose is
  'heartbeat|escalation|drip|onboarding|inbound|ad_hoc';
comment on column communications.outcome is
  'two_way|no_answer|voicemail|bad_number|delivered|undelivered. two_way is the only value that resets the retention clock.';

-- Fast lookup for the clock: last confirmed two-way contact per lead.
create index if not exists idx_comm_twoway
  on communications(lead_id, occurred_at desc) where outcome = 'two_way';
-- Undispositioned inbound calls: the one-tap prompt queue on the Today screen.
create index if not exists idx_comm_needs_disp
  on communications(lead_id, occurred_at desc)
  where channel = 'call' and outcome is null;

-- ---------------------------------------------------------------------------
-- 4. LEADS. Only what cannot be derived.
--    retention_owner is a tag, not an assignment: files sit in a shared pool
--    and anyone can claim one. Nulls are expected and surfaced, not hidden.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists retention_owner        uuid references app_users(id);
alter table leads add column if not exists retention_cadence_days int not null default 14;
alter table leads add column if not exists retention_started_at   timestamptz;
alter table leads add column if not exists retention_paused_until date;
alter table leads add column if not exists retention_pause_reason text;
alter table leads add column if not exists retention_stage        text not null default 'onboarding';
alter table leads add column if not exists source_system          text;
alter table leads add column if not exists lawruler_url           text;
alter table leads add column if not exists lawruler_created_at    timestamptz;

comment on column leads.retention_stage is
  'onboarding|heartbeat|escalation|at_risk|lost_contact|paused';
comment on column leads.retention_paused_until is
  'Incarceration, treatment, or client request. Suppresses the clock without marking the file unreachable.';

create index if not exists idx_leads_retention_owner on leads(retention_owner);
create index if not exists idx_leads_retention_stage on leads(retention_stage);

-- Emergency contact + alternate phone. `if not exists` so this is a no-op where
-- the columns already shipped, and a fix where they did not.
alter table leads add column if not exists ec_name                  text;
alter table leads add column if not exists ec_relationship          text;
alter table leads add column if not exists ec_phone                 text;
alter table leads add column if not exists ec_email                 text;
alter table leads add column if not exists ec_permission_to_discuss boolean;
alter table leads add column if not exists ec_message_script        text;
alter table leads add column if not exists phone_alt                text;

-- ---------------------------------------------------------------------------
-- 5. NOTES. Shared thread, both firms read and write. Reuses lead_notes.
--    `pinned` is for the standing facts a caller needs before dialing
--    ("do not leave voicemail", "call after 6").
-- ---------------------------------------------------------------------------
alter table lead_notes add column if not exists pinned    boolean not null default false;
alter table lead_notes add column if not exists source    text not null default 'app';
alter table lead_notes add column if not exists edited_at timestamptz;

alter table lead_notes enable row level security;
drop policy if exists notes_internal on lead_notes;
create policy notes_internal on lead_notes for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists notes_firm_read on lead_notes;
create policy notes_firm_read on lead_notes for select
  using ( firm_id = my_firm_id() );
drop policy if exists notes_firm_write on lead_notes;
create policy notes_firm_write on lead_notes for insert
  with check ( role_is_firm() and firm_id = my_firm_id() and author = auth.uid() );

-- ---------------------------------------------------------------------------
-- 6. TAGS. Assignment as tagging: tag someone else, or tag yourself onto a
--    file. A tag notifies. Unresolved tags surface on the Today screen.
-- ---------------------------------------------------------------------------
create table if not exists lead_tags (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references firms(id),
  lead_id      uuid not null references leads(id) on delete cascade,
  tagged_user  uuid not null references app_users(id),
  tagged_by    uuid references app_users(id),
  note_id      uuid references lead_notes(id) on delete set null,
  reason       text,
  resolved_at  timestamptz,
  resolved_by  uuid references app_users(id),
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_tags_user on lead_tags(tagged_user) where resolved_at is null;
create index if not exists idx_tags_lead on lead_tags(lead_id, created_at desc);

alter table lead_tags enable row level security;
drop policy if exists tags_internal on lead_tags;
create policy tags_internal on lead_tags for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists tags_firm_read on lead_tags;
create policy tags_firm_read on lead_tags for select
  using ( firm_id = my_firm_id() );
drop policy if exists tags_firm_write on lead_tags;
create policy tags_firm_write on lead_tags for insert
  with check ( role_is_firm() and firm_id = my_firm_id() );
drop policy if exists tags_firm_resolve on lead_tags;
create policy tags_firm_resolve on lead_tags for update
  using ( role_is_firm() and firm_id = my_firm_id() )
  with check ( firm_id = my_firm_id() );

-- ---------------------------------------------------------------------------
-- 7. ALERT RECIPIENTS. Who gets the daily at-risk digest. A table, not a
--    hardcoded list, so it survives someone leaving.
-- ---------------------------------------------------------------------------
create table if not exists retention_alert_recipients (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid references firms(id) on delete cascade,
  campaign   text not null default 'motel6',
  email      text not null,
  full_name  text,
  digest     boolean not null default true,   -- daily digest vs per-event
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_alert_rcpt on retention_alert_recipients(campaign, email);
alter table retention_alert_recipients enable row level security;
drop policy if exists rcpt_internal on retention_alert_recipients;
create policy rcpt_internal on retention_alert_recipients for all
  using ( is_internal() ) with check ( is_internal() );

-- ---------------------------------------------------------------------------
-- 8. CAMPAIGN SETTINGS. The auto-advance toggle and the sending number live
--    here. Sending number stays NULL until the dedicated Motel 6 line exists,
--    so nothing can accidentally text a client from an agent's personal line
--    and burn the number the run sheet tells them to save.
-- ---------------------------------------------------------------------------
create table if not exists retention_settings (
  campaign            text primary key,
  firm_id             uuid references firms(id) on delete cascade,
  sending_number      text,                          -- NULL = sending disabled
  auto_advance_ladder boolean not null default false,
  cadence_initial_days int not null default 14,
  cadence_steady_days  int not null default 30,
  cadence_switch_days  int not null default 90,      -- switch initial -> steady after this
  updated_at          timestamptz not null default now()
);
alter table retention_settings enable row level security;
drop policy if exists rset_internal on retention_settings;
create policy rset_internal on retention_settings for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists rset_firm_read on retention_settings;
create policy rset_firm_read on retention_settings for select
  using ( firm_id = my_firm_id() );

insert into retention_settings (campaign, firm_id, auto_advance_ladder)
select 'motel6', f.id, false from firms f where f.slug = 'tmp'
on conflict (campaign) do nothing;

-- ---------------------------------------------------------------------------
-- 9. THE ESCALATION LADDER, as data. Nine steps, matching the run sheet.
--    Config, not code, so the timing can move without a deploy.
-- ---------------------------------------------------------------------------
create table if not exists escalation_ladder (
  campaign     text not null default 'motel6',
  step         int not null,
  day_offset   int not null,       -- days after the missed touch
  label        text not null,
  channel      text not null,
  target       text not null,      -- who/what we are reaching for
  owner_hint   text,
  primary key (campaign, step)
);

insert into escalation_ladder (campaign, step, day_offset, label, channel, target, owner_hint) values
  ('motel6', 1,  0,  'Voicemail plus text',            'call+sms', 'primary',        'caller'),
  ('motel6', 2,  2,  'Call, different time of day',    'call',     'primary',        'caller'),
  ('motel6', 3,  4,  'Second number and email',        'sms+email','alternate',      'caller'),
  ('motel6', 4,  7,  'Stable person, approved script', 'call',     'stable_person',  'caller'),
  ('motel6', 5,  10, 'Case manager, sponsor, PO, social','call+social','case_manager','caller'),
  ('motel6', 6,  14, 'Physical mail, plain envelope',  'mail',     'address',        'ops'),
  ('motel6', 7,  18, 'Skip trace and custody search',  'trace',    'system',         'ops'),
  ('motel6', 8,  21, 'At risk, written memo to firm',  'memo',     'firm',           'lead'),
  ('motel6', 9,  30, 'Lost contact, deadline review',  'memo',     'firm',           'lead')
on conflict (campaign, step) do update set
  day_offset = excluded.day_offset, label = excluded.label,
  channel = excluded.channel, target = excluded.target, owner_hint = excluded.owner_hint;

alter table escalation_ladder enable row level security;
drop policy if exists ladder_read on escalation_ladder;
create policy ladder_read on escalation_ladder for select using ( auth.role() = 'authenticated' );
drop policy if exists ladder_write on escalation_ladder;
create policy ladder_write on escalation_ladder for all
  using ( is_internal() ) with check ( is_internal() );

-- ---------------------------------------------------------------------------
-- 10. DERIVED HEALTH. A view, not stored columns. Nothing here can drift out
--     of sync with the underlying touches, because there is nothing to sync.
-- ---------------------------------------------------------------------------
create or replace view lead_contact_health as
with last_two_way as (
  select lead_id, max(occurred_at) as at
  from communications where outcome = 'two_way' group by lead_id
),
live_points as (
  select lead_id,
         count(*) filter (where status <> 'dead')                        as live_count,
         count(*) filter (where kind = 'person' and status <> 'dead')    as person_count,
         count(*) filter (where kind = 'address' and status <> 'dead')   as address_count
  from contact_points where retired_at is null group by lead_id
),
next_due as (
  select lead_id, min(due_at) as at
  from call_schedule where status = 'open' group by lead_id
)
select
  l.id                                as lead_id,
  l.firm_id,
  l.lead_no,
  l.claimant_name,
  l.retention_owner,
  l.retention_stage,
  l.retention_paused_until,
  t.at                                as last_two_way_at,
  nd.at                               as next_touch_due,
  coalesce(p.live_count, 0)           as live_contact_points,
  coalesce(p.person_count, 0)         as stable_people,
  coalesce(p.address_count, 0)        as addresses,
  -- days since last confirmed two-way contact. Never contacted = days since
  -- the file started, which is the correct and alarming answer.
  case when t.at is null
       then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
       else extract(day from now() - t.at)::int end   as days_since_contact,
  -- days past the cadence window
  case when l.retention_paused_until is not null and l.retention_paused_until >= current_date
       then 0
       else greatest(
         (case when t.at is null
               then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
               else extract(day from now() - t.at)::int end) - l.retention_cadence_days, 0)
  end                                                  as days_overdue
from leads l
left join last_two_way t on t.lead_id = l.id
left join live_points  p on p.lead_id = l.id
left join next_due    nd on nd.lead_id = l.id;

-- Health bucket + current ladder step, derived from days_overdue.
create or replace view lead_contact_status as
select h.*,
  case
    when h.retention_paused_until is not null and h.retention_paused_until >= current_date then 'paused'
    when h.days_overdue = 0  then 'green'
    when h.days_overdue <= 7  then 'yellow'
    when h.days_overdue <= 21 then 'red'
    else 'lost'
  end as health,
  (select max(e.step) from escalation_ladder e
    where e.campaign = 'motel6' and e.day_offset <= h.days_overdue
      and h.days_overdue > 0)                                as ladder_step,
  (select min(e.step) from escalation_ladder e
    where e.campaign = 'motel6' and e.day_offset > h.days_overdue
      and h.days_overdue > 0)                                as next_ladder_step
from lead_contact_health h;

-- ---------------------------------------------------------------------------
-- 11. RESET THE CLOCK. When a touch is marked two_way, close any open call
--     and stamp the contact point that worked. One place, so the clock can
--     never disagree with the timeline.
-- ---------------------------------------------------------------------------
create or replace function on_two_way_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome = 'two_way' and (old is null or old.outcome is distinct from 'two_way') then
    update call_schedule
       set status = 'done', completed_at = now(), outcome = 'two_way'
     where lead_id = new.lead_id and status = 'open' and due_at <= now();

    if new.contact_point_id is not null then
      update contact_points
         set last_success_at = coalesce(new.occurred_at, now()),
             verified_at     = coalesce(new.occurred_at, now()),
             status          = 'good',
             fail_count      = 0
       where id = new.contact_point_id;
    end if;

    update leads
       set retention_stage = case
             when retention_stage in ('escalation','at_risk','lost_contact') then 'heartbeat'
             else retention_stage end
     where id = new.lead_id;
  end if;

  if new.outcome = 'bad_number' and new.contact_point_id is not null then
    update contact_points
       set status = 'dead', fail_count = fail_count + 1, last_attempt_at = now()
     where id = new.contact_point_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_two_way on communications;
create trigger trg_two_way after insert or update of outcome on communications
  for each row execute function on_two_way_contact();

-- ---------------------------------------------------------------------------
-- 12. PEOPLE. Firm access for the three leads on this project.
--     Emails lowercased: the provisioning trigger matches auth.users.email,
--     which Supabase stores lowercase. A capitalized row here never matches.
-- ---------------------------------------------------------------------------
insert into firm_access (email, firm_slug, role, full_name) values
  ('ymunoz@turnbullfirm.com', 'tmp', 'firm', 'Yvette Munoz'),
  ('jbauer@turnbullfirm.com', 'tmp', 'firm', 'Josh Bauer')
on conflict (email) do update set
  firm_slug = excluded.firm_slug, role = excluded.role, full_name = excluded.full_name;

insert into retention_alert_recipients (firm_id, campaign, email, full_name)
select f.id, 'motel6', e.email, e.name
from firms f, (values
  ('ymunoz@turnbullfirm.com', 'Yvette Munoz'),
  ('jbauer@turnbullfirm.com', 'Josh Bauer')
) as e(email, name)
where f.slug = 'tmp'
on conflict (campaign, email) do nothing;

-- Brett: add with the real address, then delete this comment.
-- insert into retention_alert_recipients (firm_id, campaign, email, full_name)
-- select id, 'motel6', 'brett@innovativeintake.com', 'Brett' from firms where slug = 'tmp'
-- on conflict (campaign, email) do nothing;

-- ---------------------------------------------------------------------------
-- 13. BACKFILL. Existing Motel 6 files get a contact point per known number
--     and email so the web is not empty on day one.
-- ---------------------------------------------------------------------------
insert into contact_points (firm_id, lead_id, kind, value, label, is_primary, source_system, verified_at)
select l.firm_id, l.id, 'mobile', l.phone, 'primary mobile', true, 'backfill', null
from leads l
where l.phone is not null and l.phone <> ''
on conflict (lead_id, kind, value) do nothing;

insert into contact_points (firm_id, lead_id, kind, value, label, is_primary, source_system)
select l.firm_id, l.id, 'email', l.email, 'primary email', true, 'backfill'
from leads l
where l.email is not null and l.email <> ''
on conflict (lead_id, kind, value) do nothing;

insert into contact_points (firm_id, lead_id, kind, value, label, person_name, relationship, permission_to_discuss, source_system)
select l.firm_id, l.id, 'person', coalesce(l.ec_phone, l.ec_name), 'emergency contact',
       l.ec_name, l.ec_relationship, l.ec_permission_to_discuss, 'backfill'
from leads l
where l.ec_name is not null and l.ec_name <> ''
on conflict (lead_id, kind, value) do nothing;

update leads set retention_started_at = coalesce(retention_started_at, created_at)
where retention_started_at is null;
