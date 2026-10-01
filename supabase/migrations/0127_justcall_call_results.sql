-- Preserve JustCall's explicit call result. Duration is not an answer state:
-- an unanswered ring can have a duration and a short answer can be missed by
-- timing-based guesses. Nullable means the provider did not supply a result.
alter table public.communications
  add column if not exists provider_call_result text
  check (provider_call_result in ('answered', 'unanswered', 'busy', 'voicemail', 'failed'));

-- Completed standard and Sales Dialer webhooks carry an explicit result.
-- Match by provider call SID; leave other older records unclassified rather
-- than inventing a no-answer from duration or a preliminary event.
-- Only the INNO MVA pilot uses this queue. Production has hundreds of
-- thousands of unrelated historical calls; do not update those records.
with target_calls as materialized (
  select c.id, c.call_sid
  from public.communications c
  join public.leads l on l.id = c.lead_id
  join public.campaigns cp on cp.id = l.campaign_id
  where cp.name = 'INNO MVA' and cp.case_type = 'mva'
    and c.call_sid is not null and c.channel = 'call'
    and c.provider_call_result is null
), provider_results as (
  select distinct on (payload->'data'->>'call_sid')
    payload->'data'->>'call_sid' as call_sid,
    case lower(replace(coalesce(payload->'data'->'call_info'->>'type', ''), ' ', '_'))
      when 'answered' then 'answered'
      when 'outgoing_answered_call' then 'answered'
      when 'outgoing_human_answered' then 'answered'
      when 'unanswered' then 'unanswered'
      when 'no_answer' then 'unanswered'
      when 'outgoing_unanswered_call' then 'unanswered'
      when 'busy' then 'busy'
      when 'voicemail' then 'voicemail'
      when 'outgoing_machine_answered' then 'voicemail'
      when 'failed' then 'failed'
      when 'outgoing_failed_call' then 'failed'
      when 'outgoing_restricted_call' then 'failed'
      when 'outgoing_blocked_call' then 'failed'
      when 'outgoing_cancelled_call' then 'failed'
      when 'outgoing_abandoned_call' then 'failed'
      else null
    end as result
  from public.webhook_events e
  join target_calls t on t.call_sid = e.payload->'data'->>'call_sid'
  where e.event_type in ('justcall.call.completed', 'justcall.sd.call_completed')
  order by e.payload->'data'->>'call_sid', e.created_at desc
)
update public.communications c
set provider_call_result = p.result
from provider_results p
join target_calls t on t.call_sid = p.call_sid
where c.id = t.id
  and c.provider_call_result is null
  and p.result is not null;

-- The Desk reads one bounded row per visible file, rather than downloading
-- every call each time it refreshes. The invoker's lead/communications RLS
-- applies; this view contains no phone number or communication body.
create or replace view public.cr_mva_dial_summary
with (security_invoker = true) as
select l.id as lead_id,
  z.zone as local_zone,
  coalesce(p.shared, false) as shared_phone,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail'))::int as total_dials,
  min(c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')) as first_call_at,
  max(c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')) as last_call_at,
  coalesce(array_agg(c.occurred_at order by c.occurred_at) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')), '{}') as dial_times,
  coalesce((select array_agg(s.occurred_at order by s.occurred_at)
    from public.communications s where s.lead_id = l.id and s.direction = 'outbound'
      and s.channel = 'sms' and s.phone_norm = l.phone_norm and s.occurred_at >= l.created_at), '{}') as outbound_sms_times,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and z.zone is not null
    and (c.occurred_at at time zone z.zone)::date = (now() at time zone z.zone)::date)::int as dials_today,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result in ('unanswered', 'busy', 'voicemail'))::int as unanswered_dials,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result = 'answered')::int as answered_dials,
  count(c.id) filter (where c.direction = 'outbound' and c.channel in ('call', 'voicemail')
    and c.provider_call_result is null)::int as unverified_dials
from public.leads l
cross join lateral (select case l.client_time_zone
  when 'Eastern' then 'America/New_York'
  when 'Central' then 'America/Chicago'
  when 'Mountain' then null
  when 'Pacific' then 'America/Los_Angeles'
  when 'Alaska' then 'America/Anchorage'
  when 'Hawaii' then 'Pacific/Honolulu'
  when 'America/New_York' then 'America/New_York'
  when 'America/Chicago' then 'America/Chicago'
  when 'America/Denver' then 'America/Denver'
  when 'America/Phoenix' then 'America/Phoenix'
  when 'America/Los_Angeles' then 'America/Los_Angeles'
  when 'America/Anchorage' then 'America/Anchorage'
  when 'Pacific/Honolulu' then 'Pacific/Honolulu'
  else null end as zone) z
cross join lateral (select exists(select 1 from public.leads other
  where other.phone_norm = l.phone_norm and other.id <> l.id and other.archived_at is null) as shared) p
left join public.communications c on c.lead_id = l.id
  and c.phone_norm = l.phone_norm and c.occurred_at >= l.created_at
where public.is_internal()
group by l.id, z.zone, p.shared;

revoke all on public.cr_mva_dial_summary from public, anon;
grant select on public.cr_mva_dial_summary to authenticated, service_role;
