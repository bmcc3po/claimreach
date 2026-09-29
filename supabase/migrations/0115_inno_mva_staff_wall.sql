-- Pilot access boundary: internal staff other than the owner may work only
-- active INNO MVA files. Firm and partner policies keep their own boundaries.
-- Apply atomically before giving agents production access. Service-role
-- ingestion, provider webhooks and scheduled jobs bypass RLS as before.
begin;

create or replace function public.cr_is_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.active = true and u.role::text = 'owner'
  );
$$;

create or replace function public.cr_inno_mva_campaign_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then max(c.id) else null end
  from public.campaigns c join public.firms f on f.id = c.firm_id
  where c.name = 'INNO MVA' and c.case_type = 'mva'
    and c.active = true and f.slug = 'tmp';
$$;

create or replace function public.cr_inno_mva_firm_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select c.firm_id from public.campaigns c
  where c.id = public.cr_inno_mva_campaign_id();
$$;

create or replace function public.cr_can_access_inno_mva_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id and l.archived_at is null
      and l.campaign_id = public.cr_inno_mva_campaign_id()
      and l.firm_id = public.cr_inno_mva_firm_id()
  );
$$;

create or replace function public.cr_can_access_inno_mva_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.claims c
    where c.id = p_claim_id
      and c.campaign_id = public.cr_inno_mva_campaign_id()
      and c.firm_id = public.cr_inno_mva_firm_id()
      and public.cr_can_access_inno_mva_lead(c.lead_id)
  );
$$;

revoke all on function public.cr_is_owner() from public;
revoke all on function public.cr_inno_mva_campaign_id() from public;
revoke all on function public.cr_inno_mva_firm_id() from public;
revoke all on function public.cr_can_access_inno_mva_lead(uuid) from public;
revoke all on function public.cr_can_access_inno_mva_claim(uuid) from public;
grant execute on function public.cr_is_owner() to authenticated, service_role;
grant execute on function public.cr_inno_mva_campaign_id() to authenticated, service_role;
grant execute on function public.cr_inno_mva_firm_id() to authenticated, service_role;
grant execute on function public.cr_can_access_inno_mva_lead(uuid) to authenticated, service_role;
grant execute on function public.cr_can_access_inno_mva_claim(uuid) to authenticated, service_role;

-- A restrictive policy ANDs with every existing permissive policy. This is
-- crucial: adding one more permissive scoped policy would leave is_internal()
-- granting the entire database. Default for non-owner staff is no rows.
do $$
declare t record; predicate text; column_type text;
begin
  for t in
    select c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and has_table_privilege('authenticated', c.oid, 'SELECT')
  loop
    predicate := 'false';
    if t.table_name = 'leads' then
      predicate := 'archived_at is null and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'claims' then
      predicate := 'public.cr_can_access_inno_mva_lead(lead_id) and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'campaigns' then
      predicate := 'id = public.cr_inno_mva_campaign_id()';
    elsif t.table_name = 'firms' then
      predicate := 'id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'app_users' then
      predicate := 'id = auth.uid() or (role::text = ''owner'' and active = true)';
    elsif t.table_name = 'routing_rules' then
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and (case_type = ''mva'' or case_type is null)';
    elsif t.table_name in ('statuses', 'dq_reasons', 'call_dispo_reasons') then
      predicate := 'true';
    else
      select data_type into column_type from information_schema.columns
       where table_schema = 'public' and table_name = t.table_name and column_name = 'lead_id';
      if column_type = 'uuid' then
        predicate := 'public.cr_can_access_inno_mva_lead(lead_id)';
        if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'claim_id' and data_type = 'uuid') then
          predicate := predicate || ' and (claim_id is null or public.cr_can_access_inno_mva_claim(claim_id))';
        end if;
      elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'claim_id' and data_type = 'uuid') then
        predicate := 'public.cr_can_access_inno_mva_claim(claim_id)';
      elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.table_name and column_name = 'campaign_id' and data_type = 'uuid') then
        predicate := 'campaign_id = public.cr_inno_mva_campaign_id()';
      end if;
    end if;
    execute format('drop policy if exists cr_inno_mva_staff_wall on public.%I', t.table_name);
    execute format(
      'create policy cr_inno_mva_staff_wall on public.%I as restrictive for all to authenticated using (not public.is_internal() or public.cr_is_owner() or (%s)) with check (not public.is_internal() or public.cr_is_owner() or (%s))',
      t.table_name, predicate, predicate
    );
  end loop;
end $$;

-- Two callable SECURITY DEFINER functions can bypass row policies. Number
-- minting must be pinned to the pilot firm, and the Motel 6 touch RPC must
-- refuse non-owner internal accounts. Firm portal users retain their existing
-- Motel permissions.
create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nxt bigint; pfx text;
begin
  if auth.role() <> 'service_role' and not public.is_internal() then
    raise exception 'Only internal staff may mint a lead number';
  end if;
  if auth.role() <> 'service_role' and not public.cr_is_owner()
     and p_firm is distinct from public.cr_inno_mva_firm_id() then
    raise exception 'This campaign is not available to staff.';
  end if;
  select coalesce(lead_prefix, 'CR') into pfx from public.firms where id = p_firm;
  if pfx is null then pfx := 'CR'; end if;
  nxt := nextval('public.global_lead_seq');
  return pfx || '-' || nxt::text;
end $$;

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.m6_log_touch(uuid,text,text,text,uuid,text)'::regprocedure);
  if position('if uid is null then' in definition) = 0 then
    raise exception 'Motel touch guard could not be installed; function changed. No policies were committed.';
  end if;
  definition := replace(definition, 'if uid is null then',
    'if public.is_internal() and not public.cr_is_owner() then
       raise exception ''Only the owner may work Motel 6 during the INNO MVA pilot.'';
     end if;
     if uid is null then');
  execute definition;
end $$;
commit;
