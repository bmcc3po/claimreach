-- Read-only post-0123 check. Run as the migration administrator after applying
-- 0123. Returns counts and permission booleans, never claimant data or tokens.
-- Identity selection is explicit and fail-closed; no account or file is edited.
-- JWT settings below imitate existing users only inside this rolled-back session.
begin read only;
set local statement_timeout='30s';

do $$
declare agent_id uuid; flagged_id uuid; owner_id uuid; inactive_id uuid;
begin
  select u.id into strict agent_id from public.app_users u join auth.users a on a.id=u.id
    where lower(u.email)='lisa@innovativeintake.com' and u.role::text='agent' and u.active=true
      and a.raw_app_meta_data->>'must_change_password' is distinct from 'true';
  select u.id into strict flagged_id from public.app_users u join auth.users a on a.id=u.id
    where u.id='283d152f-d3d3-4964-a375-67ecb34e8956'::uuid and lower(u.email)='quea@claimreach.com'
      and u.role::text='agent' and u.active=true and a.raw_app_meta_data->>'must_change_password'='true';
  select id into owner_id from public.app_users where role::text='owner' and active=true order by id limit 1;
  select id into inactive_id from public.app_users where role::text in('admin','manager','agent','qa') and active=false order by id limit 1;
  if owner_id is null or inactive_id is null then
    raise exception 'Expected existing active owner and inactive internal account; verify identities before probing.';
  end if;
  perform set_config('cr.launch_agent',agent_id::text,true);
  perform set_config('cr.launch_flagged',flagged_id::text,true);
  perform set_config('cr.launch_owner',owner_id::text,true);
  perform set_config('cr.launch_inactive',inactive_id::text,true);
  perform set_config('cr.launch_baseline',jsonb_build_object(
    'files',(select count(*) from public.leads),
    'claims',(select count(*) from public.claims),
    'documents',(select count(*) from public.case_documents),
    'agreements',(select count(*) from public.esign_submissions)
  )::text,true);
end $$;

-- Inspect structure and effective ACLs without executing any write RPC.
do $$
declare expected integer; covered integer; unsafe integer; total integer; document_policies integer;
        acl jsonb; signature text; name text; entry jsonb; helper_ok boolean; mint_guard boolean;
begin
  select count(*) into expected from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'));
  select count(*) into covered from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_policy p on p.polrelid=c.oid
    where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
      and p.polname='cr_pilot_password_wall' and not p.polpermissive and p.polcmd='*'
      and p.polroles=array[(select oid from pg_catalog.pg_roles where rolname='authenticated')]
      and p.polqual is not null and p.polwithcheck is not null;
  select count(*) into unsafe from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and not c.relrowsecurity and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'));
  select count(*) into total from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and p.polname='cr_pilot_password_wall';
  select count(*) into document_policies from pg_catalog.pg_policy p
    where p.polrelid='public.case_documents'::regclass and not p.polpermissive
      and p.polroles=array[(select oid from pg_catalog.pg_roles where rolname='authenticated')]
      and ((p.polname='cr_pilot_document_index_insert' and p.polcmd='a' and p.polwithcheck is not null)
        or (p.polname='cr_pilot_document_index_update' and p.polcmd='w' and p.polqual is not null and p.polwithcheck is not null)
        or (p.polname='cr_pilot_document_index_delete' and p.polcmd='d' and p.polqual is not null));
  if expected=0 or covered<>expected or total<>expected or unsafe<>0 or document_policies<>3 then
    raise exception '0123 policy coverage failed: expected %, covered %, total %, no-RLS %, document guards %',expected,covered,total,unsafe,document_policies;
  end if;
  acl:='{}'::jsonb;
  foreach signature in array array['public.cr_pilot_password_required()','public.mint_lead_no(uuid)','public.enroll_drips_for_lead(uuid,uuid)'] loop
    name:=split_part(split_part(signature,'.',2),'(',1);
    select jsonb_build_object(
      'public_execute',exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')
    ) into entry from pg_catalog.pg_proc p where p.oid=signature::regprocedure;
    if (entry->>'public_execute')::boolean or (entry->>'anon_execute')::boolean
      or not (entry->>'service_execute')::boolean
      or (entry->>'authenticated_execute')::boolean is distinct from (name<>'enroll_drips_for_lead') then
      raise exception 'Unexpected effective RPC ACL: %',signature;
    end if;
    acl:=acl||jsonb_build_object(name,entry);
  end loop;
  select prosecdef and coalesce(proconfig @> array['search_path=""'],false) into helper_ok
    from pg_catalog.pg_proc where oid='public.cr_pilot_password_required()'::regprocedure;
  select position('if public.cr_pilot_password_required()' in pg_get_functiondef('public.mint_lead_no(uuid)'::regprocedure))>0 into mint_guard;
  if not helper_ok or not mint_guard then raise exception 'Trusted helper or lead-number password guard differs from reviewed 0123.'; end if;
  perform set_config('cr.launch_structure',jsonb_build_object(
    'exposed_tables',expected,'password_policies',covered,'total_password_policies',total,
    'exposed_without_rls',unsafe,'document_write_policies',document_policies,
    'trusted_helper_definer_empty_search_path',helper_ok,'mint_has_password_guard',mint_guard,'rpc_acl',acl
  )::text,true);
end $$;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('cr.launch_agent'),true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  -- A stale token flag must not trap Lisa after the trusted Auth flag is clear.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.launch_agent'),'role','authenticated','app_metadata',jsonb_build_object('must_change_password',true))::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('cr.launch_agent_result',jsonb_build_object(
    'self_profile',(select count(*) from public.app_users where id=auth.uid()),
    'password_required',public.cr_pilot_password_required(),
    'files',(select count(*) from public.leads),
    'claims',(select count(*) from public.claims),
    'documents',(select count(*) from public.case_documents),
    'outside_pilot',(select count(*) from public.leads where campaign_id is distinct from public.cr_inno_mva_campaign_id()
      or firm_id is distinct from public.cr_inno_mva_firm_id() or case_type is distinct from 'mva' or archived_at is not null),
    'outside_claims',(select count(*) from public.claims where not public.cr_can_access_inno_mva_claim(id)),
    'outside_documents',(select count(*) from public.case_documents where firm_id is distinct from public.cr_inno_mva_firm_id()
      or not public.cr_can_access_inno_mva_lead(lead_id)
      or (claim_id is null and not public.cr_pilot_legacy_matter_allowed(lead_id))
      or (claim_id is not null and not public.cr_claim_matches_lead(claim_id,lead_id))),
    'truncate_leads',has_table_privilege(current_user,'public.leads','TRUNCATE')
  )::text,true);
end $$;
reset role;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('cr.launch_flagged'),true);
  -- Forged user metadata and an old token flag cannot clear trusted Auth state.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.launch_flagged'),'role','authenticated',
    'app_metadata',jsonb_build_object('must_change_password',false),'user_metadata',jsonb_build_object('must_change_password',false))::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('cr.launch_flagged_result',jsonb_build_object(
    'password_required',public.cr_pilot_password_required(),
    'self_profile',(select count(*) from public.app_users where id=auth.uid()),
    'profiles',(select count(*) from public.app_users),
    'files',(select count(*) from public.leads),'claims',(select count(*) from public.claims),
    'documents',(select count(*) from public.case_documents),'agreements',(select count(*) from public.esign_submissions),
    'notes',(select count(*) from public.notes),'calls',(select count(*) from public.intake_calls),
    'campaigns',(select count(*) from public.campaigns),'statuses',(select count(*) from public.statuses)
  )::text,true);
end $$;
reset role;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('cr.launch_owner'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.launch_owner'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('cr.launch_owner_result',jsonb_build_object(
    'is_owner',public.cr_is_owner(),'password_required',public.cr_pilot_password_required(),
    'files',(select count(*) from public.leads),'claims',(select count(*) from public.claims),
    'documents',(select count(*) from public.case_documents),'agreements',(select count(*) from public.esign_submissions),
    'outside_pilot',(select count(*) from public.leads where campaign_id is distinct from public.cr_inno_mva_campaign_id())
  )::text,true);
end $$;
reset role;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('cr.launch_inactive'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cr.launch_inactive'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('cr.launch_inactive_result',jsonb_build_object(
    'files',(select count(*) from public.leads),'claims',(select count(*) from public.claims),
    'documents',(select count(*) from public.case_documents),'agreements',(select count(*) from public.esign_submissions)
  )::text,true);
end $$;
reset role;

-- Fail closed instead of displaying plausible-looking counts after a regression.
do $$
declare a jsonb:=current_setting('cr.launch_agent_result')::jsonb;
        q jsonb:=current_setting('cr.launch_flagged_result')::jsonb;
        o jsonb:=current_setting('cr.launch_owner_result')::jsonb;
        i jsonb:=current_setting('cr.launch_inactive_result')::jsonb;
        b jsonb:=current_setting('cr.launch_baseline')::jsonb; k text;
begin
  if (a->>'self_profile')::int<>1 or (a->>'password_required')::boolean or (a->>'files')::int=0
    or (a->>'outside_pilot')::int<>0 or (a->>'outside_claims')::int<>0 or (a->>'outside_documents')::int<>0
    or (a->>'truncate_leads')::boolean then raise exception 'Unflagged INNO staff scope failed.'; end if;
  if not (q->>'password_required')::boolean or (q->>'self_profile')::int<>1 or (q->>'profiles')::int<>1 then
    raise exception 'First-password own-profile exception failed.';
  end if;
  foreach k in array array['files','claims','documents','agreements','notes','calls','campaigns','statuses'] loop
    if (q->>k)::int<>0 then raise exception 'First-password account can read %.',k; end if;
  end loop;
  if not (o->>'is_owner')::boolean or (o->>'password_required')::boolean then raise exception 'Owner scope failed.'; end if;
  foreach k in array array['files','claims','documents','agreements'] loop
    if o->k is distinct from b->k then raise exception 'Owner count differs from privileged baseline for %.',k; end if;
    if (i->>k)::int<>0 then raise exception 'Inactive account can read %.',k; end if;
  end loop;
end $$;

select jsonb_build_object(
  'passed',true,'structure',current_setting('cr.launch_structure')::jsonb,
  'unflagged_staff',current_setting('cr.launch_agent_result')::jsonb,
  'first_password_staff',current_setting('cr.launch_flagged_result')::jsonb,
  'owner',current_setting('cr.launch_owner_result')::jsonb,
  'owner_matches_privileged_baseline',true,'inactive',current_setting('cr.launch_inactive_result')::jsonb
) as launch_boundary_verification;
rollback;
