-- ============================================================================
-- ClaimReach — 0028: link built-in signable docs back to a retainer, and make
-- audit_log.firm_id nullable so Activity Log entries never silently fail when a
-- firm scope is missing.
-- ============================================================================
alter table signable_documents add column if not exists retainer_id uuid references retainers(id) on delete set null;
create index if not exists idx_signable_retainer on signable_documents(retainer_id);

-- audit_log.firm_id was NOT NULL; relax it so logging is resilient.
alter table audit_log alter column firm_id drop not null;
