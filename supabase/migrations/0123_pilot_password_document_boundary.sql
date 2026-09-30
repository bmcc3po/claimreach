-- First-login credentials cannot access claimant data until changed. Document
-- index writes remain server/owner managed during the INNO MVA staff pilot.
-- Additive: no claimant data, signed files, users, passwords or roles changed.
begin;

create or replace function public.cr_pilot_password_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users a join public.app_users u on u.id = a.id
    where a.id = auth.uid() and u.role::text in ('admin','manager','agent','qa')
      and a.raw_app_meta_data->>'must_change_password' = 'true'
  );
$$;
revoke all on function public.cr_pilot_password_required() from public, anon;
grant execute on function public.cr_pilot_password_required() to authenticated, service_role;

-- Read current trusted Auth metadata, not user-editable metadata or a stale JWT.
-- The own-profile exception lets onboarding read role/active. Existing 0121
-- restrictions still deny staff profile mutations and identity escalation.
do $$
declare t record; predicate text;
begin
  for t in
    select c.oid, c.relname as table_name, c.relrowsecurity
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and (
      has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
  loop
    if not t.relrowsecurity then
      raise exception 'Exposed table % has no RLS. Password boundary not applied.',t.table_name;
    end if;
    predicate := '(select not public.cr_pilot_password_required())';
    if t.table_name='app_users' then predicate := predicate || ' or id = (select auth.uid())'; end if;
    execute format('drop policy if exists cr_pilot_password_wall on public.%I',t.table_name);
    execute format('create policy cr_pilot_password_wall on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.table_name,predicate,predicate);
  end loop;
end $$;

-- case_documents keys are scoped to firm/lead, not claim. Allowing an agent
-- to point an INNO index row at a hidden sibling claim's object would make
-- the file route sign that hidden path. Staff retain RLS-scoped reads only.
-- Server ingestion/reindex uses service_role; owner and firm rules are kept.
drop policy if exists cr_pilot_document_index_insert on public.case_documents;
create policy cr_pilot_document_index_insert on public.case_documents
  as restrictive for insert to authenticated
  with check (not public.cr_is_internal_account() or public.cr_is_owner());
drop policy if exists cr_pilot_document_index_update on public.case_documents;
create policy cr_pilot_document_index_update on public.case_documents
  as restrictive for update to authenticated
  using (not public.cr_is_internal_account() or public.cr_is_owner())
  with check (not public.cr_is_internal_account() or public.cr_is_owner());
drop policy if exists cr_pilot_document_index_delete on public.case_documents;
create policy cr_pilot_document_index_delete on public.case_documents
  as restrictive for delete to authenticated
  using (not public.cr_is_internal_account() or public.cr_is_owner());

-- This older definer RPC is server-only. Revoking named roles alone leaves
-- PostgreSQL's implicit PUBLIC EXECUTE grant effective.
revoke all on function public.enroll_drips_for_lead(uuid,uuid) from public, anon, authenticated;
grant execute on function public.enroll_drips_for_lead(uuid,uuid) to service_role;

-- The remaining staff write RPC runs as definer and must check the password
-- gate before consuming a number; table RLS cannot protect a sequence.
create or replace function public.mint_lead_no(p_firm uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare nxt bigint; pfx text;
begin
  if auth.role() is distinct from 'service_role' then
    if not public.is_internal() then raise exception 'Only internal staff may mint a lead number'; end if;
    if public.cr_pilot_password_required() then raise exception 'Change your temporary password first.'; end if;
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
commit;
