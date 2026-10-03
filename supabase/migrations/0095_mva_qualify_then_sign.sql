-- ============================================================================
-- 0095 MVA: QUALIFY/DQ BEFORE SIGN, DETAILS AFTER
--
-- Master MVA form only (firm_id null AND campaign_id null). Live campaign
-- forks are not rewritten — the console asks the qualify rail from
-- questions.ts regardless of a stored print order.
--
-- Adds frame + dual-rep Q2/Q3, rewrites ask_order to qualify then details,
-- and fixes the how-found script (it is no longer asked "before we dig in").
-- Idempotent.
-- ============================================================================

-- New fields (skipped when the id already exists).
with extras as (
  select jsonb_agg(x.f) as add
  from (
    select '{"id":"frame","scope":"lead","kind":"select","label":"I am going to get the broad strokes first to make sure this is something we can help with. Then we will initiate attorney-client privilege and gather the rest of the facts.","origin":"spine","locked":true,"script":"I am going to get the broad strokes first to make sure this is something we can help with. Then we will initiate attorney-client privilege and gather the rest of the facts.","agentNote":"Read this after the greeting, before the qualify questions. It is part of the script, not a side note.","choices":[{"value":"said","label":"Read it, continue"}],"options":["Read it, continue"]}'::jsonb as f
    union all
    select '{"id":"attorney_consult","scope":"lead","kind":"select","label":"Have you contacted or consulted with an attorney about this claim, even if you did not sign with them?","origin":"spine","locked":true,"script":"Have you contacted or consulted with an attorney about this claim, even if you did not sign with them?","agentNote":"Second of three dual-rep asks. Informational. Yes does not disqualify. Do not combine this with the current-attorney question.","choices":[{"value":"no","label":"No"},{"value":"yes","label":"Yes"}],"options":["No","Yes"],"showIf":{"match":"all","rules":[{"fieldId":"attorney","op":"is_not","value":"yes"}]}}'::jsonb
    union all
    select '{"id":"pending_legal","scope":"lead","kind":"select","label":"Is there a pending lawsuit, legal action, or settlement process on this matter?","origin":"spine","locked":true,"script":"Is there a pending lawsuit, legal action, or settlement process on this matter?","agentNote":"Third of three dual-rep asks. Informational. Pending is not the same as already settled — that is a later question. Do not combine this with the other two.","choices":[{"value":"no","label":"No"},{"value":"yes","label":"Yes"}],"options":["No","Yes"],"showIf":{"match":"all","rules":[{"fieldId":"attorney","op":"is_not","value":"yes"}]}}'::jsonb
  ) x
)
update intake_forms f
set fields = coalesce(f.fields, '[]'::jsonb) || coalesce((
  select jsonb_agg(e)
  from jsonb_array_elements(extras.add) e
  where not exists (
    select 1 from jsonb_array_elements(f.fields) existing
    where existing->>'id' = e->>'id'
  )
), '[]'::jsonb),
    ask_order = '["frame","authority","poa","attorney","attorney_consult","pending_legal","settled","fault","date","incident_city_state","injured","what_happened","role","agent_read","symptoms_ongoing","treatment","willing","commit_appointment","willing_more","injuries","surgery","hosp","bills","commercial","ins_other","ins_own","ins_uim","collision_type","incident_time","police_report","police_agency","police_report_number","citations","auto_policy_id","others_in_vehicle","others_names","others_injured","others_injured_contact","others_need_help","ins_forms","ins_forms_signed","ins_forms_said","how_found_us","referral_source","treatment_followup","case_manager_notes"]'::jsonb,
    version = coalesce(f.version, 10) + 1,
    updated_at = now()
from extras
where f.claim_type = 'mva'
  and f.firm_id is null
  and f.campaign_id is null;

-- how-found is asked after the signature now.
update intake_forms
set fields = (
  select coalesce(jsonb_agg(
    case when elem->>'id' = 'how_found_us'
      then elem || '{"script":"How did you find us?","label":"How did you find us?","agentNote":"Marketing attribution. Asked after the signature. Tap what they say — do not read the list."}'::jsonb
      else elem
    end
  ), fields)
  from jsonb_array_elements(fields) elem
),
    updated_at = now()
where claim_type = 'mva'
  and firm_id is null
  and campaign_id is null;
