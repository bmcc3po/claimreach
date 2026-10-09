-- TEST-ONLY boundary prototype, NOT a deployable migration.
-- Missing: complete surface inventory policies, portal/M6 projection adapters,
-- operation-specific writes, RPC review and live firm acceptance. Do not apply.
create schema if not exists cr_private;
revoke all on schema cr_private from public;
grant usage on schema cr_private to authenticated;

create function cr_private.internal_actor() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from public.app_users u where u.id = auth.uid()
    and u.active = true and u.role in ('owner','admin','manager','qa','agent'))
$$;
create function cr_private.released_matter(p_claim uuid, p_lead uuid, p_firm uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from public.app_users u
    join public.claims c on c.id = p_claim and c.lead_id = p_lead and c.firm_id = p_firm
    join public.leads l on l.id = c.lead_id and l.firm_id = c.firm_id
    join public.statuses s on s.key = c.status
    where u.id = auth.uid() and u.active = true and u.role = 'firm'
      and u.firm_id = c.firm_id and l.archived_at is null
      and s.active = true and s.unlocks_firm = true)
$$;
revoke all on function cr_private.internal_actor() from public;
revoke all on function cr_private.released_matter(uuid,uuid,uuid) from public;
grant execute on function cr_private.internal_actor() to authenticated;
grant execute on function cr_private.released_matter(uuid,uuid,uuid) to authenticated;

-- Existing permissive policies remain; restrictive predicates AND with them.
create policy cr_firm_raw_lead_wall on public.leads as restrictive
for select to authenticated using (cr_private.internal_actor());
create policy cr_firm_release_wall on public.claims as restrictive
for select to authenticated using (cr_private.internal_actor()
  or cr_private.released_matter(id,lead_id,firm_id));
create policy cr_firm_document_wall on public.case_documents as restrictive
for select to authenticated using (cr_private.internal_actor()
  or cr_private.released_matter(claim_id,lead_id,firm_id));

-- A fixed-column projection cannot reveal lead-wide answers/vendor notes.
-- The privileged implementation stays outside exposed schemas; the public
-- wrapper is an invoker. No caller-supplied firm identity is trusted.
create function cr_private.portal_matter(p_claim uuid)
returns table(lead_id uuid, claim_id uuid, lead_no text, claimant_name text,
  phone text, email text, claim_type text, status text, answers jsonb)
language sql stable security definer set search_path = pg_catalog as $$
  select l.id,c.id,l.lead_no,l.claimant_name,l.phone,l.email,c.claim_type,c.status,c.answers
  from public.claims c join public.leads l on l.id = c.lead_id
  where c.id = p_claim and cr_private.released_matter(c.id,l.id,c.firm_id)
$$;
create function public.cr_portal_matter(p_claim uuid)
returns table(lead_id uuid, claim_id uuid, lead_no text, claimant_name text,
  phone text, email text, claim_type text, status text, answers jsonb)
language sql stable security invoker set search_path = pg_catalog as $$
  select lead_id,claim_id,lead_no,claimant_name,phone,email,claim_type,status,answers
  from cr_private.portal_matter(p_claim)
$$;
revoke all on function cr_private.portal_matter(uuid) from public;
revoke all on function public.cr_portal_matter(uuid) from public,anon;
grant execute on function cr_private.portal_matter(uuid) to authenticated;
grant execute on function public.cr_portal_matter(uuid) to authenticated;
