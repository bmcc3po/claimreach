-- ============================================================================
-- ClaimReach 0084: m6 view tenant fence (security_invoker + TMP motel WHERE)
--
-- 0082 created lead_contact_health / lead_contact_status as ordinary views.
-- Postgres views default to the owner's rights. These are owned by postgres,
-- so a SELECT on the view bypasses RLS on leads, communications,
-- contact_points, and call_schedule. They were also granted to `anon`.
--
-- This recreation:
--   * SET security_invoker so the caller's RLS applies
--   * Restricts the view to live TMP Motel 6 files
--     (campaign = 'motel6' OR case_type = 'motel_trafficking')
--     AND archived_at IS NULL
--     AND firm_id = firms.slug 'tmp'
--   * Exposes campaign, case_type, archived_at so app-side filters can
--     repeat the same predicate
--   * Revokes anon; authenticated and service_role may SELECT
--
-- Idempotent. Apply in the Supabase SQL editor. Do not re-run 0082.
-- ============================================================================

drop view if exists lead_contact_status;
drop view if exists lead_contact_health;

create view lead_contact_health
with (security_invoker = true) as
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
  l.campaign,
  l.case_type,
  l.archived_at,
  l.retention_owner,
  l.retention_stage,
  l.retention_paused_until,
  t.at                                as last_two_way_at,
  nd.at                               as next_touch_due,
  coalesce(p.live_count, 0)           as live_contact_points,
  coalesce(p.person_count, 0)         as stable_people,
  coalesce(p.address_count, 0)        as addresses,
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
left join live_points  p on p.lead_id = l.id
left join next_due    nd on nd.lead_id = l.id
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and l.firm_id = (select id from firms where slug = 'tmp');

create view lead_contact_status
with (security_invoker = true) as
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

comment on view lead_contact_health is
  'm6 retention clock. security_invoker. TMP motel files only.';
comment on view lead_contact_status is
  'm6 health + ladder. security_invoker. TMP motel files only.';

revoke all on lead_contact_health from anon, public;
revoke all on lead_contact_status from anon, public;
grant select on lead_contact_health to authenticated, service_role;
grant select on lead_contact_status to authenticated, service_role;
