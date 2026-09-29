-- LawRuler's status is a source report. It cannot establish a completed
-- ClaimReach signature, a filed original, or a ClaimReach firm delivery.
insert into public.statuses
  (key, label, track, phase, tone, side, qualify, requires_esign,
   billable, unlocks_firm, is_final, lawruler_group, sort, active, system_locked)
values
  ('external_signed_review', 'LawRuler signing: verify packet', 'esign', 'in_qa', 'warn', 'owner', 'undetermined', false,
   false, false, true, 'Wanted/Chasing', 35, true, true),
  ('external_dq_review', 'LawRuler DQ: reason needed', 'intake', 'in_qa', 'warn', 'owner', 'undetermined', false,
   false, false, true, 'Rejected', 36, true, true)
on conflict (key) do nothing;

-- Correct only matters for which the LawRuler reconciliation itself made an
-- unsupported delivered claim. A verified DocuSeal packet or an actual
-- ClaimReach firm-delivery timestamp excludes the matter from this backfill.
with corrected as (
  update public.claims c
     set status = 'external_signed_review', updated_at = now()
    from public.leads l
   where c.lead_id = l.id
     and c.firm_id = l.firm_id
     and c.campaign = 'INNO MVA'
     and c.status = 'delivered'
     and c.firm_sent_at is null
     and l.lawruler_ref_no is not null
     and exists (
       select 1 from public.lead_activity a
        where a.lead_id = l.id and a.firm_id = c.firm_id
          and a.meta->>'claim_id' = c.id::text
          and a.meta->>'event' = 'mva_status_reconciliation'
          and a.meta->>'source' = 'lawruler'
          and a.meta->>'signature_validation' = 'not_performed'
          and a.meta->>'source_status' ilike 'signed%'
     )
     and not exists (
       select 1 from public.esign_submissions e
        where e.claim_id = c.id and e.lead_id = l.id and e.firm_id = c.firm_id
          and e.provider = 'docuseal' and e.pax_index is null
          and e.status = 'completed' and e.voided_at is null
          and e.completed_pdf_path is not null and e.cert_pdf_path is not null
     )
  returning c.id, c.lead_id, c.firm_id
)
insert into public.lead_activity (firm_id, lead_id, kind, body, meta)
select firm_id, lead_id, 'system',
       'LawRuler delivery report moved to evidence review; no verified signed packet or ClaimReach delivery was found.',
       jsonb_build_object('source', 'lawruler', 'event', 'evidence_review_backfill',
                          'claim_id', id, 'previous_status', 'delivered', 'status', 'external_signed_review')
  from corrected;

-- Closed/DQ source reports without a standardized reason must not appear as
-- fresh leads. They remain held for owner review, not finalized as a DQ.
with corrected as (
  update public.claims c
     set status = 'external_dq_review', updated_at = now()
    from public.leads l
   where c.lead_id = l.id
     and c.firm_id = l.firm_id
     and c.campaign = 'INNO MVA'
     and c.status = 'new'
     and c.dq_reason_key is null
     and l.lawruler_ref_no is not null
     and exists (
       select 1 from public.lead_activity a
        where a.lead_id = l.id and a.firm_id = c.firm_id
          and a.meta->>'claim_id' = c.id::text
          and a.meta->>'event' = 'mva_status_reconciliation'
          and a.meta->>'source' = 'lawruler'
          and a.meta->>'outcome' = 'review_required'
          and a.meta->>'mapped_status' in ('dq', 'dnc', 'duplicate', 'not_interested')
          and a.meta->>'acquisition_hold' = 'true'
     )
  returning c.id, c.lead_id, c.firm_id
)
insert into public.lead_activity (firm_id, lead_id, kind, body, meta)
select firm_id, lead_id, 'system',
       'LawRuler DQ report moved to owner review; a standardized DQ reason is still required.',
       jsonb_build_object('source', 'lawruler', 'event', 'dq_review_backfill',
                          'claim_id', id, 'previous_status', 'new', 'status', 'external_dq_review')
  from corrected;

update public.leads l
   set qa_pending = true
 where exists (
   select 1 from public.claims c
    where c.lead_id = l.id and c.firm_id = l.firm_id
      and c.status in ('external_signed_review', 'external_dq_review')
 );
