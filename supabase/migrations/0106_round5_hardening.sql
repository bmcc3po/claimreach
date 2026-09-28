-- ============================================================================
-- 0106 — Round-5 repairs from Astra's review of round 3 (Sep 28 2026).
--
-- 1. esign_submissions.doc_count: the packet's manifest size, stamped when a
--    submission completes. Recovery retries until the stored files match it
--    and delivery refuses a shorter packet.
-- 2. replace_claim_properties gains a per-claim advisory transaction lock and
--    a claim existence/authorization check. The round-3 version was atomic
--    per call but two overlapping calls on an EMPTY set could both insert
--    (nothing to lock). The advisory lock serializes the claim's set no
--    matter what rows exist. Supersedes the 0103 function body.
-- 3. Effective EXECUTE privileges. The earlier "revoke from anon" left
--    PUBLIC's implicit EXECUTE in place, so anon still had effective EXECUTE
--    on the guards, helpers and norm_phone (Astra round-3 review, verified
--    with has_function_privilege). Revoke PUBLIC and grant back exactly the
--    roles each function needs.
-- ============================================================================

alter table esign_submissions add column if not exists doc_count int;

create or replace function public.replace_claim_properties(p_claim_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  -- Serialize per claim, whatever rows exist: two overlapping replaces queue
  -- here instead of both inserting into an empty set.
  perform pg_advisory_xact_lock(hashtextextended('claim_properties:' || p_claim_id::text, 0));
  -- The claim must exist AND be visible to the caller (RLS applies here,
  -- SECURITY INVOKER), so the function cannot write into someone else's claim.
  if not exists (select 1 from claims where id = p_claim_id) then
    raise exception 'replace_claim_properties: no such claim';
  end if;
  delete from claim_properties where claim_id = p_claim_id;
  insert into claim_properties (
    firm_id, claim_id, canonical_id, sequence_order, remembered_brand, current_brand,
    name_as_recalled, address, cross_streets, city, state, place_id, lat, lng,
    loc_confidence, landmarks, stay_month, stay_year, stay_duration, room_floor,
    age_at_time, under_18, acts_count_here, who_booked_paid, payment_method,
    men_per_day, asked_staff_for_help, asked_whom, police_emt_called,
    repeatedly_same_motel, specific_rooms_req, room_change_freq, visitors_check_desk,
    men_waiting_areas, housekeeping_entered, towel_change_freq, sheet_change_freq,
    dnd_long_periods, condoms_visible, staff_interact_traffk, staff_interact_victim,
    mgmt_intervened, violence_public_areas, drug_paraphernalia, staff_witnessed_drugs,
    staff_knowledge_other, has_variance, variance_notes, variance_trafficker,
    variance_control, custom
  )
  select
    p.firm_id, p_claim_id, p.canonical_id, p.sequence_order, p.remembered_brand, p.current_brand,
    p.name_as_recalled, p.address, p.cross_streets, p.city, p.state, p.place_id, p.lat, p.lng,
    p.loc_confidence, p.landmarks, p.stay_month, p.stay_year, p.stay_duration, p.room_floor,
    p.age_at_time, p.under_18, p.acts_count_here, p.who_booked_paid, p.payment_method,
    p.men_per_day, p.asked_staff_for_help, p.asked_whom, p.police_emt_called,
    p.repeatedly_same_motel, p.specific_rooms_req, p.room_change_freq, p.visitors_check_desk,
    p.men_waiting_areas, p.housekeeping_entered, p.towel_change_freq, p.sheet_change_freq,
    p.dnd_long_periods, p.condoms_visible, p.staff_interact_traffk, p.staff_interact_victim,
    p.mgmt_intervened, p.violence_public_areas, p.drug_paraphernalia, p.staff_witnessed_drugs,
    p.staff_knowledge_other, p.has_variance, p.variance_notes, p.variance_trafficker,
    p.variance_control, coalesce(p.custom, '{}'::jsonb)
  from jsonb_populate_recordset(null::claim_properties, coalesce(p_rows, '[]'::jsonb)) p;
end $$;

-- Effective privileges: close the PUBLIC hole, grant back exactly what each
-- function needs. The RLS helper functions must stay executable by
-- authenticated (the policies evaluate as the querying role).
revoke execute on function public.guard_app_users_priv() from public;
revoke execute on function public.guard_case_documents() from public;

revoke execute on function public.norm_phone(text) from public;
grant execute on function public.norm_phone(text) to authenticated, service_role;

revoke execute on function public.replace_claim_properties(uuid, jsonb) from public;
grant execute on function public.replace_claim_properties(uuid, jsonb) to authenticated, service_role;

revoke execute on function public.is_internal() from public;
grant execute on function public.is_internal() to authenticated, service_role;
revoke execute on function public.can_manage_users() from public;
grant execute on function public.can_manage_users() to authenticated, service_role;
revoke execute on function public.can_see_money() from public;
grant execute on function public.can_see_money() to authenticated, service_role;
revoke execute on function public.my_firm_id() from public;
grant execute on function public.my_firm_id() to authenticated, service_role;
revoke execute on function public.role_is_firm() from public;
grant execute on function public.role_is_firm() to authenticated, service_role;
revoke execute on function public.current_app_user() from public;
grant execute on function public.current_app_user() to authenticated, service_role;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026 and probe-verified:
-- anon has NO effective EXECUTE on any of the functions above; authenticated
-- keeps the helpers; an active agent's RLS access is unchanged; the property
-- replace still works and refuses a nonexistent claim. Record only.
-- ============================================================================
