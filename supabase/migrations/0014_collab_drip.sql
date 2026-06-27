-- ============================================================================
-- ClaimReach — 0014: Two-way collaboration + drip enrollment/firing
-- ============================================================================

-- Let firm users insert notes (e.g. request_info) on their own cases.
drop policy if exists notes_firm_insert on notes;
create policy notes_firm_insert on notes for insert with check ( firm_id = my_firm_id() );

-- Let firm users insert notifications tied to their firm (request-info loop).
drop policy if exists notif_firm_insert on notifications;
create policy notif_firm_insert on notifications for insert with check ( firm_id = my_firm_id() );

-- Auto-enroll a lead into active drip rules when a claim becomes qualified/signed.
-- (Enrollment sets next_due = today + every_days.)
create or replace function enroll_drips_for_lead(p_lead uuid, p_firm uuid)
returns void language plpgsql security definer as $$
begin
  insert into drip_enrollments (firm_id, lead_id, rule_id, next_due, active)
  select p_firm, p_lead, r.id, current_date + (r.every_days || ' days')::interval, true
  from drip_rules r
  where r.active and (r.firm_id is null or r.firm_id = p_firm)
    and not exists (select 1 from drip_enrollments e where e.lead_id = p_lead and e.rule_id = r.id);
end $$;

-- A view of drips that are due now (for a worker/cron to process).
create or replace view drips_due as
select e.id as enrollment_id, e.lead_id, e.firm_id, e.rule_id, e.next_due,
       r.name, r.channel, r.template, r.every_days, r.assign_to,
       l.claimant_name, l.phone, l.email
from drip_enrollments e
join drip_rules r on r.id = e.rule_id
join leads l on l.id = e.lead_id
where e.active and e.next_due <= current_date;
