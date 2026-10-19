-- 0130: dedicated marketer text and atomic DQ call close. WRITE ONLY; not applied.
-- No historical narrative backfill. Null explanations mean review required.
begin;
alter table public.claims add column if not exists dq_explanation text;
comment on column public.claims.dq_explanation is 'Human-reviewed marketer-facing DQ explanation. Never populate from internal notes or imported narratives.';

-- Server-only transaction, called after the existing route authorizes the exact
-- lead/matter. No browser role gains access. Invoker retains caller privileges.
create or replace function public.cr_save_dq_call(
  p_claim_id uuid, p_lead_id uuid, p_firm_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_reason text, p_explanation text, p_call_id uuid, p_call jsonb
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.claims%rowtype; saved uuid; d text;
begin
  select * into c from public.claims where id=p_claim_id and lead_id=p_lead_id and firm_id=p_firm_id for update;
  if not found or c.updated_at is distinct from p_expected_updated_at then raise exception 'Matter changed. Refresh before saving.'; end if;
  if p_status not in ('dq','not_interested','dnc') then raise exception 'Invalid DQ call status'; end if;
  if not exists(select 1 from public.dq_reasons where key=p_reason) then raise exception 'Select a DQ reason'; end if;
  if p_explanation is null or length(btrim(p_explanation)) < 10 or length(p_explanation)>2000 or p_explanation !~ '[[:alnum:]]' then raise exception 'Write a meaningful DQ explanation'; end if;
  if c.status like 'signed%' or c.status in ('delivered','retained') then raise exception 'Signed files require the decline workflow'; end if;
  if (p_call->>'firm_id')::uuid is distinct from c.firm_id or (p_call->>'lead_id')::uuid is distinct from c.lead_id or (p_call->>'claim_id')::uuid is distinct from c.id or (p_call->>'campaign_id')::uuid is distinct from c.campaign_id then raise exception 'Call scope mismatch'; end if;
  d:=case p_status when 'dq' then 'dq' when 'not_interested' then 'ni' else 'dnc' end;
  if p_call->>'disposition' is distinct from d then raise exception 'Disposition mismatch'; end if;
  if p_call_id is not null then
    update public.intake_calls set disposition=d,dispo_reasons=array(select jsonb_array_elements_text(p_call->'dispo_reasons')),
      reason=p_call->>'reason',dispo_note=btrim(p_explanation),status='ended',ended_at=now(),updated_at=now()
      where id=p_call_id and lead_id=c.lead_id and firm_id=c.firm_id and claim_id=c.id and campaign_id=c.campaign_id returning id into saved;
    if saved is null then raise exception 'Call no longer available. Nothing saved.'; end if;
  else
    insert into public.intake_calls(firm_id,campaign_id,lead_id,claim_id,agent_id,agent_name,caller_id,first_name,call_type,answers,disposition,dispo_reasons,reason,dispo_note,status,ended_at,updated_at)
      values(c.firm_id,c.campaign_id,c.lead_id,c.id,(p_call->>'agent_id')::uuid,p_call->>'agent_name',p_call->>'caller_id',p_call->>'first_name','mva_console','{}',d,array(select jsonb_array_elements_text(p_call->'dispo_reasons')),p_call->>'reason',btrim(p_explanation),'ended',now(),now()) returning id into saved;
  end if;
  update public.claims set status=p_status,dq_reason_key=p_reason,dq_reason=p_call->>'reason',dq_explanation=btrim(p_explanation),qualification='dq',updated_at=now() where id=c.id;
  if p_status='dnc' then
    update public.leads set perm_call=false,perm_text=false,perm_email=false where id=c.lead_id and firm_id=c.firm_id;
    update public.contact_points set status='opted_out' where lead_id=c.lead_id and kind in ('mobile','landline');
  end if;
  return saved;
end $$;
revoke all on function public.cr_save_dq_call(uuid,uuid,uuid,timestamptz,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cr_save_dq_call(uuid,uuid,uuid,timestamptz,text,text,text,uuid,jsonb) to service_role;
commit;
