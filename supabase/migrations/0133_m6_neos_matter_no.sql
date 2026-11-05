-- 0133: Neos matter number on Motel 6 files, for the M6 audit board's
-- "Open in Neos" button. Neos stays the system of record for case work.
-- Renumbered from 0131 on Nov 4 2026 (0130/0131 are taken by open PRs #199/#204).
-- Additive only: one nullable text column, no backfill, no policy change.
-- Firm users write it through /api/m6/neos (m6 write fence, then admin update
-- of this one column), the same pattern as the LOR facts. The firm UPDATE
-- guard on leads is unchanged.
alter table public.leads add column if not exists neos_matter_no text;

comment on column public.leads.neos_matter_no is
  'Neos file number for this matter (TMP). Set from the M6 audit board. Used to build the Open in Neos link from M6_NEOS_MATTER_URL.';
