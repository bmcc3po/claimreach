-- ============================================================================
-- ClaimReach 0089: m6 firm "Reached" touch + nested retention_stage carve-out
--
-- Firm INSERT on communications is allowed (0087). "Reached" (outcome=two_way)
-- additionally fires on_two_way_contact, which UPDATEs leads.retention_stage.
-- firm_stage_only_guard then raises and rolls back the whole touch.
--
-- last_two_way_at / next_touch_due / health are VIEW-derived (0082/0084), not
-- lead columns. A firm JWT cannot UPDATE them at all. The only lead column a
-- touch writes is retention_stage (escalation/at_risk/lost_contact → heartbeat).
--
-- This migration:
--   1. Nested-only carve-out: when pg_trigger_depth() > 1, retention_stage
--      (and updated_at from trg_leads_touch) may change. Direct firm UPDATE
--      of retention_stage / current_status / anything but stage+updated_at
--      still raises. Pipeline stage is NOT opened on the nested path.
--   2. m6_log_touch(...) SECURITY DEFINER — the app writer for /api/m6/touch.
--      Same fence as 0087 plus internal staff. Insert-only. Tenant test:
--      a firm JWT UPDATE of retention_stage on leads must still fail.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

create or replace function firm_stage_only_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if role_is_firm() then
    if pg_trigger_depth() > 1 then
      -- Nested write from on_two_way_contact. Clock fields are not on leads.
      -- Only retention_stage may move. Never stage / current_status / PII.
      if (to_jsonb(new) - 'updated_at' - 'retention_stage')
         is distinct from (to_jsonb(old) - 'updated_at' - 'retention_stage') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    else
      if (to_jsonb(new) - 'stage' - 'updated_at')
         is distinct from (to_jsonb(old) - 'stage' - 'updated_at') then
        raise exception 'firm users may modify only the pipeline stage';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function m6_log_touch(
  p_lead_id uuid,
  p_outcome text,
  p_purpose text default 'ad_hoc',
  p_channel text default 'call',
  p_contact_point_id uuid default null,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tmp_id uuid;
  lead_row leads%rowtype;
  point_lead uuid;
  comm_id uuid;
  agent_nm text;
  agent_em text;
  ch text;
  purp text;
begin
  if uid is null then
    raise exception 'Sign in again.';
  end if;
  if p_lead_id is null then
    raise exception 'Missing the file.';
  end if;
  if p_outcome is null or p_outcome not in ('two_way', 'no_answer', 'voicemail', 'bad_number') then
    raise exception 'Pick how the contact ended.';
  end if;

  ch := case when p_channel = 'sms' then 'sms' else 'call' end;
  purp := coalesce(nullif(trim(p_purpose), ''), 'ad_hoc');

  select id into tmp_id from firms where slug = 'tmp';
  if tmp_id is null then
    raise exception 'This app is not available.';
  end if;

  select * into lead_row from leads where id = p_lead_id;
  if not found then
    raise exception 'That file is not available to you.';
  end if;
  if lead_row.firm_id is distinct from tmp_id
     or lead_row.archived_at is not null
     or not (lead_row.campaign = 'motel6' or lead_row.case_type = 'motel_trafficking') then
    raise exception 'That file is not available to you.';
  end if;

  if is_internal() then
    null;
  elsif role_is_firm() and my_firm_id() = tmp_id then
    null;
  else
    raise exception 'This app is for TMP Motel 6 files only.';
  end if;

  if p_contact_point_id is not null then
    select lead_id into point_lead
      from contact_points
     where id = p_contact_point_id and firm_id = tmp_id;
    if point_lead is distinct from p_lead_id then
      raise exception 'That file is not available to you.';
    end if;
  end if;

  select full_name, email into agent_nm, agent_em from app_users where id = uid;

  insert into communications (
    lead_id, firm_id, channel, direction,
    phone_raw, phone_norm, body,
    agent_name, agent_email, occurred_at,
    purpose, outcome, contact_point_id,
    logged_manually, dispositioned_by, dispositioned_at
  ) values (
    p_lead_id, lead_row.firm_id, ch,
    case when purp = 'inbound' then 'inbound' else 'outbound' end,
    lead_row.phone, public.norm_phone(lead_row.phone), nullif(trim(p_body), ''),
    agent_nm, agent_em, now(),
    purp, p_outcome, p_contact_point_id,
    true, uid, now()
  ) returning id into comm_id;

  return comm_id;
end;
$$;

revoke all on function m6_log_touch(uuid, text, text, text, uuid, text) from public;
grant execute on function m6_log_touch(uuid, text, text, text, uuid, text) to authenticated;

comment on function m6_log_touch(uuid, text, text, text, uuid, text) is
  '0089: single writer for m6 manual touches. Firm JWT cannot UPDATE leads.retention_stage except via the nested two_way trigger this insert fires.';
