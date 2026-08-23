-- ============================================================================
-- ClaimReach 0092: Motel 6 last-touch cadence
--
-- Seeds the run sheet (https://tmpm6.netlify.app/) into drip_rules +
-- escalation_ladder. Walker lives in src/lib/m6-cadence.ts — this file is
-- the DB copy of those same keys. Do not invent a second script list.
--
-- RLS note for Brett: drip_rules stays internal-write. Firm does not SELECT
-- drip_rules; templates are served from code via /api/m6/compose. New
-- communications columns inherit existing 0087 firm INSERT (manual m6 only).
-- enroll_drips_for_lead skips campaign-scoped rules so generic drips do not
-- fire Motel 6 scripts from an agent's line.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

-- Dedicated M6 line. Same sender number on every touch.
update retention_settings
   set sending_number = '+12562075828',
       cadence_initial_days = 14,
       cadence_steady_days = 30,
       cadence_switch_days = 90,
       updated_at = now()
 where campaign = 'motel6';

alter table retention_settings add column if not exists quiet_start time not null default '08:00';
alter table retention_settings add column if not exists quiet_end   time not null default '20:00';

-- Cadence metadata on the existing drip table. Generic rules keep campaign null.
alter table drip_rules add column if not exists campaign          text;
alter table drip_rules add column if not exists stage             text;
alter table drip_rules add column if not exists step_key          text;
alter table drip_rules add column if not exists delay_days        int;
alter table drip_rules add column if not exists approved_by_firm  boolean not null default false;
alter table drip_rules add column if not exists subject           text;
alter table drip_rules add column if not exists kind              text;
alter table drip_rules add column if not exists method_note       text;
alter table drip_rules add column if not exists fire_once         boolean not null default true;

create unique index if not exists drip_rules_campaign_step
  on drip_rules (campaign, step_key)
  where campaign is not null and step_key is not null;

-- Generic enroll / due view must never pick up motel6 walker rules.
create or replace view drips_due as
select e.id as enrollment_id, e.lead_id, e.firm_id, e.rule_id, e.next_due,
       r.name, r.channel, r.template, r.every_days, r.assign_to,
       r.campaign, r.step_key,
       l.claimant_name, l.phone, l.email
from drip_enrollments e
join drip_rules r on r.id = e.rule_id
join leads l on l.id = e.lead_id
where e.active and e.next_due <= current_date
  and r.campaign is null;


create or replace function enroll_drips_for_lead(p_lead uuid, p_firm uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into drip_enrollments (firm_id, lead_id, rule_id, next_due, active)
  select p_firm, p_lead, r.id, current_date + (r.every_days || ' days')::interval, true
  from drip_rules r
  where r.active
    and r.campaign is null
    and (r.firm_id is null or r.firm_id = p_firm)
    and not exists (select 1 from drip_enrollments e where e.lead_id = p_lead and e.rule_id = r.id);
end $$;

-- Outbound log fields. outcome stays the clock; send_status is delivery.
alter table communications add column if not exists send_status      text;
alter table communications add column if not exists blocked_reason   text;
alter table communications add column if not exists template_key     text;
alter table communications add column if not exists idempotency_key  text;
alter table communications add column if not exists actor_firm       text;

create unique index if not exists idx_comm_idempotency
  on communications (idempotency_key)
  where idempotency_key is not null;

comment on column communications.send_status is
  'queued|sent|failed|blocked|logged. Live send requires keys + gates + Josh approval.';
comment on column communications.actor_firm is
  'innovative|tmp. Both sides write the same timeline; this tags who.';

-- Ladder scripts match the run sheet. Timing already seeded in 0082.
alter table escalation_ladder add column if not exists script      text;
alter table escalation_ladder add column if not exists method_note text;
alter table escalation_ladder add column if not exists step_key    text;

update escalation_ladder set
  label = v.label, channel = v.channel, target = v.target,
  script = v.script, method_note = v.method_note, step_key = v.step_key
from (values
  (1,  'Voicemail',                         'call+sms', 'primary',       's06_s1_vm',
       'Hi [First], it is [Agent] from the team on your case. Nothing is wrong. Give me a call back at [number] whenever you get a chance.',
       'Never name the case type or the defendant. If monitored, no voicemail at all.'),
  (2,  'Call, different time of day',       'call',     'primary',       's06_s2_retry',
       'Hi [First], this is [Agent] again. I tried you the other day. Is now a better time?',
       'If step 1 was afternoon, step 2 is evening.'),
  (3,  'SMS',                               'sms',      'alternate',     's06_s3_sms',
       'Hi [First], this is [Agent] from the team on your case. I have not been able to reach you and I want to make sure nothing gets missed. Please call or text me at [number].',
       'Day 4 of the ladder.'),
  (4,  'Stable person, approved script',    'call',     'stable_person', 's06_s4_ec',
       'Hi, this is [Agent] calling from Turnbull Moak and Pendergrass. [First] listed you as someone who could get a message to her. I am not able to share anything about her matter, but if you speak with her, could you ask her to call me at [number]? It is important and there is nothing wrong.',
       'Approved script only. Confirm nothing, disclose nothing.'),
  (5,  'Social if release',                 'social',   'case_manager',  's06_s5_social',
       'Hi [First], this is [Agent]. I have been trying to reach you by phone. Please call or text me at [number]. Nothing is wrong — I just need to know how to find you.',
       'Requires the signed release.'),
  (6,  'Physical mail, plain envelope',     'mail',     'address',       's06_s6_letter',
       '[First], I have not been able to reach you by phone. Please call [Agent] at [number]. There is nothing wrong, I just need to know how to find you.',
       'Plain envelope, no firm letterhead. A postcard is a privacy risk.'),
  (7,  'Skip trace and custody search',     'trace',    'system',        's06_s7_trace',
       'Skip trace / TLO, county inmate search, state corrections, VINELink, obituary check. Log every number found as a new contact point. Never overwrite.',
       'Ops. Append every number.'),
  (8,  'Investigator memo to firm',         'memo',     'firm',          's06_s8_memo',
       'The file is on ladder step 8. Report the ladder step and the facts, never an opinion.',
       'Facts only. Firm decides spend.'),
  (9,  'At-risk report',                    'memo',     'firm',          's06_s9_report',
       'The file lands on the fact sheet at-risk report alongside its deadline.',
       'Terminal ladder step. Money stays off the firm file.')
) as v(step, label, channel, target, step_key, script, method_note)
where escalation_ladder.campaign = 'motel6' and escalation_ladder.step = v.step;

-- Seed motel6 drip rules. Bodies match src/lib/m6-cadence.ts. approved_by_firm
-- stays false until Josh. Staff can still see drafts in the picker.
insert into drip_rules (
  firm_id, name, channel, every_days, template, assign_to, active,
  campaign, stage, step_key, delay_days, approved_by_firm, subject, kind, method_note, fire_once
)
select f.id, s.name, s.channel, greatest(s.delay_days, 0), s.template, 'both', true,
       'motel6', s.stage, s.step_key, s.delay_days, false, s.subject, s.kind, s.method_note, s.fire_once
from firms f
cross join (values
  ('s01_arrival_sms',    '01', 'Day 0 arrival SMS',              'sms',   0,  'sms',   true,
   null,
   'Hi [First], this is [Agent] with the team working on your case with Turnbull Moak and Pendergrass. We will be calling you in the next few business days to confirm a few important details.' || E'\n\n' ||
   'If we catch you at a bad time, text this number back with a better day and time. We do need to reach you soon so nothing on your case gets held up.',
   'This is the number every future touch comes from. A reply with a callback time counts as contact.'),
  ('s01_arrival_email',  '01', 'Day 0 arrival email',            'email', 0,  'email', true,
   'Welcome, [First] — we need to confirm a few details',
   'Your case is with Turnbull Moak and Pendergrass and our team is handling the next step. Someone will call you in the next few business days.' || E'\n\n' ||
   'Before your file can move forward we have to confirm a few key details with you directly. It takes about twenty minutes.' || E'\n\n' ||
   'If a call is hard for you, text [number] with a better day and time and we will work around you.',
   'Same message as the SMS. Two channels, one expectation.'),
  ('s02_interview_call', '02', 'Secondary interview call',       'call_reminder', 1, 'call', true,
   null,
   'Hi [First], this is [Agent]. You should have gotten a text and an email from me. I am with the team working on your case, and I need about twenty minutes to confirm some details so your file can move. Is now alright, or is there a better time today?',
   'If this call does not connect, enter the Stage 06 ladder at step 1 immediately.'),
  ('s03_thanks_sms',     '03', 'Interview complete thank-you',   'sms',   0,  'sms',   true,
   null,
   'Thank you [First], we got everything we needed today. Your file is with the legal team now and nothing is needed from you right now.' || E'\n\n' ||
   'Save this number. It is [Agent] and it is how I will reach you. I will check in with you regularly so you always know where things stand.',
   'Fires when the interview is marked done. Heartbeat clock starts here.'),
  ('s04_day3_sms',       '04', 'Day 3 onboarding SMS',           'sms',   3,  'sms',   true,
   null,
   'Hi [First], [Agent] here. Nothing you need to do right now. Everything from our call is in and the team has it. I will check in with you next week.',
   'No ask. Keep the number saved and the name familiar.'),
  ('s04_day7_call',      '04', 'Day 7 onboarding call',          'call_reminder', 7, 'call', true,
   null,
   'Hi [First], [Agent] with your check in. Nothing is wrong. Anything change since we talked, phone, where you are staying? And is there anything you are wondering about that I can get an answer to?',
   'Legal questions route to the firm the same day.'),
  ('s04_day14_sms',      '04', 'Day 14 onboarding SMS',          'sms',  14,  'sms',   true,
   null,
   'Hi [First], [Agent] checking in. Nothing new to report yet, everything is moving the way it should. I just want you to know we are still here with you. Still your best number?',
   'Ask still-your-best-number.'),
  ('s04_day21_sms',      '04', 'Day 21 onboarding SMS',          'sms',  21,  'sms',   true,
   null,
   'Hi [First], quick one from [Agent]. Just reply with anything so I know you are good.',
   'A reply is two-way contact and resets the clock.'),
  ('s04_day30_call',     '04', 'Day 30 onboarding call',         'call_reminder', 30, 'call', true,
   null,
   'Hi [First], [Agent]. Your check in. I want to be straight with you about timing: cases like yours move slowly and there will be long stretches where I have nothing new to tell you. That is normal and it is not a bad sign. I am going to keep calling anyway so you always know we are still here. Let me re-confirm your numbers and where mail should go, then I will let you get on with your day.',
   'Set the long hold expectation out loud, once, here.'),
  ('s05_tminus3_sms',    '05', 'Heartbeat T-3 SMS',              'sms',  14,  'sms',   false,
   null,
   'Hi [First], [Agent]. I will give you a quick call Thursday for your check in. Let me know if a different day is better.',
   'Three days before the heartbeat call.'),
  ('s05_t0_call',        '05', 'Heartbeat T0 call',              'call_reminder', 14, 'call', false,
   null,
   'Hi [First], [Agent] with your check in. I do not have anything new for you yet, and that is normal for this kind of case. Everything is moving the way it should. I am calling so you know we are still here and still working. Still your best number? Anything change with where you are staying? Anything you need from me?',
   'Rotate morning / afternoon / evening. Do not invent progress.'),
  ('s05_t0_evening_sms', '05', 'Heartbeat T0 evening SMS',       'sms',  14,  'sms',   false,
   null,
   'Hi [First], [Agent]. Tried you today, no worries. Text me back when you get a chance so I know you are good.',
   'Only if the T0 call missed.'),
  ('s05_monthly_email',  '05', 'Heartbeat monthly email',        'email', 30, 'email', false,
   'Still with you, [First]',
   'Nothing new to report this month. This kind of case takes a long time and that is expected.' || E'\n\n' ||
   'Reach [Agent] any time at [number].',
   'Three lines. Monthly.')
) as s(step_key, stage, name, channel, delay_days, kind, fire_once, subject, template, method_note)
where f.slug = 'tmp'
on conflict (campaign, step_key) where campaign is not null and step_key is not null
do update set
  name = excluded.name, channel = excluded.channel, every_days = excluded.every_days,
  template = excluded.template, subject = excluded.subject, kind = excluded.kind,
  delay_days = excluded.delay_days, method_note = excluded.method_note,
  fire_once = excluded.fire_once, stage = excluded.stage, assign_to = 'both';

-- Enroll live TMP motel files into the walker rules they do not already have.
insert into drip_enrollments (firm_id, lead_id, rule_id, next_due, active)
select l.firm_id, l.id, r.id,
       (coalesce(l.retention_started_at, l.created_at)::date + (coalesce(r.delay_days, r.every_days, 0) || ' days')::interval)::date,
       true
from leads l
join firms f on f.id = l.firm_id and f.slug = 'tmp'
join drip_rules r on r.campaign = 'motel6' and r.active
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and not exists (
    select 1 from drip_enrollments e where e.lead_id = l.id and e.rule_id = r.id
  );

-- Today extras on the existing security_invoker view. Same TMP motel fence.
drop view if exists lead_contact_status;
drop view if exists lead_contact_health;

create view lead_contact_health
with (security_invoker = true) as
with last_two_way as (
  select lead_id, max(occurred_at) as at
  from communications where outcome = 'two_way' group by lead_id
),
last_touch as (
  select distinct on (lead_id)
         lead_id, occurred_at as at, channel, direction, send_status
  from communications
  order by lead_id, occurred_at desc nulls last
),
inbound_waiting as (
  select lead_id, true as waiting
  from communications
  where direction = 'inbound' and outcome is null
  group by lead_id
),
failed_send as (
  select lead_id, true as failed
  from communications
  where send_status = 'failed' or outcome = 'undelivered'
  group by lead_id
),
opted as (
  select lead_id, true as opted
  from contact_points
  where status = 'opted_out' and retired_at is null
  group by lead_id
),
live_points as (
  select lead_id,
         count(*) filter (where status <> 'dead' and status <> 'opted_out') as live_count,
         count(*) filter (where kind = 'person' and status <> 'dead')      as person_count,
         count(*) filter (where kind = 'address' and status <> 'dead')     as address_count
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
  l.campaign,
  l.case_type,
  l.archived_at,
  l.retention_owner,
  l.retention_stage,
  l.retention_paused_until,
  l.comms_monitored,
  t.at                                as last_two_way_at,
  lt.at                               as last_touch_at,
  lt.channel                          as last_touch_channel,
  lt.direction                        as last_touch_direction,
  nd.at                               as next_touch_due,
  coalesce(p.live_count, 0)           as live_contact_points,
  coalesce(p.person_count, 0)         as stable_people,
  coalesce(p.address_count, 0)        as addresses,
  coalesce(iw.waiting, false)         as inbound_waiting,
  coalesce(fs.failed, false)          as last_send_failed,
  coalesce(op.opted, false)           as opted_out,
  case when t.at is null
       then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
       else extract(day from now() - t.at)::int end   as days_since_contact,
  case when l.retention_paused_until is not null and l.retention_paused_until >= current_date
       then 0
       else greatest(
         (case when t.at is null
               then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::int
               else extract(day from now() - t.at)::int end) - l.retention_cadence_days, 0)
  end                                                  as days_overdue
from leads l
left join last_two_way t on t.lead_id = l.id
left join last_touch  lt on lt.lead_id = l.id
left join live_points  p on p.lead_id = l.id
left join next_due    nd on nd.lead_id = l.id
left join inbound_waiting iw on iw.lead_id = l.id
left join failed_send fs on fs.lead_id = l.id
left join opted op on op.lead_id = l.id
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and l.firm_id = (select id from firms where slug = 'tmp');

create view lead_contact_status
with (security_invoker = true) as
select h.*,
  case
    when h.retention_paused_until is not null and h.retention_paused_until >= current_date then 'paused'
    when h.opted_out then 'paused'
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

comment on view lead_contact_health is
  'm6 retention clock + last touch / replies / opt-out. security_invoker. TMP motel files only.';
comment on view lead_contact_status is
  'm6 health + ladder. security_invoker. TMP motel files only.';

revoke all on lead_contact_health from anon, public;
revoke all on lead_contact_status from anon, public;
grant select on lead_contact_health to authenticated, service_role;
grant select on lead_contact_status to authenticated, service_role;
