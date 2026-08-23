-- ============================================================================
-- ClaimReach 0093: lead_contact_health joins from the motel lead set
--
-- 0092 already ran. Its comms / contact_points / call_schedule CTEs scanned
-- the full tables (304k communications rows) and timed out /m6 Today.
-- Do not rewrite 0092. This file is the later migration.
--
-- Already applied in production (gvtafevoisfxcfkugvoj) as
-- index_failed_comms_and_join_from_motel. Same output columns as 0092.
-- security_invoker stays true. lead_contact_status is recreated unchanged
-- so it keeps selecting h.*.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

create index if not exists idx_comm_failed
  on public.communications (lead_id)
  where send_status = 'failed' or outcome = 'undelivered';

drop view if exists lead_contact_status;
drop view if exists lead_contact_health;

create view lead_contact_health
with (security_invoker = true) as
with motel as (
  select l.*
  from leads l
  where l.archived_at is null
    and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
    and l.firm_id = (select id from firms where slug = 'tmp')
),
last_two_way as (
  select c.lead_id, max(c.occurred_at) as at
  from motel m
  join communications c on c.lead_id = m.id
  where c.outcome = 'two_way'
  group by c.lead_id
),
last_touch as (
  select distinct on (c.lead_id)
         c.lead_id, c.occurred_at as at, c.channel, c.direction, c.send_status
  from motel m
  join communications c on c.lead_id = m.id
  order by c.lead_id, c.occurred_at desc nulls last
),
inbound_waiting as (
  select c.lead_id, true as waiting
  from motel m
  join communications c on c.lead_id = m.id
  where c.direction = 'inbound' and c.outcome is null
  group by c.lead_id
),
failed_send as (
  select c.lead_id, true as failed
  from motel m
  join communications c on c.lead_id = m.id
  where c.send_status = 'failed' or c.outcome = 'undelivered'
  group by c.lead_id
),
opted as (
  select cp.lead_id, true as opted
  from motel m
  join contact_points cp on cp.lead_id = m.id
  where cp.status = 'opted_out' and cp.retired_at is null
  group by cp.lead_id
),
live_points as (
  select cp.lead_id,
         count(*) filter (where cp.status <> 'dead' and cp.status <> 'opted_out') as live_count,
         count(*) filter (where cp.kind = 'person' and cp.status <> 'dead')      as person_count,
         count(*) filter (where cp.kind = 'address' and cp.status <> 'dead')     as address_count
  from motel m
  join contact_points cp on cp.lead_id = m.id
  where cp.retired_at is null
  group by cp.lead_id
),
next_due as (
  select cs.lead_id, min(cs.due_at) as at
  from motel m
  join call_schedule cs on cs.lead_id = m.id
  where cs.status = 'open'
  group by cs.lead_id
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
from motel l
left join last_two_way t on t.lead_id = l.id
left join last_touch  lt on lt.lead_id = l.id
left join live_points  p on p.lead_id = l.id
left join next_due    nd on nd.lead_id = l.id
left join inbound_waiting iw on iw.lead_id = l.id
left join failed_send fs on fs.lead_id = l.id
left join opted op on op.lead_id = l.id;

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
