-- ============================================================================
-- ClaimReach 0085: RLS hardening (ahead of external firm logins)
--
-- Closes authenticated USING-true leaks on leftover people tables, firm-fences
-- campaign/config reads, takes published forms off anon, and restores
-- is_internal() as SECURITY DEFINER so anon probes return 0 rows instead of
-- 500 (stack overflow via app_users RLS recursion).
--
-- Idempotent. Safe to re-run. Apply in the Supabase SQL editor.
-- Do not execute from the agent. Brett applies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. is_internal() — recursion fix
-- 0001 created this SECURITY DEFINER SET search_path = public.
-- 0044 added manager but dropped definer, so a policy that calls is_internal()
-- under the anon role re-enters app_users RLS → stack depth exceeded.
-- Restore definer + pinned search_path. Keep 0044's manager role.
-- ---------------------------------------------------------------------------
create or replace function is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from app_users
    where id = auth.uid()
      and role::text in ('owner','admin','manager','agent','qa')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. contacts / claimants / status_events
-- Production leftover tables (not in the numbered migration ledger). App
-- never queries them (zero from("contacts"|"claimants"|"status_events") in
-- src/). contacts and claimants have no firm_id and no join path to firms,
-- so firm-scoped read cannot be expressed. Drop USING-true authenticated
-- ALL/INSERT. Internal-all only. No firm write (app never writes).
-- status_events has lead_id: firm SELECT via leads.firm_id = my_firm_id().
-- Tables wrapped so a clone without the leftovers still applies the rest.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.contacts') is not null then
    drop policy if exists p_contacts_all on contacts;
    drop policy if exists contacts_internal_all on contacts;
    create policy contacts_internal_all on contacts
      for all using ( is_internal() ) with check ( is_internal() );
  end if;

  if to_regclass('public.claimants') is not null then
    drop policy if exists p_claimants_all on claimants;
    drop policy if exists claimants_internal_all on claimants;
    create policy claimants_internal_all on claimants
      for all using ( is_internal() ) with check ( is_internal() );
  end if;

  if to_regclass('public.status_events') is not null then
    drop policy if exists p_status_read on status_events;
    drop policy if exists p_status_insert on status_events;
    drop policy if exists status_events_internal_all on status_events;
    drop policy if exists status_events_firm_read on status_events;
    create policy status_events_internal_all on status_events
      for all using ( is_internal() ) with check ( is_internal() );
    create policy status_events_firm_read on status_events
      for select using (
        exists (
          select 1 from leads
          where leads.id = status_events.lead_id
            and leads.firm_id = my_firm_id()
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Authenticated no-fence reads
--
-- campaigns columns (production, 2026-08-22):
--   id, name, firm_id, case_type, intake_template, retainer_template_id,
--   tier, bill_rate, active, created_at, updated_at,
--   esign_required, retainer_packet,
--   firm_email, firm_cc, firm_reply_to, firm_subject_tpl, firm_body_tpl,
--   attach_intake_pdf, attach_intake_csv, attach_retainer, attach_certificate,
--   firm_delivery_on, allow_live_sign,
--   path, transfer_label, transfer_number, network_label
--
-- Economics: bill_rate only (per-sign rate billed to that firm). No margin,
-- vendor-cost, or internal-notes column exists. transfer_number is the live-
-- transfer dest for that campaign (ops, not economics). No column strip;
-- firm users may read their own row including their own bill_rate.
-- Writes stay on the API via service_role (unchanged).
-- ---------------------------------------------------------------------------
drop policy if exists campaigns_read on campaigns;
drop policy if exists campaigns_internal_all on campaigns;
drop policy if exists campaigns_firm_read on campaigns;
create policy campaigns_internal_all on campaigns
  for all using ( is_internal() ) with check ( is_internal() );
create policy campaigns_firm_read on campaigns
  for select using ( firm_id = my_firm_id() );

drop policy if exists firm_deliveries_read on firm_deliveries;
drop policy if exists firm_deliveries_internal_all on firm_deliveries;
drop policy if exists firm_deliveries_firm_read on firm_deliveries;
create policy firm_deliveries_internal_all on firm_deliveries
  for all using ( is_internal() ) with check ( is_internal() );
create policy firm_deliveries_firm_read on firm_deliveries
  for select using ( firm_id = my_firm_id() );

drop policy if exists automations_read on automations;
drop policy if exists automations_internal_all on automations;
drop policy if exists automations_firm_read on automations;
create policy automations_internal_all on automations
  for all using ( is_internal() ) with check ( is_internal() );
create policy automations_firm_read on automations
  for select using ( firm_id = my_firm_id() );

-- sla_settings is a singleton (no firm_id). App reads/writes via admin.
-- Internal-only. Drop authenticated-wide sla_read.
drop policy if exists sla_read on sla_settings;
drop policy if exists sla_internal_all on sla_settings;
create policy sla_internal_all on sla_settings
  for all using ( is_internal() ) with check ( is_internal() );

-- Intentionally unchanged (justified):
--   escalation_ladder.ladder_read  authenticated-wide — 9-row motel playbook,
--     no PII. lead_contact_status (security_invoker) subqueries it; a TMP
--     firm JWT must SELECT or ladder_step goes null.
--   statuses.statuses_read         authenticated-wide — firm portal unlock wall
--   dq_reasons.dq_reasons_read     authenticated-wide — shared DQ vocabulary
--   lawruler_aliases.aliases_read  authenticated-wide — global LR→status map

-- ---------------------------------------------------------------------------
-- 3. Anon-open reads → authenticated (or internal-only)
-- No unauthenticated app call site requires these. /api/case/options is the
-- only route that queried option_lists without getUser; that route now 401s.
-- intake_forms.fields contains agentNote on every published form — not for
-- anon or for another firm. Internal-only.
-- ---------------------------------------------------------------------------
drop policy if exists forms_read_published on intake_forms;
-- forms_internal_all already exists (0016). Re-assert so a re-run is clean.
drop policy if exists forms_internal_all on intake_forms;
create policy forms_internal_all on intake_forms
  for all using ( is_internal() ) with check ( is_internal() );

drop policy if exists option_lists_read on option_lists;
drop policy if exists option_lists_firm_read on option_lists;
drop policy if exists option_lists_manage on option_lists;
create policy option_lists_manage on option_lists
  for all using ( is_internal() ) with check ( is_internal() );
create policy option_lists_firm_read on option_lists
  for select using (
    auth.role() = 'authenticated'
    and (firm_id is null or firm_id = my_firm_id())
  );

drop policy if exists ctr_read on case_type_registry;
drop policy if exists ctr_internal on case_type_registry;
create policy ctr_internal on case_type_registry
  for all using ( is_internal() ) with check ( is_internal() );
create policy ctr_read on case_type_registry
  for select using ( auth.role() = 'authenticated' );
