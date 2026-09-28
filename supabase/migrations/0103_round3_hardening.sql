-- ============================================================================
-- 0103 — Astra round-3 repairs (Sep 28 2026).
--
-- 1. replace_claim_properties: property sets are replaced in ONE transaction.
--    The old insert-then-delete pair in the API could interleave across two
--    concurrent saves into ZERO rows. SECURITY INVOKER, so RLS still decides
--    who may touch the claim's rows.
-- 2. guard_case_documents: storage keys are authorized on their CANONICAL
--    form. A key that starts with the right "firm/lead/" prefix can still
--    normalize elsewhere via traversal or encoding; those keys are refused
--    outright.
-- 3. anon EXECUTE stripped from the remaining public functions that carried
--    it (trigger guards and norm_phone are not signed-out entry points).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic property replacement.
-- ---------------------------------------------------------------------------
create or replace function public.replace_claim_properties(p_claim_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  -- One transaction: the old set only leaves when the new set is in. Two
  -- concurrent replaces serialize on the row locks; the later full set wins,
  -- never an empty overlap.
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

revoke execute on function public.replace_claim_properties(uuid, jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 2. Canonical storage keys in the document guard.
-- ---------------------------------------------------------------------------
create or replace function public.guard_case_documents()
returns trigger
language plpgsql
set search_path = public as $$
declare v_lead_firm uuid; v_claim_lead uuid; v_claim_firm uuid; acting text := current_user;
begin
  if acting in ('service_role', 'postgres', 'supabase_admin') then
    -- Server writes still get the referential checks below; skip nothing else.
    null;
  end if;
  if new.lead_id is not null then
    select firm_id into v_lead_firm from public.leads where id = new.lead_id;
    if v_lead_firm is null then raise exception 'case_documents: lead does not exist'; end if;
    if new.firm_id is distinct from v_lead_firm then
      raise exception 'case_documents: firm does not match the lead''s firm';
    end if;
  end if;
  if new.claim_id is not null then
    select lead_id, firm_id into v_claim_lead, v_claim_firm from public.claims where id = new.claim_id;
    if v_claim_lead is null then raise exception 'case_documents: claim does not exist'; end if;
    if new.lead_id is not null and v_claim_lead is distinct from new.lead_id then
      raise exception 'case_documents: claim does not belong to this lead';
    end if;
    if v_claim_firm is not null and new.firm_id is distinct from v_claim_firm then
      raise exception 'case_documents: firm does not match the claim''s firm';
    end if;
  end if;
  -- The stored object must live under this firm (and this lead, when set),
  -- and the key must already BE canonical: no traversal, no doubled or
  -- leading separators, no backslashes, no percent-encoding, no control
  -- characters. A prefix match on a non-canonical key authorizes the wrong
  -- object once a storage client normalizes it (Astra round 3).
  if new.storage_path is not null then
    if new.storage_path ~ '\.\.' or new.storage_path like '%//%'
       or left(new.storage_path, 1) = '/' or new.storage_path like '%\\%'
       or new.storage_path like '%\%%' or new.storage_path ~ '[\x00-\x1f]' then
      raise exception 'case_documents: storage path is not canonical';
    end if;
    if position(new.firm_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this firm';
    end if;
    if new.lead_id is not null
       and position(new.firm_id::text || '/' || new.lead_id::text || '/' in new.storage_path) <> 1 then
      raise exception 'case_documents: storage path does not belong to this lead';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Strip anon EXECUTE from the stragglers.
-- ---------------------------------------------------------------------------
revoke execute on function public.guard_app_users_priv() from anon;
revoke execute on function public.guard_case_documents() from anon;
revoke execute on function public.norm_phone(text) from anon;
