-- ============================================================================
-- 0107 — Round-6 repairs from Astra's consolidated round-5 review (Sep 28 2026).
--
-- move_leads_to_firm: moving a file between firms was two separate writes
-- (leads, then claims) that could fail half-way and never touched the rest of
-- the record's ownership (documents, signings, communications, notes, QA,
-- activity). One SECURITY DEFINER function now moves the whole permitted
-- graph in ONE transaction: either everything about the lead belongs to the
-- new firm, or nothing changed. service_role only — the API route gates it
-- to owner/admin before calling.
-- ============================================================================

create or replace function public.move_leads_to_firm(p_lead_ids uuid[], p_firm_id uuid)
returns int
language plpgsql
security definer
set search_path = public as $$
declare
  n int;
  t text;
begin
  if p_lead_ids is null or array_length(p_lead_ids, 1) is null then
    raise exception 'move_leads_to_firm: no leads supplied';
  end if;
  if not exists (select 1 from firms where id = p_firm_id) then
    raise exception 'move_leads_to_firm: no such firm';
  end if;
  update leads set firm_id = p_firm_id where id = any(p_lead_ids);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'move_leads_to_firm: no matching leads';
  end if;
  -- Every table that carries both lead_id and firm_id follows the lead, so a
  -- moved file is never half-owned (Astra rounds 4-5).
  foreach t in array array[
    'claims','case_documents','claim_notes','communications','contact_points',
    'drip_enrollments','esign_submissions','intake_calls','lead_activity',
    'lead_lor','lead_notes','lead_tags',
    'notes','notifications','qa_reviews','qa_thread','signable_documents',
    'call_logs','call_schedule','automation_queue','automation_runs','audit_log','firm_deliveries'
  ] loop
    execute format('update %I set firm_id = $1 where lead_id = any($2)', t)
      using p_firm_id, p_lead_ids;
  end loop;
  return n;
end $$;

-- Effective privileges: nobody but the server. PUBLIC's implicit EXECUTE is
-- revoked explicitly (the 0106 lesson: create-or-replace resets the ACL).
revoke execute on function public.move_leads_to_firm(uuid[], uuid) from public;
revoke execute on function public.move_leads_to_firm(uuid[], uuid) from anon;
revoke execute on function public.move_leads_to_firm(uuid[], uuid) from authenticated;
grant execute on function public.move_leads_to_firm(uuid[], uuid) to service_role;
