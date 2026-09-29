-- Local v9 migration. Apply only with the matching emergency signing routes.
-- No public RPC: the server validates the capability, consent and PNG first.
-- Evidence and packet membership are immutable once a signing begins.
create or replace function public.guard_emergency_evidence()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.audit->'emergency'->>'version' = '1' then
    if tg_op = 'DELETE' then
      raise exception 'Emergency signing history cannot be deleted; cancel the pending agreement instead';
    end if;
    if ((new.audit->'emergency') - 'evidence') is distinct from ((old.audit->'emergency') - 'evidence')
       or (new.audit->'emergency'->'snapshot') is distinct from (old.audit->'emergency'->'snapshot')
       or (new.audit->'emergency'->'packet_manifest') is distinct from (old.audit->'emergency'->'packet_manifest')
       or (new.audit->'emergency'->>'claim_id') is distinct from (old.audit->'emergency'->>'claim_id')
       or (new.audit->'emergency'->>'campaign_id') is distinct from (old.audit->'emergency'->>'campaign_id')
       or new.lead_id is distinct from old.lead_id or new.firm_id is distinct from old.firm_id
       or new.envelope_id is distinct from old.envelope_id or new.packet_group is distinct from old.packet_group or new.created_at is distinct from old.created_at
       or new.provider is distinct from old.provider or new.certified is distinct from old.certified
       or new.title is distinct from old.title or new.signer_name is distinct from old.signer_name
       or new.signer_email is distinct from old.signer_email or new.signer_phone is distinct from old.signer_phone
       or new.sender_ip is distinct from old.sender_ip or new.sent_at is distinct from old.sent_at then
      raise exception 'The issued emergency document snapshot is immutable';
    end if;
    if new.status = 'signed' and old.status not in ('signing', 'signed') then
      raise exception 'Emergency completion requires recorded signature evidence';
    end if;
    if current_user not in ('postgres', 'service_role', 'supabase_admin') and (
      (new.status in ('signing','signed') and new.status is distinct from old.status)
      or new.signature_data is distinct from old.signature_data or new.consent_at is distinct from old.consent_at
      or (new.audit->'emergency'->'evidence') is distinct from (old.audit->'emergency'->'evidence')
      or new.completed_pdf_path is distinct from old.completed_pdf_path or new.cert_pdf_path is distinct from old.cert_pdf_path
    ) then raise exception 'Emergency evidence is written only by the signing transaction'; end if;
    if old.status in ('signing', 'signed', 'cancelled', 'declined') then
      if new.signature_data is distinct from old.signature_data or new.signed_name is distinct from old.signed_name
         or new.signed_at is distinct from old.signed_at or new.signed_ip is distinct from old.signed_ip
         or new.signature_type is distinct from old.signature_type or new.doc_hash is distinct from old.doc_hash
         or new.consent_at is distinct from old.consent_at
         or (new.audit->'emergency'->'evidence') is distinct from (old.audit->'emergency'->'evidence') then
        raise exception 'Recorded signature and consent evidence cannot be replaced';
      end if;
      if new.status is distinct from old.status and not (old.status = 'signing' and new.status = 'signed') then
        raise exception 'This emergency agreement cannot be reopened or cancelled after signing began';
      end if;
    end if;
    if old.completed_pdf_path is not null and new.completed_pdf_path is distinct from old.completed_pdf_path then
      raise exception 'The signed PDF reference is immutable';
    end if;
    if old.cert_pdf_path is not null and new.cert_pdf_path is distinct from old.cert_pdf_path then
      raise exception 'The signing certificate reference is immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_emergency_evidence on public.signable_documents;
create trigger trg_emergency_evidence before update or delete on public.signable_documents
for each row execute function public.guard_emergency_evidence();

create or replace function public.begin_emergency_signing(p_ids uuid[], p_hash text, p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.signable_documents; n integer; manifest jsonb; at_time timestamptz := now();
begin
  if cardinality(p_ids) is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 30
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid packet evidence'; end if;
  if p_evidence->>'consent_version' is distinct from 'emergency-v1'
     or p_evidence->>'consent_accepted' is distinct from 'true'
     or length(trim(coalesce(p_evidence->>'signed_name', ''))) < 2
     or coalesce(p_evidence->>'signature_data', '') not like 'data:image/png;base64,%' then
    raise exception 'Signature and electronic consent are required';
  end if;
  perform id from public.signable_documents where id = any(p_ids) order by id for update;
  select count(*) into n from public.signable_documents where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Packet membership changed'; end if;
  select jsonb_agg(x::text order by x::text) into manifest from unnest(p_ids) x;
  for d in select * from public.signable_documents where id = any(p_ids) order by id loop
    if d.certified or d.provider is distinct from 'builtin' or d.audit->'emergency'->>'version' is distinct from '1'
       or (select jsonb_agg(v order by v) from jsonb_array_elements_text(d.audit->'emergency'->'packet_manifest') v) is distinct from manifest
       or d.audit->'emergency'->'snapshot'->>'source_sha256' is null then raise exception 'Emergency snapshot unavailable'; end if;
    if d.status in ('signing', 'signed') then
      if d.audit->'emergency'->'evidence'->>'hash' is distinct from p_hash then raise exception 'This packet already has different signature evidence'; end if;
    elsif d.status not in ('sent', 'viewed') then raise exception 'This signing link is no longer open'; end if;
  end loop;
  update public.signable_documents set status = 'signing', signed_at = at_time, consent_at = at_time,
    signature_data = p_evidence->>'signature_data', signed_name = p_evidence->>'signed_name',
    signature_type = p_evidence->>'signature_type', signed_ip = p_evidence->>'ip',
    doc_hash = audit->'emergency'->'snapshot'->>'source_sha256',
    audit = jsonb_set(audit, '{emergency,evidence}', p_evidence || jsonb_build_object('hash', p_hash, 'at', at_time))
    where id = any(p_ids) and status in ('sent', 'viewed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.finish_emergency_signing(p_ids uuid[], p_hash text, p_artifacts jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.signable_documents; a jsonb; n integer; changed integer; folder text; signed_path text; cert_path text;
begin
  if cardinality(p_ids) is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 30
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or jsonb_array_length(p_artifacts) <> cardinality(p_ids) then raise exception 'Invalid packet artifacts'; end if;
  perform id from public.signable_documents where id = any(p_ids) order by id for update;
  select count(*) into n from public.signable_documents where id = any(p_ids);
  if n <> cardinality(p_ids) then raise exception 'Packet membership changed'; end if;
  for d in select * from public.signable_documents where id = any(p_ids) order by id loop
    if d.status not in ('signing', 'signed') or d.audit->'emergency'->'evidence'->>'hash' is distinct from p_hash
       or cardinality(p_ids) <> jsonb_array_length(d.audit->'emergency'->'packet_manifest')
       or not (d.audit->'emergency'->'packet_manifest' @> to_jsonb(p_ids)) then raise exception 'Signature evidence does not match'; end if;
    select value into a from jsonb_array_elements(p_artifacts) where value->>'id' = d.id::text;
    folder := coalesce(d.firm_id::text, 'master');
    signed_path := folder || '/signed-' || d.envelope_id || '.pdf';
    cert_path := folder || '/cert-' || d.envelope_id || '.pdf';
    if a is null or a->>'completed_pdf_path' is distinct from signed_path or a->>'cert_pdf_path' is distinct from cert_path
       or not exists(select 1 from storage.objects where bucket_id = 'signed-docs' and name = signed_path)
       or not exists(select 1 from storage.objects where bucket_id = 'signed-docs' and name = cert_path) then raise exception 'The complete signed packet is not stored'; end if;
  end loop;
  update public.signable_documents target_doc set status = 'signed',
    completed_pdf_path = artifact_row.value->>'completed_pdf_path', cert_pdf_path = artifact_row.value->>'cert_pdf_path',
    completed_pdf_url = '/api/signed-doc/' || target_doc.id || '/signed', cert_pdf_url = '/api/signed-doc/' || target_doc.id || '/cert'
    from jsonb_array_elements(p_artifacts) artifact_row where target_doc.id = any(p_ids) and artifact_row.value->>'id' = target_doc.id::text and target_doc.status = 'signing';
  get diagnostics changed = row_count;
  if changed > 0 then
    select * into d from public.signable_documents where id = p_ids[1];
    insert into public.notifications (firm_id, sender_name, lead_id, body)
      values(d.firm_id, 'E-Sign', d.lead_id, 'Emergency agreement recorded for ' || coalesce(d.signed_name, 'client') || '. DocuSeal re-sign is still required.');
  end if;
  return jsonb_build_object('ok', true, 'already', changed = 0, 'needs_resign', true);
end $$;

revoke all on function public.guard_emergency_evidence() from public, anon, authenticated;
revoke all on function public.begin_emergency_signing(uuid[], text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_emergency_signing(uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.guard_emergency_evidence() to service_role;
grant execute on function public.begin_emergency_signing(uuid[], text, jsonb) to service_role;
grant execute on function public.finish_emergency_signing(uuid[], text, jsonb) to service_role;
