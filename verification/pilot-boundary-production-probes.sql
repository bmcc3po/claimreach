-- Read-only post-apply verification. No file contents, names, SSNs, tokens or
-- contact data are returned. Uses the existing Lisa agent and active owner.
-- Expected: agent.self_profile=1, files>0, outside_pilot=0, outside_claims=0,
-- NV_FLAT/published_mva_forms>0, truncate_leads=false; owner.outside_pilot>0;
-- inactive.files=0. An inactive account may be absent (inactive.present=false).
begin read only;
set local statement_timeout='20s';
select set_config('cr.probe_agent',coalesce((select id::text from public.app_users
  where lower(email)='lisa@innovativeintake.com' and role::text='agent' and active=true limit 1),''),true);
select set_config('cr.probe_owner',coalesce((select id::text from public.app_users
  where role::text='owner' and active=true order by id limit 1),''),true);
select set_config('cr.probe_inactive',coalesce((select id::text from public.app_users
  where role::text in('admin','manager','agent','qa') and active=false order by id limit 1),''),true);
do $$ begin
  if current_setting('cr.probe_agent')='' or current_setting('cr.probe_owner')='' then
    raise exception 'Expected existing active Lisa agent and owner; choose verified identities before probing.';
  end if;
end $$;

select set_config('request.jwt.claim.sub',current_setting('cr.probe_agent'),true),
       set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.probe_agent'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('cr.probe_agent_result',jsonb_build_object(
  'self_profile',(select count(*) from public.app_users where id=auth.uid()),
  'files',(select count(*) from public.leads),
  'outside_pilot',(select count(*) from public.leads where campaign_id is distinct from public.cr_inno_mva_campaign_id()
    or firm_id is distinct from public.cr_inno_mva_firm_id() or case_type is distinct from 'mva' or archived_at is not null),
  'outside_claims',(select count(*) from public.claims where not public.cr_can_access_inno_mva_claim(id)),
  'NV_FLAT',(select count(*) from public.esign_templates where key='NV_FLAT'),
  'published_mva_forms',(select count(*) from public.intake_forms where claim_type='mva' and status='published'),
  'truncate_leads',has_table_privilege(current_user,'public.leads','TRUNCATE'),
  'is_owner',public.cr_is_owner()
)::text,true);
reset role;

select set_config('request.jwt.claim.sub',current_setting('cr.probe_owner'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.probe_owner'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('cr.probe_owner_result',jsonb_build_object(
  'self_profile',(select count(*) from public.app_users where id=auth.uid()),
  'files',(select count(*) from public.leads),
  'outside_pilot',(select count(*) from public.leads where campaign_id is distinct from public.cr_inno_mva_campaign_id()),
  'is_owner',public.cr_is_owner()
)::text,true);
reset role;

select set_config('request.jwt.claim.sub',current_setting('cr.probe_inactive'),true),
       set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.probe_inactive'),'role','authenticated')::text,true);
set local role authenticated;
select set_config('cr.probe_inactive_result',jsonb_build_object(
  'present',current_setting('cr.probe_inactive')<>'',
  'files',(select count(*) from public.leads),
  'is_owner',public.cr_is_owner()
)::text,true);
reset role;

select jsonb_build_object(
  'agent',current_setting('cr.probe_agent_result')::jsonb,
  'owner',current_setting('cr.probe_owner_result')::jsonb,
  'inactive',current_setting('cr.probe_inactive_result')::jsonb
) as boundary_verification;
rollback;
