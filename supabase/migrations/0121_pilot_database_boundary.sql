-- The INNO MVA pilot is a database boundary, not only navigation filtering.
-- Additive replacement for the unapplied 0115. No campaign data, user roles,
-- templates, signed documents or tenant assignments are changed.
-- Existing permissive policies still govern owner, firm and partner access.
begin;

create or replace function public.cr_is_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users where id = auth.uid()
    and active = true and role::text = 'owner');
$$;

-- Includes disabled staff: deactivation must not turn an internal account into
-- an external account that bypasses the pilot restriction.
create or replace function public.cr_is_internal_account()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users where id = auth.uid()
    and role::text in ('owner','admin','manager','agent','qa'));
$$;

create or replace function public.cr_inno_mva_campaign_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then (array_agg(c.id))[1] else null end
  from public.campaigns c join public.firms f on f.id = c.firm_id
  where c.name = 'INNO MVA' and c.case_type = 'mva' and c.active = true and f.slug = 'tmp';
$$;
create or replace function public.cr_inno_mva_firm_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select firm_id from public.campaigns where id = public.cr_inno_mva_campaign_id();
$$;
create or replace function public.cr_can_access_inno_mva_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.leads where id = p_lead_id and archived_at is null
    and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()
    and case_type = 'mva');
$$;
create or replace function public.cr_can_access_inno_mva_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.claims where id = p_claim_id and claim_type = 'mva'
    and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()
    and public.cr_can_access_inno_mva_lead(lead_id));
$$;
create or replace function public.cr_claim_matches_lead(p_claim_id uuid, p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.claims where id = p_claim_id and lead_id = p_lead_id
    and public.cr_can_access_inno_mva_claim(id));
$$;
create or replace function public.cr_pilot_legacy_matter_allowed(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  -- Count ALL siblings, including claims hidden from the caller by RLS.
  select count(*)=1 and coalesce(bool_and(public.cr_can_access_inno_mva_claim(id)),false)
  from public.claims where lead_id=p_lead_id;
$$;
create or replace function public.cr_pilot_signable_allowed(p_lead_id uuid, p_audit jsonb)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare claim_text text := p_audit #>> '{emergency,claim_id}';
        campaign_text text := p_audit #>> '{emergency,campaign_id}';
begin
  if not public.cr_can_access_inno_mva_lead(p_lead_id) then return false; end if;
  if campaign_text is not null and campaign_text is distinct from public.cr_inno_mva_campaign_id()::text then return false; end if;
  if claim_text is null then return public.cr_pilot_legacy_matter_allowed(p_lead_id); end if;
  if claim_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.cr_claim_matches_lead(claim_text::uuid,p_lead_id);
end $$;

do $$
declare fn regprocedure;
begin
  foreach fn in array array[
    'public.cr_is_owner()'::regprocedure, 'public.cr_is_internal_account()'::regprocedure,
    'public.cr_inno_mva_campaign_id()'::regprocedure, 'public.cr_inno_mva_firm_id()'::regprocedure,
    'public.cr_can_access_inno_mva_lead(uuid)'::regprocedure,
    'public.cr_can_access_inno_mva_claim(uuid)'::regprocedure,
    'public.cr_claim_matches_lead(uuid,uuid)'::regprocedure,
    'public.cr_pilot_legacy_matter_allowed(uuid)'::regprocedure,
    'public.cr_pilot_signable_allowed(uuid,jsonb)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  if public.cr_inno_mva_campaign_id() is null then
    raise exception 'Expected exactly one active TMP INNO MVA campaign. No boundary changes committed.';
  end if;
end $$;

-- Restrictive policies AND with existing policies. Never add another broad
-- permissive grant. Include write-only tables and reject unprotected tables.
do $$
declare t record; predicate text; bypass text; scoped_to_file boolean; col_type text;
begin
  bypass := 'not public.cr_is_internal_account() or public.cr_is_owner()';
  for t in
    select c.oid, c.relname as table_name, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
  loop
    if not t.relrowsecurity then
      raise exception 'Exposed table % has no RLS. Review before applying this boundary.', t.table_name;
    end if;
    predicate := 'false';
    scoped_to_file := false;
    if t.table_name = 'leads' then
      predicate := 'archived_at is null and case_type = ''mva'' and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'claims' then
      predicate := 'claim_type = ''mva'' and public.cr_can_access_inno_mva_lead(lead_id) and campaign_id = public.cr_inno_mva_campaign_id() and firm_id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'campaigns' then
      predicate := 'id = public.cr_inno_mva_campaign_id()';
    elsif t.table_name = 'firms' then
      predicate := 'id = public.cr_inno_mva_firm_id()';
    elsif t.table_name = 'app_users' then
      predicate := 'id = auth.uid() or (role::text = ''owner'' and active = true)';
    elsif t.table_name = 'routing_rules' then
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and (case_type = ''mva'' or case_type is null)';
    elsif t.table_name = 'intake_forms' then
      -- Keep the published master form used by the live app. Other case types,
      -- other firms' forms and draft forms are not pilot data.
      predicate := 'claim_type = ''mva'' and status = ''published'' and (firm_id is null or firm_id = public.cr_inno_mva_firm_id()) and (campaign_id is null or campaign_id = public.cr_inno_mva_campaign_id())';
    elsif t.table_name = 'signable_documents' then
      -- This legacy table stores emergency matter identity in audit JSON.
      predicate := 'firm_id = public.cr_inno_mva_firm_id() and public.cr_pilot_signable_allowed(lead_id,audit)';
    elsif t.table_name = 'case_type_registry' then
      predicate := 'key = ''mva''';
    elsif t.table_name in ('statuses','dq_reasons','call_dispo_reasons') then
      predicate := 'true';
    else
      select data_type into col_type from information_schema.columns
        where table_schema = 'public' and table_name = t.table_name and column_name = 'lead_id';
      if col_type = 'uuid' then
        scoped_to_file := true;
        predicate := 'public.cr_can_access_inno_mva_lead(lead_id)';
        if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='claim_id' and data_type='uuid') then
          if t.table_name in ('esign_submissions','retainers','case_documents','firm_deliveries','intake_calls','qa_reviews','grievous_reviews','report_cards','audit_log') then
            predicate := predicate || ' and ((claim_id is null and public.cr_pilot_legacy_matter_allowed(lead_id)) or public.cr_claim_matches_lead(claim_id,lead_id))';
          else
            -- Contacts, communications and ordinary notes are intentionally
            -- lead-level. A stamped claim must still match the pilot matter.
            predicate := predicate || ' and (claim_id is null or public.cr_claim_matches_lead(claim_id,lead_id))';
          end if;
        end if;
      elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='claim_id' and data_type='uuid') then
        scoped_to_file := true;
        predicate := 'public.cr_can_access_inno_mva_claim(claim_id)';
      elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='campaign_id' and data_type='uuid') then
        predicate := 'campaign_id = public.cr_inno_mva_campaign_id()';
      end if;
      if predicate <> 'false' and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='firm_id' and data_type='uuid') then
        predicate := predicate || ' and (firm_id is null or firm_id = public.cr_inno_mva_firm_id())';
      end if;
      if scoped_to_file and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='campaign_id' and data_type='uuid') then
        -- Legacy rows may lack this redundant column. A non-null wrong
        -- campaign is never accepted, even when the lead points at INNO.
        predicate := predicate || ' and (campaign_id is null or campaign_id = public.cr_inno_mva_campaign_id())';
      end if;
    end if;
    execute format('drop policy if exists cr_inno_mva_staff_wall on public.%I',t.table_name);
    execute format('create policy cr_inno_mva_staff_wall on public.%I as restrictive for all to authenticated using (%s or (public.is_internal() and (%s))) with check (%s or (public.is_internal() and (%s)))',t.table_name,bypass,predicate,bypass,predicate);
    execute format('drop policy if exists cr_pilot_no_hard_delete on public.%I',t.table_name);
    execute format('create policy cr_pilot_no_hard_delete on public.%I as restrictive for delete to authenticated using (%s)',t.table_name,bypass);

    -- Session clients need these intake/contact/note operations. Provider
    -- evidence, PDF paths, account settings and templates are server-managed.
    if t.table_name not in ('leads','claims','intake_calls','communications','notes','lead_notes','claim_notes','lead_activity','call_logs','case_documents','contact_points','call_schedule','notifications') then
      execute format('drop policy if exists cr_pilot_config_insert on public.%I',t.table_name);
      execute format('drop policy if exists cr_pilot_config_update on public.%I',t.table_name);
      execute format('create policy cr_pilot_config_insert on public.%I as restrictive for insert to authenticated with check (%s)',t.table_name,bypass);
      execute format('create policy cr_pilot_config_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',t.table_name,bypass,bypass);
    end if;
    -- TRUNCATE ignores row security entirely. No application session needs it.
    execute format('revoke truncate on public.%I from public, anon, authenticated',t.table_name);
  end loop;
end $$;

-- Account-management permission overrides cannot create an owner, delete an
-- existing identity, or change an internal user into a firm to evade the wall.
drop policy if exists cr_pilot_user_insert on public.app_users;
create policy cr_pilot_user_insert on public.app_users as restrictive for insert to authenticated with check (public.cr_is_owner());
drop policy if exists cr_pilot_user_delete on public.app_users;
create policy cr_pilot_user_delete on public.app_users as restrictive for delete to authenticated using (public.cr_is_owner());
drop policy if exists cr_pilot_user_update on public.app_users;
create policy cr_pilot_user_update on public.app_users as restrictive for update to authenticated
  using (public.cr_is_owner() or (not public.cr_is_internal_account() and id=auth.uid()))
  with check (public.cr_is_owner() or (not public.cr_is_internal_account() and id=auth.uid()));
create or replace function public.cr_guard_user_privileges()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not public.cr_is_owner() and (
    new.id is distinct from old.id or new.role is distinct from old.role
    or new.firm_id is distinct from old.firm_id or new.active is distinct from old.active
    or new.perm_overrides is distinct from old.perm_overrides or new.email is distinct from old.email
  ) then raise exception 'Only the owner may change account access or login identity.'; end if;
  return new;
end $$;
revoke all on function public.cr_guard_user_privileges() from public, anon, authenticated;
drop trigger if exists cr_guard_user_privileges on public.app_users;
create trigger cr_guard_user_privileges before update on public.app_users for each row execute function public.cr_guard_user_privileges();

-- A valid old row and valid new row can still belong to different files.
-- Staff may correct answers/status, but cannot transplant the matter (and its
-- signed evidence) to another claimant, even inside the same pilot campaign.
create or replace function public.cr_guard_claim_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and public.cr_is_internal_account() and not public.cr_is_owner() and (
    new.id is distinct from old.id or new.lead_id is distinct from old.lead_id
    or new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id
    or new.claim_type is distinct from old.claim_type
  ) then raise exception 'Only the owner may change a matter identity or file association.'; end if;
  return new;
end $$;
revoke all on function public.cr_guard_claim_identity() from public, anon, authenticated;
drop trigger if exists cr_guard_claim_identity on public.claims;
create trigger cr_guard_claim_identity before update on public.claims for each row execute function public.cr_guard_claim_identity();

-- Keep firm first-login provisioning, but never rewrite an existing account.
-- The allowlist cannot be used to provision an internal role through this RPC.
create or replace function public.provision_self_from_firm_access()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); em text; account_type text;
begin
  if uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 121));
  if exists (select 1 from public.app_users where id = uid) then return false; end if;
  select email, raw_app_meta_data->>'account_type' into em, account_type from auth.users where id = uid;
  if account_type = 'partner' then return false; end if;
  if not exists (select 1 from public.firm_access where lower(trim(email)) = lower(trim(em)) and role::text = 'firm') then return false; end if;
  -- No upsert: concurrent owner creation cannot be overwritten by provisioning.
  insert into public.app_users (id, firm_id, role, full_name, email)
    select uid, f.id, fa.role, coalesce(nullif(trim(fa.full_name),''),lower(trim(em))),lower(trim(em))
    from public.firm_access fa join public.firms f on f.slug = fa.firm_slug
    where lower(trim(fa.email)) = lower(trim(em)) and fa.role::text = 'firm'
    on conflict (id) do nothing;
  return found;
end $$;
revoke all on function public.provision_self_from_firm_access() from public, anon;
grant execute on function public.provision_self_from_firm_access() to authenticated, service_role;

create or replace function public.is_m6_landing_email(p_email text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (public.cr_is_owner() or exists (select 1 from auth.users
    where id=auth.uid() and lower(trim(email))=lower(trim(p_email))))
    and exists (select 1 from public.retention_alert_recipients
      where campaign='motel6' and active=true and email=lower(trim(p_email)));
$$;
revoke all on function public.is_m6_landing_email(text) from public, anon;
grant execute on function public.is_m6_landing_email(text) to authenticated, service_role;

create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare nxt bigint; pfx text;
begin
  if auth.role() is distinct from 'service_role' then
    if not public.is_internal() then raise exception 'Only internal staff may mint a lead number'; end if;
    if not public.cr_is_owner() and p_firm is distinct from public.cr_inno_mva_firm_id() then
      raise exception 'This campaign is not available to staff.';
    end if;
  end if;
  select coalesce(lead_prefix,'CR') into pfx from public.firms where id=p_firm;
  nxt := nextval('public.global_lead_seq');
  return coalesce(pfx,'CR') || '-' || nxt::text;
end $$;
revoke all on function public.mint_lead_no(uuid) from public, anon;
grant execute on function public.mint_lead_no(uuid) to authenticated, service_role;

-- Preserve the existing Motel 6 function body and its firm permission checks.
-- Abort atomically if its reviewed insertion point changed; never silently
-- skip a SECURITY DEFINER bypass. This also safely upgrades an applied 0115.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.m6_log_touch(uuid,text,text,text,uuid,text)'::regprocedure);
  if position('cr_is_internal_account()' in definition)=0 then
    if (length(definition)-length(replace(definition,'if uid is null then','')))/length('if uid is null then') <> 1 then
      raise exception 'Motel touch function changed; review before applying boundary.';
    end if;
    definition := replace(definition,'if uid is null then',
      'if public.cr_is_internal_account() and not public.cr_is_owner() then
         raise exception ''Only the owner may work Motel 6 during the INNO MVA pilot.'';
       end if;
       if uid is null then');
    execute definition;
  end if;
end $$;
revoke all on function public.m6_log_touch(uuid,text,text,text,uuid,text) from public, anon;
grant execute on function public.m6_log_touch(uuid,text,text,text,uuid,text) to authenticated, service_role;

-- Existing invoker views inherit the table wall. A definer view/materialized
-- view would bypass it: abort for review rather than unexpectedly change it.
do $$
declare v record;
begin
  for v in select c.relname,c.relkind,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('v','m') and has_table_privilege('authenticated',c.oid,'SELECT')
  loop
    if v.relkind='m' or not coalesce(v.reloptions @> array['security_invoker=true'],false) then
      raise exception 'Exposed view % can bypass RLS; review before applying boundary.',v.relname;
    end if;
  end loop;
  if to_regclass('storage.buckets') is not null then
    if exists (select 1 from storage.buckets where id in ('case-docs','retainer-pdfs','signed-docs') and public=true) then
      raise exception 'Claimant document bucket is public; review before applying boundary.';
    end if;
  end if;
end $$;

-- Storage downloads use scoped, short-lived URLs from the server. Supabase
-- owns storage.objects; the project migration role cannot alter its policies
-- or ownership. Verify its existing default-deny boundary without changing it.
do $$
begin
  if to_regclass('storage.objects') is not null then
    if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass)
       or exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
         and permissive='PERMISSIVE' and roles && array['public','anon','authenticated']::name[]) then
      raise exception 'Storage object access changed; review policies before applying boundary.';
    end if;
  end if;
end $$;
commit;
