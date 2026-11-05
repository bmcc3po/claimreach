-- 0132: make the M6 Today queue fast again. APPLIED to production Nov 2 2026 (pasted in the Supabase SQL editor).
-- Renumbered from 0130 on Nov 4 2026: open PRs #199 and #204 already use 0130/0131. Already live; do not run it
-- again as part of a release (it is CREATE OR REPLACE of the same view, so a rerun changes nothing).
--
-- Symptom (Nov 2 2026): /m6 showed "Could not load the queue: canceling
-- statement due to statement timeout" and every gauge read 0.
--
-- Cause: lead_contact_health built its last_touch and inbound_waiting
-- pieces by scanning the WHOLE communications table (about 420k rows,
-- 418k of them unmatched July call logs with lead_id null) and only then
-- joining to the ~100 Motel 6 files. Because the view is security_invoker,
-- the RLS policies on communications (cr_inno_mva_staff_wall,
-- cr_pilot_password_wall, comm_internal/comm_firm) ran on every one of
-- those rows. That blew past the 8s authenticated statement_timeout.
--
-- Fix: same columns, same names, same types, same meaning. Each per-file
-- lookup is now a LATERAL subquery keyed on l.id, so Postgres only touches
-- the communications / contact_points / call_schedule rows that belong to
-- the Motel 6 files (idx_comm_lead, idx_comm_twoway, idx_comm_failed).
-- RLS still applies to every row read. security_invoker is restated on
-- purpose: CREATE OR REPLACE VIEW resets view options to whatever is in
-- the WITH clause, and dropping it would undo the 0084 hardening.

create or replace view public.lead_contact_health
with (security_invoker = true) as
select
  l.id as lead_id,
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
  t.at as last_two_way_at,
  lt.at as last_touch_at,
  lt.channel as last_touch_channel,
  lt.direction as last_touch_direction,
  nd.at as next_touch_due,
  coalesce(p.live_count, 0::bigint) as live_contact_points,
  coalesce(p.person_count, 0::bigint) as stable_people,
  coalesce(p.address_count, 0::bigint) as addresses,
  coalesce(iw.waiting, false) as inbound_waiting,
  coalesce(fs.failed, false) as last_send_failed,
  coalesce(op.opted, false) as opted_out,
  case
    when t.at is null then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::integer
    else extract(day from now() - t.at)::integer
  end as days_since_contact,
  case
    when l.retention_paused_until is not null and l.retention_paused_until >= current_date then 0
    else greatest(
      case
        when t.at is null then extract(day from now() - coalesce(l.retention_started_at, l.created_at))::integer
        else extract(day from now() - t.at)::integer
      end - l.retention_cadence_days, 0)
  end as days_overdue
from public.leads l
left join lateral (
  select max(c.occurred_at) as at
  from public.communications c
  where c.lead_id = l.id and c.outcome = 'two_way'
) t on true
left join lateral (
  select c.occurred_at as at, c.channel, c.direction
  from public.communications c
  where c.lead_id = l.id
  order by c.occurred_at desc nulls last
  limit 1
) lt on true
left join lateral (
  select
    count(*) filter (where cp.status <> 'dead' and cp.status <> 'opted_out') as live_count,
    count(*) filter (where cp.kind = 'person' and cp.status <> 'dead') as person_count,
    count(*) filter (where cp.kind = 'address' and cp.status <> 'dead') as address_count
  from public.contact_points cp
  where cp.lead_id = l.id and cp.retired_at is null
) p on true
left join lateral (
  select min(cs.due_at) as at
  from public.call_schedule cs
  where cs.lead_id = l.id and cs.status = 'open'
) nd on true
left join lateral (
  select true as waiting
  from public.communications c
  where c.lead_id = l.id and c.direction = 'inbound' and c.outcome is null
  limit 1
) iw on true
left join lateral (
  select true as failed
  from public.communications c
  where c.lead_id = l.id and (c.send_status = 'failed' or c.outcome = 'undelivered')
  limit 1
) fs on true
left join lateral (
  select true as opted
  from public.contact_points cp
  where cp.lead_id = l.id and cp.status = 'opted_out' and cp.retired_at is null
  limit 1
) op on true
where l.archived_at is null
  and (l.campaign = 'motel6' or l.case_type = 'motel_trafficking')
  and l.firm_id = (select firms.id from public.firms where firms.slug = 'tmp');
