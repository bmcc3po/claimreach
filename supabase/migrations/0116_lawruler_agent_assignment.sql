-- Restore the source assignee on existing INNO MVA files. Only a single active
-- exact display-name match may be assigned; preserve every manual assignment.
begin;

with active_names as (
  select lower(regexp_replace(trim(full_name), '[^a-zA-Z0-9@.]+', ' ', 'g')) as source_name,
         min(id::text)::uuid as user_id,
         count(*) as matches
  from public.app_users
  where active = true and role::text in ('agent', 'manager', 'admin', 'owner', 'qa')
    and nullif(trim(full_name), '') is not null
  group by 1
)
update public.leads l set assigned_agent = n.user_id
from active_names n
where n.matches = 1
  and l.assigned_agent is null and l.archived_at is null
  and l.campaign_id = public.cr_inno_mva_campaign_id()
  and l.firm_id = public.cr_inno_mva_firm_id()
  and lower(regexp_replace(trim(l.vendor_fields->>'assignee'), '[^a-zA-Z0-9@.]+', ' ', 'g')) = n.source_name;

commit;
