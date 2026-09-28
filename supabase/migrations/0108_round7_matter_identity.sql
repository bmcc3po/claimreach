-- ============================================================================
-- 0108 — Round 7 (Astra's round-6 review, Sep 28 2026).
--
-- 1. Matter identity columns. A call session and a signing carry the claim
--    they belong to, so autosave, disposition, the signed transition, QA and
--    delivery never guess a sibling matter:
--      intake_calls.claim_id, esign_submissions.claim_id, retainers.claim_id
--      (explicit association of legacy evidence), firm_deliveries.claim_id.
-- 2. Per-matter delivery guard: claims.firm_sent_at / firm_send_result, so
--    delivering one matter never marks a sibling "already sent".
-- 3. Signing-notification lifecycle: notify_state (pending/sending/sent/
--    no_recipient/failed/legacy_unknown), a recoverable lease
--    (notify_claimed_at), attempts and last error. A claim before a crash no
--    longer suppresses every later attempt. Existing markers: two rows were
--    claimed with no send recorded (the no-recipient path); they become
--    legacy_unknown and are NOT auto-resent.
-- 4. inbound_media: one row per texted-in attachment, keyed by provider event
--    + attachment, with pending/saved/failed/quarantined state, so filing
--    retries independently of message de-duplication and ambiguous senders
--    are quarantined for review instead of guessed.
-- 5. move_leads_to_firm v2: a COMPLETE supported transfer — documents are
--    relocated (the route moves the objects, this function re-points every
--    row under the storage guard, which is NOT weakened), claim_properties
--    follow their claims, and the target campaign must belong to the target
--    firm. A transfer that leaves any document un-relocated is refused.
-- ============================================================================

alter table intake_calls add column if not exists claim_id uuid references claims(id) on delete set null;
alter table esign_submissions add column if not exists claim_id uuid references claims(id) on delete set null;
alter table retainers add column if not exists claim_id uuid references claims(id) on delete set null;
alter table firm_deliveries add column if not exists claim_id uuid references claims(id) on delete set null;
create index if not exists intake_calls_claim_idx on intake_calls(claim_id);
create index if not exists esign_submissions_claim_idx on esign_submissions(claim_id);

alter table claims add column if not exists firm_sent_at timestamptz;
alter table claims add column if not exists firm_send_result text;

alter table esign_submissions add column if not exists notify_state text;
alter table esign_submissions add column if not exists notify_claimed_at timestamptz;
alter table esign_submissions add column if not exists notify_attempts int not null default 0;
alter table esign_submissions add column if not exists notify_error text;
update esign_submissions set notify_state = 'legacy_unknown'
 where signed_notified_at is not null and notify_state is null;

create table if not exists inbound_media (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'justcall',
  event_id text not null,
  media_key text not null,
  media_url text not null,
  content_type text,
  phone_norm text,
  lead_id uuid references leads(id) on delete set null,
  firm_id uuid references firms(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'saved', 'failed', 'quarantined', 'rejected')),
  attempts int not null default 0,
  last_error text,
  candidates jsonb,
  document_id uuid,
  storage_path text,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, event_id, media_key)
);
alter table inbound_media enable row level security;
drop policy if exists inbound_media_staff_read on inbound_media;
create policy inbound_media_staff_read on inbound_media for select to authenticated using (public.is_internal());
revoke all on inbound_media from anon;
revoke insert, update, delete on inbound_media from authenticated;
grant select on inbound_media to authenticated;
grant all on inbound_media to service_role;

-- ---- move_leads_to_firm v2 ------------------------------------------------
drop function if exists public.move_leads_to_firm(uuid[], uuid);

create or replace function public.move_leads_to_firm(
  p_lead_ids uuid[], p_firm_id uuid, p_campaign_id uuid, p_doc_moves jsonb default '[]'::jsonb
) returns int
language plpgsql
security definer
set search_path = public as $$
declare
  n int;
  t text;
  v_camp_name text;
  v_missing int;
begin
  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    raise exception 'move_leads_to_firm: no leads supplied';
  end if;
  if not exists (select 1 from firms where id = p_firm_id) then
    raise exception 'move_leads_to_firm: no such firm';
  end if;
  select name into v_camp_name from campaigns where id = p_campaign_id and firm_id = p_firm_id;
  if v_camp_name is null then
    raise exception 'move_leads_to_firm: the target campaign must belong to the target firm';
  end if;
  perform 1 from leads where id = any(p_lead_ids) for update;

  -- Every stored document must be relocated under the new firm's folder,
  -- or nothing moves. The storage guard trigger is untouched and checks each
  -- re-pointed row.
  select count(*) into v_missing
    from case_documents d
   where d.lead_id = any(p_lead_ids)
     and d.storage_path is not null
     and not exists (
       select 1 from jsonb_to_recordset(coalesce(p_doc_moves, '[]'::jsonb)) as m(id uuid, new_path text)
        where m.id = d.id
          and position(p_firm_id::text || '/' || d.lead_id::text || '/' in m.new_path) = 1);
  if v_missing > 0 then
    raise exception 'move_leads_to_firm: % document(s) were not relocated to the new firm', v_missing;
  end if;

  update leads set firm_id = p_firm_id, campaign_id = p_campaign_id, campaign = v_camp_name
   where id = any(p_lead_ids);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'move_leads_to_firm: no matching leads'; end if;

  update claims set firm_id = p_firm_id, campaign_id = p_campaign_id, campaign = v_camp_name
   where lead_id = any(p_lead_ids);
  update claim_properties set firm_id = p_firm_id
   where claim_id in (select id from claims where lead_id = any(p_lead_ids));

  update case_documents d set firm_id = p_firm_id, storage_path = m.new_path
    from jsonb_to_recordset(coalesce(p_doc_moves, '[]'::jsonb)) as m(id uuid, new_path text)
   where d.id = m.id and d.lead_id = any(p_lead_ids);
  update case_documents set firm_id = p_firm_id
   where lead_id = any(p_lead_ids) and storage_path is null;

  -- Signed agreements keep their stored paths (signed history is preserved);
  -- their rows follow the file so the new firm's people can open them.
  foreach t in array array[
    'claim_notes','communications','contact_points','drip_enrollments','esign_submissions',
    'intake_calls','lead_activity','lead_lor','lead_notes','lead_tags','notes','notifications',
    'qa_reviews','qa_thread','signable_documents','call_logs','call_schedule',
    'automation_queue','automation_runs','audit_log','firm_deliveries','inbound_media'
  ] loop
    execute format('update %I set firm_id = $1 where lead_id = any($2)', t)
      using p_firm_id, p_lead_ids;
  end loop;
  return n;
end $$;

revoke execute on function public.move_leads_to_firm(uuid[], uuid, uuid, jsonb) from public;
revoke execute on function public.move_leads_to_firm(uuid[], uuid, uuid, jsonb) from anon;
revoke execute on function public.move_leads_to_firm(uuid[], uuid, uuid, jsonb) from authenticated;
grant execute on function public.move_leads_to_firm(uuid[], uuid, uuid, jsonb) to service_role;

-- A note on privileges (correcting rounds 5-6): CREATE OR REPLACE on an
-- EXISTING function of the same identity keeps its owner and grants; a NEW
-- function (or a dropped/recreated one, as here) starts with PostgreSQL's
-- default EXECUTE to PUBLIC. Either way, the explicit revokes/grants above
-- plus a has_function_privilege probe are the rule.
