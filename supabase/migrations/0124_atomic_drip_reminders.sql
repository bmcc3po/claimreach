-- Generic drip QA: fail-closed eligibility and atomic note-only reminders.
-- Does not enable any sender, create an INNO sequence or change existing enrollments.
begin;

create or replace function public.cr_check_drip_enrollment(p_enrollment uuid, p_expected_due date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e public.drip_enrollments; r public.drip_rules; l public.leads;
  c public.claims; s public.statuses; matter_count integer; released_at timestamptz;
begin
  select * into e from public.drip_enrollments where id=p_enrollment;
  if not found or e.active is not true or e.next_due is distinct from p_expected_due
     or e.next_due is null or e.next_due > (now() at time zone 'UTC')::date then
    return jsonb_build_object('allowed',false,'reason','The enrollment is no longer due.');
  end if;
  select * into r from public.drip_rules where id=e.rule_id;
  if not found or r.active is not true or r.campaign is not null or r.every_days is null
     or r.every_days < 1 or r.every_days > 3650 or r.channel is null or r.channel not in ('sms','email','call_reminder') then
    return jsonb_build_object('allowed',false,'reason','This rule is inactive, invalid, or belongs to a separate campaign workflow.');
  end if;
  select * into l from public.leads where id=e.lead_id;
  if not found or l.archived_at is not null or l.firm_id is null or l.firm_id is distinct from e.firm_id
     or (r.firm_id is not null and r.firm_id is distinct from l.firm_id) then
    return jsonb_build_object('allowed',false,'reason','The file is archived, missing, or does not match the rule firm.');
  end if;
  -- Legacy enrollments have no claim_id. Count every sibling, including ones
  -- hidden from the requesting staff account, instead of guessing a matter.
  select count(*) into matter_count from public.claims where lead_id=l.id;
  if matter_count <> 1 then
    return jsonb_build_object('allowed',false,'reason','This lead-scoped enrollment cannot identify one exact matter.');
  end if;
  select * into c from public.claims where lead_id=l.id;
  if c.firm_id is distinct from l.firm_id or c.claim_type::text is distinct from 'mva' or l.case_type::text is distinct from 'mva' then
    return jsonb_build_object('allowed',false,'reason','This file belongs to a separate campaign workflow.');
  end if;
  if not exists(select 1 from public.campaigns where id=c.campaign_id and firm_id=l.firm_id and active
      and case_type::text='mva') then
    return jsonb_build_object('allowed',false,'reason','The matter campaign is missing, inactive, or belongs to another firm.');
  end if;
  select * into s from public.statuses where key=c.status;
  if not found or s.active is not true or s.phase <> 'pre_qa' or s.is_final or s.unlocks_firm
     or s.qualify='disqualify' or c.status in ('test','external_dq_review') then
    return jsonb_build_object('allowed',false,'reason','This matter is signed, closed, a test, or no longer eligible for acquisition follow-up.');
  end if;
  if l.signed_at is not null or exists(select 1 from public.esign_submissions x
      where x.lead_id=l.id and x.firm_id=l.firm_id and (x.claim_id=c.id or x.claim_id is null)
        and x.voided_at is null and (x.signed_at is not null or x.status in ('signed','completed'))) then
    return jsonb_build_object('allowed',false,'reason','A client signature is already recorded.');
  end if;
  select max(created_at) into released_at from public.lead_activity a
    where a.lead_id=l.id and a.firm_id=l.firm_id and a.meta->>'source'='lawruler'
      and a.meta->>'event'='mva_status_reconciliation' and a.meta->>'claim_id'=c.id::text
      and a.meta->>'campaign_id'=c.campaign_id::text and a.meta->>'hold_release_reviewed'='true'
      and a.meta->>'acquisition_hold'='false';
  if exists(select 1 from public.lead_activity a where a.lead_id=l.id and a.firm_id=l.firm_id
      and a.meta->>'source'='lawruler' and a.meta->>'event'='mva_status_reconciliation'
      and a.meta->>'claim_id'=c.id::text and a.meta->>'campaign_id'=c.campaign_id::text
      and a.meta->>'acquisition_hold'='true' and (released_at is null or a.created_at>=released_at)) then
    return jsonb_build_object('allowed',false,'reason','LawRuler reported a signature or closure that needs review.');
  end if;
  if e.created_at is null or exists(select 1 from public.communications m where m.lead_id=l.id
      and m.firm_id=l.firm_id and m.direction='inbound' and m.occurred_at>=e.created_at) then
    return jsonb_build_object('allowed',false,'reason','The client responded after enrollment; review the file before further acquisition follow-up.');
  end if;
  if (r.channel='sms' and l.perm_text is false) or (r.channel='email' and l.perm_email is false)
     or (r.channel='call_reminder' and l.perm_call is false) then
    return jsonb_build_object('allowed',false,'reason','The requested contact channel is blocked on this file.');
  end if;
  if l.comms_monitored and not exists(select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(l.comms_safe_channels)='array' then l.comms_safe_channels else '[]'::jsonb end) ch
      where lower(ch)=case r.channel when 'sms' then 'text' when 'email' then 'email' else 'call' end) then
    return jsonb_build_object('allowed',false,'reason','This is not an approved safe contact channel.');
  end if;
  if r.channel in ('sms','email') then
    return jsonb_build_object('allowed',false,'reason',r.channel||' delivery is not configured for scheduled drips.');
  end if;
  return jsonb_build_object('allowed',true,'reason','Eligible for a note-only call reminder.','claim_id',c.id);
end $$;
revoke all on function public.cr_check_drip_enrollment(uuid,date) from public,anon,authenticated;
grant execute on function public.cr_check_drip_enrollment(uuid,date) to service_role;

create or replace function public.cr_fire_drip_reminder(p_enrollment uuid,p_expected_due date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.drip_enrollments; r public.drip_rules; checked jsonb; note_id uuid;
begin
  -- Serializes duplicate cron/manual requests. A committed result changes the
  -- expected due date (or deactivates a one-shot), so its retry cannot repeat.
  select * into e from public.drip_enrollments where id=p_enrollment for update;
  if not found then return jsonb_build_object('fired',false,'reason','Enrollment not found.'); end if;
  if e.active is not true or e.next_due is distinct from p_expected_due then
    return jsonb_build_object('fired',false,'reason','The enrollment was already processed or changed.');
  end if;
  select * into r from public.drip_rules where id=e.rule_id for share;
  perform 1 from public.leads where id=e.lead_id for share;
  perform 1 from public.claims where lead_id=e.lead_id for share;
  checked := public.cr_check_drip_enrollment(p_enrollment,p_expected_due);
  if checked->>'allowed' is distinct from 'true' then
    return jsonb_build_object('fired',false,'reason',checked->>'reason');
  end if;
  if r.channel is distinct from 'call_reminder' then raise exception 'Only note-only reminders are supported'; end if;
  insert into public.notes(firm_id,lead_id,claim_id,author_name,scope,body)
    values(e.firm_id,e.lead_id,(checked->>'claim_id')::uuid,'Drip','file',
      'Call reminder: '||r.name||'. No call or message was sent.') returning id into note_id;
  update public.drip_enrollments set last_sent=now(),
    next_due=(now() at time zone 'UTC')::date+r.every_days,
    active=case when r.fire_once then false else true end where id=e.id;
  return jsonb_build_object('fired',true,'note_id',note_id);
end $$;
revoke all on function public.cr_fire_drip_reminder(uuid,date) from public,anon,authenticated;
grant execute on function public.cr_fire_drip_reminder(uuid,date) to service_role;

-- Existing enrollments are preserved. Serialize future enrollments per lead;
-- a transferred/archived file or a caller-supplied wrong firm cannot enroll.
create or replace function public.enroll_drips_for_lead(p_lead uuid,p_firm uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.leads;
begin
  select * into l from public.leads where id=p_lead for update;
  if not found or l.archived_at is not null or l.firm_id is null or l.firm_id is distinct from p_firm then
    raise exception 'The file cannot be enrolled under this firm';
  end if;
  insert into public.drip_enrollments(firm_id,lead_id,rule_id,next_due,active)
    select l.firm_id,l.id,r.id,(now() at time zone 'UTC')::date+r.every_days,true
    from public.drip_rules r where r.active and r.campaign is null and r.every_days between 1 and 3650
      and (r.firm_id is null or r.firm_id=l.firm_id)
      and not exists(select 1 from public.drip_enrollments e where e.lead_id=l.id and e.rule_id=r.id);
end $$;
revoke all on function public.enroll_drips_for_lead(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enroll_drips_for_lead(uuid,uuid) to service_role;
commit;
