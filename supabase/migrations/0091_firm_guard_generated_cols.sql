-- ============================================================================
-- ClaimReach 0091: firm_stage_only_guard must ignore generated lead columns
--
-- Live replay (firm JWT, TMP-1064, m6_log_touch two_way) still raised
-- "firm users may modify only the pipeline stage" after 0089. RPC was called.
-- 0090 is property_identifications (already applied). This is the next number.
--
-- leads.full_name and leads.phone_norm are STORED generated columns. In a
-- BEFORE UPDATE trigger, NEW holds the pre-compute values, so to_jsonb(NEW)
-- vs to_jsonb(OLD) always differs on those keys. 0089 subtracted only
-- updated_at + retention_stage, so the nested carve-out never matched.
--
-- Also: on_two_way_contact always UPDATEd the lead row even when
-- retention_stage stayed put (onboarding → onboarding). Skip no-op writes.
--
-- Direct firm UPDATE of stage is unchanged. Nested path still cannot touch
-- stage / current_status / PII. Auth-adjacent: this is the same guard.
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

create or replace function firm_stage_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Must match LEADS_GENERATED_COLS in src/lib/m6.ts.
  generated_cols text[] := ARRAY['full_name', 'phone_norm'];
  new_j jsonb;
  old_j jsonb;
begin
  if role_is_firm() then
    new_j := to_jsonb(new) - generated_cols;
    old_j := to_jsonb(old) - generated_cols;
    if pg_trigger_depth() > 1 then
      if (new_j - 'updated_at' - 'retention_stage')
         is distinct from (old_j - 'updated_at' - 'retention_stage') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    else
      if (new_j - 'stage' - 'updated_at')
         is distinct from (old_j - 'stage' - 'updated_at') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function on_two_way_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome = 'two_way' and (old is null or old.outcome is distinct from 'two_way') then
    update call_schedule
       set status = 'done', completed_at = now(), outcome = 'two_way'
     where lead_id = new.lead_id and status = 'open' and due_at <= now();

    if new.contact_point_id is not null then
      update contact_points
         set last_success_at = coalesce(new.occurred_at, now()),
             verified_at     = coalesce(new.occurred_at, now()),
             status          = 'good',
             fail_count      = 0
       where id = new.contact_point_id;
    end if;

    update leads
       set retention_stage = 'heartbeat'
     where id = new.lead_id
       and retention_stage in ('escalation','at_risk','lost_contact');
  end if;

  if new.outcome = 'bad_number' and new.contact_point_id is not null then
    update contact_points
       set status = 'dead', fail_count = fail_count + 1, last_attempt_at = now()
     where id = new.contact_point_id;
  end if;

  return new;
end $$;
