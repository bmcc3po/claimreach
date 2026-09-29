-- 0110: one durable delivery reservation per claim. LOCAL / NOT APPLIED.
-- The route remains the permission boundary. Only service_role can call these
-- functions or read/write this table; ordinary app roles receive no new access.
-- A provider timeout is never retried automatically: reconcile its outcome.
begin;
alter table public.firm_deliveries add column if not exists dispatch_key uuid;
create table if not exists public.firm_delivery_dispatch (
  claim_id uuid primary key references public.claims(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  attempt_key uuid not null,
  state text not null check (state in ('sending','sent','failed','uncertain')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  reconciled_at timestamptz,
  reconciled_by uuid references public.app_users(id),
  reconciliation_note text
);
alter table public.firm_delivery_dispatch enable row level security;
revoke all on public.firm_delivery_dispatch from public, anon, authenticated;
grant all on public.firm_delivery_dispatch to service_role;

create or replace function public.begin_firm_delivery(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid, p_campaign_id uuid, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.claims%rowtype; l public.leads%rowtype; d public.firm_delivery_dispatch%rowtype; k uuid;
begin
  select * into l from public.leads where id=p_lead_id for update;
  if not found or l.archived_at is not null then raise exception 'The file is missing or archived'; end if;
  select * into c from public.claims where id=p_claim_id and lead_id=p_lead_id for update;
  if not found then raise exception 'The selected matter does not belong to this file'; end if;
  if l.firm_id is distinct from p_firm_id or coalesce(c.firm_id,l.firm_id) is distinct from p_firm_id
    or coalesce(c.campaign_id,l.campaign_id) is distinct from p_campaign_id then
    raise exception 'The firm or campaign changed while preparing delivery. Refresh and check the recipient';
  end if;
  select * into d from public.firm_delivery_dispatch where claim_id=p_claim_id;
  if d.state in ('sending','uncertain') then
    return jsonb_build_object('state','blocked','attempt_key',d.attempt_key);
  end if;
  if not coalesce(p_force,false) and (c.firm_sent_at is not null or d.state='sent') then
    return jsonb_build_object('state','sent','attempt_key',d.attempt_key);
  end if;
  k := gen_random_uuid();
  insert into public.firm_delivery_dispatch(claim_id,lead_id,attempt_key,state)
  values(p_claim_id,p_lead_id,k,'sending')
  on conflict(claim_id) do update set lead_id=excluded.lead_id,attempt_key=k,state='sending',
    started_at=now(),finished_at=null,error=null,reconciled_at=null,reconciled_by=null,reconciliation_note=null;
  return jsonb_build_object('state','acquired','attempt_key',k);
end $$;

create or replace function public.finish_firm_delivery(p_claim_id uuid, p_attempt_key uuid, p_state text, p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_state not in ('sent','failed','uncertain') then raise exception 'Invalid delivery outcome'; end if;
  perform 1 from public.claims where id=p_claim_id for update;
  update public.firm_delivery_dispatch set state=p_state,finished_at=now(),error=p_error
    where claim_id=p_claim_id and attempt_key=p_attempt_key and state='sending';
  get diagnostics n = row_count;
  if n=1 and p_state='sent' then
    update public.claims set firm_sent_at=coalesce(firm_sent_at,now()),firm_send_result='sent' where id=p_claim_id;
  end if;
  return n=1;
end $$;

-- A logged, deliberate correction after checking the provider. This is NOT a
-- resend. 'not delivered' unlocks a later attempt; 'delivered' keeps the guard.
create or replace function public.reconcile_firm_delivery(p_lead_id uuid, p_claim_id uuid, p_attempt_key uuid, p_delivered boolean, p_actor_id uuid, p_note text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; c public.claims%rowtype; d public.firm_delivery_dispatch%rowtype;
begin
  if p_delivered is null or length(trim(coalesce(p_note,''))) < 10 then raise exception 'Explain the provider check before reconciling'; end if;
  if not exists(select 1 from public.app_users where id=p_actor_id and role in ('owner','admin') and active is not false) then
    raise exception 'Only an active owner or admin may reconcile delivery';
  end if;
  select * into c from public.claims where id=p_claim_id and lead_id=p_lead_id for update;
  if not found then raise exception 'The selected matter does not belong to this file'; end if;
  select * into d from public.firm_delivery_dispatch where claim_id=p_claim_id and attempt_key=p_attempt_key;
  if d.state='sending' and d.started_at > now() - interval '2 minutes' then
    raise exception 'The send may still be running. Wait two minutes before reconciling it';
  end if;
  update public.firm_delivery_dispatch set state=case when p_delivered then 'sent' else 'failed' end,
    finished_at=now(),error=null,reconciled_at=now(),reconciled_by=p_actor_id,reconciliation_note=trim(p_note)
    where claim_id=p_claim_id and lead_id=p_lead_id and attempt_key=p_attempt_key and state in ('sending','uncertain');
  get diagnostics n = row_count;
  if n=1 and p_delivered then
    update public.claims set firm_sent_at=coalesce(firm_sent_at,now()),firm_send_result='sent (reconciled)' where id=p_claim_id;
  end if;
  if n=1 then
    insert into public.firm_deliveries(lead_id,claim_id,campaign_id,firm_id,ok,error,triggered_by,actor_name,dispatch_key)
      select p_lead_id,p_claim_id,c.campaign_id,c.firm_id,p_delivered,'Reconciled: ' || trim(p_note),'reconciliation',u.full_name,p_attempt_key
      from public.app_users u where u.id=p_actor_id;
  end if;
  return n=1;
end $$;
-- Keep the assembled recipient binding stable after the reservation commits.
-- A transfer's copy phase may run, but its atomic row switch must wait for a
-- known delivery outcome; the existing transfer handler preserves originals.
-- The trigger must read the private reservation even for an ordinary session
-- update. Keep its narrowly privileged, read-only implementation off the API
-- schema; it grants no client access to dispatch metadata or RPCs.
create schema if not exists claimreach_delivery_private;
revoke all on schema claimreach_delivery_private from public,anon,authenticated;
grant usage on schema claimreach_delivery_private to service_role;
create or replace function claimreach_delivery_private.guard_delivery_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='leads' then
    if (new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id or new.archived_at is distinct from old.archived_at)
      and exists(select 1 from public.firm_delivery_dispatch where lead_id=old.id and state in ('sending','uncertain')) then
      raise exception 'Resolve the active or uncertain firm delivery before moving or archiving this file';
    end if;
  else
    if (new.lead_id is distinct from old.lead_id or new.firm_id is distinct from old.firm_id or new.campaign_id is distinct from old.campaign_id)
      and exists(select 1 from public.firm_delivery_dispatch where claim_id=old.id and state in ('sending','uncertain')) then
      raise exception 'Resolve the active or uncertain firm delivery before changing this matter association';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_delivery_lead_binding on public.leads;
create trigger guard_delivery_lead_binding before update of firm_id,campaign_id,archived_at on public.leads
  for each row execute function claimreach_delivery_private.guard_delivery_binding();
drop trigger if exists guard_delivery_claim_binding on public.claims;
create trigger guard_delivery_claim_binding before update of lead_id,firm_id,campaign_id on public.claims
  for each row execute function claimreach_delivery_private.guard_delivery_binding();
revoke all on function claimreach_delivery_private.guard_delivery_binding() from public,anon,authenticated;
grant execute on function claimreach_delivery_private.guard_delivery_binding() to service_role;
revoke all on function public.begin_firm_delivery(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.finish_firm_delivery(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reconcile_firm_delivery(uuid,uuid,uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_firm_delivery(uuid,uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.finish_firm_delivery(uuid,uuid,text,text) to service_role;
grant execute on function public.reconcile_firm_delivery(uuid,uuid,uuid,boolean,uuid,text) to service_role;
commit;
