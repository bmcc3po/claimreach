-- A client-signed agreement must remain evidence when an agent sends a
-- corrected one.  This is a delivery hold, not a deletion or a void.
alter table public.esign_submissions
  add column if not exists replacement_requested_at timestamptz,
  add column if not exists replacement_requested_by uuid,
  add column if not exists replacement_reason text,
  add column if not exists replacement_of uuid references public.esign_submissions(id) on delete set null,
  add column if not exists agent_reviewed_at timestamptz,
  add column if not exists agent_reviewed_by uuid;

create index if not exists esign_submissions_replacement_review_idx
  on public.esign_submissions (lead_id, claim_id, replacement_requested_at)
  where replacement_requested_at is not null and voided_at is null;
