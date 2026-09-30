-- Reserve a signer before creating a passenger file or touching DocuSeal.
-- No elapsed-time cleanup: pending/uncertain attempts require reconciliation.
begin;

create table public.esign_send_attempts (
  id uuid primary key default gen_random_uuid(),
  parent_lead_id uuid not null references public.leads(id),
  parent_claim_id uuid not null references public.claims(id),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  actor_id uuid not null,
  pax_key text not null default '' check (pax_key='' or pax_key ~ '^[A-Za-z0-9_-]{1,40}$'),
  pax_index integer check (pax_index is null or pax_index>=0),
  target_lead_id uuid references public.leads(id),
  target_claim_id uuid references public.claims(id),
  expected_submission_id uuid references public.esign_submissions(id),
  expected_status text,
  emergency_document_id uuid references public.signable_documents(id),
  template_key text,
  template_id text,
  via text check (via in ('Text','Email')),
  send_context jsonb not null default '{}' check (jsonb_typeof(send_context)='object'),
  state text not null default 'reserved' check (state in ('reserved','provider_pending','uncertain','linked','rejected')),
  bound_at timestamptz,
  provider_started_at timestamptz,
  linked_submission_id uuid unique references public.esign_submissions(id),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_code text check (resolution_code is null or resolution_code in ('provider_linked','provider_rejected','pre_provider_abort','provider_expired')),
  reconciled_provider_submission_id text,
  verified_expired_at timestamptz,
  check ((target_lead_id is null) = (target_claim_id is null)),
  check ((state='linked') = (linked_submission_id is not null))
);
create unique index esign_send_attempts_one_pending_signer on public.esign_send_attempts(parent_claim_id,pax_key)
  where state in ('reserved','provider_pending','uncertain');
create unique index esign_send_attempts_one_pending_target on public.esign_send_attempts(target_claim_id)
  where target_claim_id is not null and state in ('reserved','provider_pending','uncertain');
create index esign_send_attempts_target_history on public.esign_send_attempts(target_claim_id,created_at desc);
alter table public.esign_send_attempts enable row level security;
revoke all on public.esign_send_attempts from public,anon,authenticated,service_role;
grant select on public.esign_send_attempts to service_role;

-- Internal checks take the authenticated actor selected by the trusted route,
-- not JWT metadata or a role supplied in the request body. Entry RPCs below are
-- executable only by service_role; the browser cannot impersonate this actor.
create function public.cr_esign_attempt_scope(p_actor_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims%rowtype; l public.leads%rowtype; u public.app_users%rowtype;
begin
  select * into u from public.app_users where id=p_actor_id;
  if not found or u.active is distinct from true or u.role not in ('owner','admin','manager','agent','qa') then
    raise exception 'An active intake user is required.' using errcode='42501';
  end if;
  select * into c from public.claims where id=p_claim_id;
  if not found then raise exception 'Signing matter is unavailable.'; end if;
  select * into l from public.leads where id=c.lead_id;
  if not found or l.archived_at is not null or c.firm_id is distinct from l.firm_id or c.campaign_id is null
    or not exists(select 1 from public.campaigns where id=c.campaign_id and firm_id=c.firm_id and active) then
    raise exception 'Signing matter scope changed. Refresh before sending.';
  end if;
  if u.role<>'owner' and (c.campaign_id is distinct from public.cr_inno_mva_campaign_id()
    or c.firm_id is distinct from public.cr_inno_mva_firm_id() or c.claim_type is distinct from 'mva') then
    raise exception 'This signing matter is outside the intake pilot.' using errcode='42501';
  end if;
  return jsonb_build_object('lead_id',l.id,'claim_id',c.id,'firm_id',c.firm_id,'campaign_id',c.campaign_id,'external_id',l.external_id,'status',c.status);
end $$;

create function public.cr_esign_attempt_latest(p_lead_id uuid,p_claim_id uuid,p_campaign_id uuid)
returns public.esign_submissions language plpgsql security definer set search_path='' as $$
declare r public.esign_submissions%rowtype; n integer; passenger boolean;
begin
  select count(*) into n from public.claims where lead_id=p_lead_id;
  select coalesce(external_id,'') ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' into passenger from public.leads where id=p_lead_id;
  if n<>1 and exists(select 1 from public.esign_submissions where lead_id=p_lead_id and claim_id is null
    and voided_at is null and status in ('sending','sent','opened','signed','completed','uncertain')
    and (campaign_id is null or campaign_id=p_campaign_id)) then
    raise exception 'An unassigned legacy agreement needs owner review before another send.';
  end if;
  select * into r from public.esign_submissions where lead_id=p_lead_id
    and (claim_id=p_claim_id or (claim_id is null and n=1 and (campaign_id is null or campaign_id=p_campaign_id)))
    and (passenger or pax_index is null)
    order by created_at desc,id desc limit 1;
  return r;
end $$;

create function public.cr_esign_attempt_emergency(p_document_id uuid,p_lead_id uuid,p_claim_id uuid,p_firm_id uuid,p_campaign_id uuid,p_primary_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.signable_documents d where d.id=p_document_id and d.lead_id=p_lead_id and d.firm_id=p_firm_id
    and d.status='signed' and d.audit->'emergency'->>'claim_id'=p_claim_id::text
    and (d.audit->'emergency'->>'campaign_id' is null or d.audit->'emergency'->>'campaign_id'=p_campaign_id::text)
    and d.id=(select e.id from public.signable_documents e where e.lead_id=p_lead_id and e.audit->'emergency'->>'claim_id'=p_claim_id::text order by e.created_at desc,e.id desc limit 1)
    and (p_primary_id is null or d.created_at>(select created_at from public.esign_submissions where id=p_primary_id)));
$$;

create function public.cr_reserve_esign_send(p_parent_claim_id uuid,p_actor_id uuid,p_pax_key text default null,p_pax_index integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; parent_scope jsonb; parent_claim uuid:=p_parent_claim_id; parent_lead uuid; key text:=coalesce(p_pax_key,'');
  ext text; candidates uuid[]; a public.esign_send_attempts%rowtype;
begin
  scope:=public.cr_esign_attempt_scope(p_actor_id,p_parent_claim_id);
  parent_lead:=(scope->>'lead_id')::uuid; ext:=coalesce(scope->>'external_id','');
  if key<>'' and (key !~ '^[A-Za-z0-9_-]{1,40}$' or p_pax_index is null or p_pax_index<0) then raise exception 'Invalid passenger signing key.'; end if;
  if key='' and p_pax_index is not null then raise exception 'Passenger signing key is required.'; end if;
  -- Opening a passenger directly and opening it from its parent use one mutex.
  if ext ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' then
    if key<>'' then raise exception 'Open this passenger directly before adding another signer.'; end if;
    parent_lead:=split_part(ext,':pax:',1)::uuid; key:=split_part(ext,':pax:',2);
    select array_agg(id) into candidates from public.claims where lead_id=parent_lead
      and firm_id=(scope->>'firm_id')::uuid and campaign_id=(scope->>'campaign_id')::uuid;
    if coalesce(array_length(candidates,1),0)<>1 then raise exception 'Passenger parent matter is ambiguous. Ask the owner to review it.'; end if;
    parent_claim:=candidates[1];
  end if;
  -- The legacy passenger external key contains lead+person, not claim. Two
  -- same-campaign matters cannot safely create separate files with that key.
  if key<>'' and 1<>(select count(*) from public.claims where lead_id=parent_lead and campaign_id=(scope->>'campaign_id')::uuid and firm_id=(scope->>'firm_id')::uuid) then
    raise exception 'Passenger parent matter is ambiguous. Ask the owner to review it.';
  end if;
  perform 1 from public.claims where id=parent_claim for update;
  parent_scope:=public.cr_esign_attempt_scope(p_actor_id,parent_claim);
  if parent_scope->>'lead_id' is distinct from parent_lead::text or parent_scope->>'firm_id' is distinct from scope->>'firm_id'
    or parent_scope->>'campaign_id' is distinct from scope->>'campaign_id' then raise exception 'Passenger parent scope changed.'; end if;
  if exists(select 1 from public.esign_send_attempts where parent_claim_id=parent_claim and pax_key=key and state in ('reserved','provider_pending','uncertain')) then
    raise exception 'Agreement send already pending. Check its status; an owner must reconcile an uncertain send.' using errcode='55000';
  end if;
  insert into public.esign_send_attempts(parent_lead_id,parent_claim_id,firm_id,campaign_id,actor_id,pax_key,pax_index)
    values(parent_lead,parent_claim,(scope->>'firm_id')::uuid,(scope->>'campaign_id')::uuid,p_actor_id,key,p_pax_index) returning * into a;
  return to_jsonb(a)||jsonb_build_object('acquired',true);
end $$;

create function public.cr_bind_esign_send(p_attempt_id uuid,p_target_lead_id uuid,p_target_claim_id uuid,p_expected_submission_id uuid,p_expected_status text,p_template_key text,p_template_id text,p_via text,p_send_context jsonb default '{}',p_emergency_document_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype; k text;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state<>'reserved' or a.bound_at is not null then raise exception 'Signing reservation is not available for binding.'; end if;
  perform 1 from public.claims where id=p_target_claim_id for update;
  scope:=public.cr_esign_attempt_scope(a.actor_id,p_target_claim_id);
  parent_scope:=public.cr_esign_attempt_scope(a.actor_id,a.parent_claim_id);
  if scope->>'lead_id' is distinct from p_target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text then raise exception 'Signing reservation scope changed.'; end if;
  if (a.pax_key='' and (p_target_claim_id<>a.parent_claim_id or p_target_lead_id<>a.parent_lead_id))
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key) then
    raise exception 'Signing reservation belongs to a different signer.';
  end if;
  old:=public.cr_esign_attempt_latest(p_target_lead_id,p_target_claim_id,a.campaign_id);
  if old.id is distinct from p_expected_submission_id or old.status is distinct from p_expected_status then
    raise exception 'The current agreement changed. Refresh before sending.' using errcode='55000';
  end if;
  if coalesce(length(trim(p_template_key)),0)=0 or coalesce(length(trim(p_template_id)),0)=0 or p_via not in ('Text','Email') or p_via is null then
    raise exception 'A template and delivery channel are required.';
  end if;
  if scope->>'status' in ('delivered','retained') then raise exception 'This matter was already delivered. Owner review is required.'; end if;
  if p_emergency_document_id is not null and not public.cr_esign_attempt_emergency(p_emergency_document_id,p_target_lead_id,p_target_claim_id,a.firm_id,a.campaign_id,p_expected_submission_id) then
    raise exception 'The signed emergency agreement is no longer current for this matter.';
  end if;
  if jsonb_typeof(p_send_context) is distinct from 'object' then raise exception 'Invalid signing context.'; end if;
  for k in select jsonb_object_keys(p_send_context) loop
    if k<>all(array['signer_name','injured_name','phone','email','call_id','pax_index','replacement_of']) then raise exception 'Unsupported signing context field.'; end if;
    if jsonb_typeof(p_send_context->k) not in ('null','string','number') then raise exception 'Invalid signing context value.'; end if;
    if length(p_send_context->>k)>320 then raise exception 'Signing context value is too long.'; end if;
  end loop;
  if nullif(p_send_context->>'replacement_of','')::uuid is not null and nullif(p_send_context->>'replacement_of','')::uuid is distinct from p_expected_submission_id then raise exception 'Replacement context does not match the current agreement.'; end if;
  update public.esign_send_attempts set target_lead_id=p_target_lead_id,target_claim_id=p_target_claim_id,
    expected_submission_id=p_expected_submission_id,expected_status=p_expected_status,emergency_document_id=p_emergency_document_id,template_key=p_template_key,template_id=p_template_id,via=p_via,send_context=p_send_context,bound_at=now(),updated_at=now()
    where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_mark_esign_send_pending(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state<>'reserved' or a.bound_at is null then raise exception 'Signing reservation cannot start another provider request.'; end if;
  perform 1 from public.claims where id=a.target_claim_id for update;
  scope:=public.cr_esign_attempt_scope(a.actor_id,a.target_claim_id); parent_scope:=public.cr_esign_attempt_scope(a.actor_id,a.parent_claim_id);
  if scope->>'lead_id' is distinct from a.target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key)
    or scope->>'status' in ('delivered','retained') then raise exception 'Signing reservation scope changed before sending.'; end if;
  old:=public.cr_esign_attempt_latest(a.target_lead_id,a.target_claim_id,a.campaign_id);
  -- An original may have been safely expired or held by the correction flow,
  -- but no different agreement may appear between binding and provider create.
  if old.id is distinct from a.expected_submission_id then raise exception 'The current agreement changed before sending.'; end if;
  if a.emergency_document_id is not null and not public.cr_esign_attempt_emergency(a.emergency_document_id,a.target_lead_id,a.target_claim_id,a.firm_id,a.campaign_id,a.expected_submission_id) then
    raise exception 'The signed emergency agreement changed before sending.';
  end if;
  if a.emergency_document_id is null and old.id is not null and old.voided_at is null and old.status not in ('voided','expired','declined','failed') then
    if old.status='completed' or old.completed_at is not null or not(old.signed_at is not null or old.status='signed')
      or old.agent_reviewed_at is null or old.replacement_requested_at is null then
      raise exception 'The original agreement has not been cleared for correction.';
    end if;
  end if;
  update public.esign_send_attempts set state='provider_pending',provider_started_at=now(),updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_hold_esign_send(p_attempt_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z_]{1,64}$' then raise exception 'Use a non-sensitive error code.'; end if;
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or not(a.state in ('provider_pending','uncertain') or (a.state='reserved' and p_error_code in ('prior_expiry_unconfirmed','prior_retirement_failed','passenger_creation_unconfirmed'))) then raise exception 'This attempt cannot be marked uncertain.'; end if;
  update public.esign_send_attempts set state='uncertain',error_code=p_error_code,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_reject_esign_send(p_attempt_id uuid,p_error_code text,p_provider_rejected boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Signing reservation is unavailable.'; end if;
  if ((a.state='reserved' and p_error_code='pre_provider_abort' and p_provider_rejected is false)
    or (a.state='provider_pending' and p_provider_rejected is true and p_error_code='definitive_provider_rejection')) is not true then
    raise exception 'An uncertain send cannot be released for retry.';
  end if;
  update public.esign_send_attempts set state='rejected',error_code=p_error_code,resolved_at=now(),resolved_by=a.actor_id,
    resolution_code=case when p_provider_rejected then 'provider_rejected' else 'pre_provider_abort' end,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_finalize_esign_send(p_attempt_id uuid,p_submission jsonb,p_reconciled_by uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype; r public.esign_submissions%rowtype; scope jsonb; parent_scope jsonb; old public.esign_submissions%rowtype; provider_id text; k text; call_id uuid; replacement_id uuid;
begin
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Signing reservation is unavailable.'; end if;
  if jsonb_typeof(p_submission) is distinct from 'object' then raise exception 'A provider-backed signing record is required.'; end if;
  if p_reconciled_by is not null and not exists(select 1 from public.app_users where id=p_reconciled_by and active and role='owner') then raise exception 'Only an active owner can reconcile a send.' using errcode='42501'; end if;
  for k in select jsonb_object_keys(p_submission) loop
    if k<>all(array['firm_id','lead_id','call_id','campaign_id','provider','template_key','template_id','claim_id','submission_id','client_submitter_id','intake_submitter_id','signer_name','injured_name','phone','email','via','pax_index','status','sign_url','sent_by','replacement_of']) then
      raise exception 'Unsupported signing record field.';
    end if;
  end loop;
  p_submission:=a.send_context||p_submission;
  provider_id:=nullif(trim(p_submission->>'submission_id'),'');
  if provider_id is null or nullif(trim(p_submission->>'client_submitter_id'),'') is null then raise exception 'Provider submission and client signer IDs are required.'; end if;
  if a.state='linked' then
    select * into r from public.esign_submissions where id=a.linked_submission_id;
    if r.submission_id is distinct from provider_id then raise exception 'This attempt is already linked to another provider submission.'; end if;
    return jsonb_build_object('id',r.id,'attempt_id',a.id);
  end if;
  if a.state not in ('provider_pending','uncertain') or a.bound_at is null or a.provider_started_at is null then raise exception 'This attempt has no pending provider request.'; end if;
  -- Scope changes after provider create hold the attempt, rather than attaching
  -- a signature to a reassigned file. The failure leaves its mutex in place.
  scope:=public.cr_esign_attempt_scope(coalesce(p_reconciled_by,a.actor_id),a.target_claim_id);
  parent_scope:=public.cr_esign_attempt_scope(coalesce(p_reconciled_by,a.actor_id),a.parent_claim_id);
  if scope->>'lead_id' is distinct from a.target_lead_id::text or scope->>'firm_id' is distinct from a.firm_id::text or scope->>'campaign_id' is distinct from a.campaign_id::text
    or parent_scope->>'lead_id' is distinct from a.parent_lead_id::text or parent_scope->>'campaign_id' is distinct from a.campaign_id::text
    or (a.pax_key<>'' and scope->>'external_id' is distinct from a.parent_lead_id::text||':pax:'||a.pax_key) then raise exception 'Signing matter changed. Owner reconciliation is required.'; end if;
  old:=public.cr_esign_attempt_latest(a.target_lead_id,a.target_claim_id,a.campaign_id);
  if old.id is distinct from a.expected_submission_id then raise exception 'Agreement changed during provider create. Owner reconciliation is required.'; end if;
  if a.emergency_document_id is not null and not public.cr_esign_attempt_emergency(a.emergency_document_id,a.target_lead_id,a.target_claim_id,a.firm_id,a.campaign_id,a.expected_submission_id) then
    raise exception 'The signed emergency agreement changed during provider create. Owner reconciliation is required.';
  end if;
  for k in select unnest(array['firm_id','lead_id','campaign_id','claim_id','template_key','template_id','via','sent_by']) loop
    if p_submission ? k and p_submission->>k is distinct from (case k
      when 'firm_id' then a.firm_id::text when 'lead_id' then a.target_lead_id::text when 'campaign_id' then a.campaign_id::text
      when 'claim_id' then a.target_claim_id::text when 'template_key' then a.template_key when 'template_id' then a.template_id when 'via' then a.via when 'sent_by' then a.actor_id::text end) then
      raise exception 'Provider signing record does not match its reservation.';
    end if;
  end loop;
  if coalesce(p_submission->>'provider','docuseal')<>'docuseal' or coalesce(p_submission->>'status','sent')<>'sent' then raise exception 'Only a newly created DocuSeal submission can be finalized.'; end if;
  call_id:=nullif(p_submission->>'call_id','')::uuid;
  if call_id is not null and not exists(select 1 from public.intake_calls where id=call_id and lead_id in (a.parent_lead_id,a.target_lead_id)
    and (claim_id in (a.parent_claim_id,a.target_claim_id) or (claim_id is null and 1=(select count(*) from public.claims where lead_id=intake_calls.lead_id)))) then
    raise exception 'The intake call belongs to another matter.';
  end if;
  replacement_id:=nullif(p_submission->>'replacement_of','')::uuid;
  if replacement_id is not null and replacement_id is distinct from a.expected_submission_id then raise exception 'Replacement agreement does not match its reservation.'; end if;
  insert into public.esign_submissions(firm_id,lead_id,call_id,campaign_id,provider,template_key,template_id,claim_id,
    submission_id,client_submitter_id,intake_submitter_id,signer_name,injured_name,phone,email,via,pax_index,status,sign_url,sent_by,replacement_of,sent_at)
  values(a.firm_id,a.target_lead_id,call_id,a.campaign_id,'docuseal',a.template_key,a.template_id,a.target_claim_id,
    provider_id,p_submission->>'client_submitter_id',nullif(p_submission->>'intake_submitter_id',''),p_submission->>'signer_name',p_submission->>'injured_name',
    p_submission->>'phone',p_submission->>'email',a.via,a.pax_index,'sent',p_submission->>'sign_url',a.actor_id,replacement_id,a.provider_started_at) returning * into r;
  update public.esign_send_attempts set state='linked',linked_submission_id=r.id,resolved_at=now(),resolved_by=coalesce(p_reconciled_by,a.actor_id),resolution_code='provider_linked',reconciled_provider_submission_id=provider_id,updated_at=now() where id=a.id;
  return jsonb_build_object('id',r.id,'attempt_id',a.id);
end $$;

-- Deliberate owner reconciliation can retire an untracked provider submission
-- only after a trusted route has GET-verified that exact provider ID expired.
-- There is deliberately no "not found", elapsed-time, or blanket unlock RPC.
create function public.cr_reconcile_expired_esign_send(p_attempt_id uuid,p_owner_id uuid,p_provider_submission_id text,p_verified_expired_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.esign_send_attempts%rowtype;
begin
  if not exists(select 1 from public.app_users where id=p_owner_id and active and role='owner') then raise exception 'An active owner must reconcile this send.' using errcode='42501'; end if;
  if nullif(trim(p_provider_submission_id),'') is null or p_verified_expired_at is null or p_verified_expired_at>now() then raise exception 'A verified expired provider submission is required.'; end if;
  select * into a from public.esign_send_attempts where id=p_attempt_id for update;
  if not found or a.state not in ('provider_pending','uncertain') then raise exception 'This send does not need provider reconciliation.'; end if;
  -- Provider identity is kept as a fixed field, not a free-form payload.
  update public.esign_send_attempts set state='rejected',resolved_at=now(),resolved_by=p_owner_id,resolution_code='provider_expired',error_code='provider_expired',reconciled_provider_submission_id=p_provider_submission_id,verified_expired_at=p_verified_expired_at,updated_at=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;

create function public.cr_pending_esign_send(p_claim_id uuid,p_pax_key text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.claims%rowtype; l public.leads%rowtype; parent_claim uuid:=p_claim_id; key text:=coalesce(p_pax_key,''); candidates uuid[]; a public.esign_send_attempts%rowtype;
begin
  select * into c from public.claims where id=p_claim_id;
  if not found then raise exception 'Signing matter is unavailable.'; end if;
  select * into l from public.leads where id=c.lead_id;
  if key<>'' and key !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Invalid passenger signing key.'; end if;
  if coalesce(l.external_id,'') ~ '^[0-9a-fA-F-]{36}:pax:[A-Za-z0-9_-]{1,40}$' then
    if key<>'' then raise exception 'Nested passenger signing is unavailable.'; end if;
    key:=split_part(l.external_id,':pax:',2);
    select array_agg(id) into candidates from public.claims where lead_id=split_part(l.external_id,':pax:',1)::uuid and firm_id=c.firm_id and campaign_id=c.campaign_id;
    if coalesce(array_length(candidates,1),0)<>1 then raise exception 'Passenger parent matter is ambiguous.'; end if;
    parent_claim:=candidates[1];
  end if;
  select * into a from public.esign_send_attempts where parent_claim_id=parent_claim and pax_key=key and state in ('reserved','provider_pending','uncertain');
  if not found then return null; end if;
  return to_jsonb(a);
end $$;

-- Function ownership runs the atomic writes; only the trusted server role can
-- enter them. Table writes stay unavailable even to a direct service client.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cr_esign_attempt_scope','cr_esign_attempt_latest','cr_esign_attempt_emergency','cr_reserve_esign_send','cr_bind_esign_send','cr_mark_esign_send_pending','cr_hold_esign_send','cr_reject_esign_send','cr_finalize_esign_send','cr_reconcile_expired_esign_send','cr_pending_esign_send') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('cr_esign_attempt_scope','cr_esign_attempt_latest','cr_esign_attempt_emergency') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
commit;
