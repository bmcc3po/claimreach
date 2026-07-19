-- ============================================================================
-- 0066 DELETE MEANS ARCHIVE
--
-- Deleting a lead destroyed it and everything hanging off it: the claim, the
-- answers, the QA review, the call log, the signed retainer. One wrong checkbox
-- on a bulk selection and a signed file is gone with no way back.
--
-- Delete now archives. The row stays, hidden from every normal view, for at
-- least 90 days. Only an owner can destroy it for real, and only after it has
-- been archived, so a permanent delete is always a deliberate second act.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists archived_at   timestamptz;
alter table leads add column if not exists archived_by   uuid;
alter table leads add column if not exists archive_reason text;

-- Every list query filters on this, so it needs an index.
create index if not exists idx_leads_archived_at on leads (archived_at);

comment on column leads.archived_at is
  'Set when a user "deletes" a lead. Hidden everywhere but recoverable. Eligible for permanent deletion by an owner after 90 days.';

-- What is past the retention window and could be purged. Read-only helper: it
-- deletes nothing on its own, because automatic destruction of client files is
-- exactly the thing this migration exists to prevent.
create or replace view leads_purgeable as
select id, lead_no, claimant_name, firm_id, archived_at,
       (now() - archived_at) as archived_for
from leads
where archived_at is not null
  and archived_at < now() - interval '90 days';
