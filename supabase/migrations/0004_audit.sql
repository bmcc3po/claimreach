-- ============================================================================
-- ClaimReach — 0004: Audit trail (Activity Log)
-- Records every meaningful action on a lead/claim file, by any user.
-- Matches the LawRuler-style log: when, who, what.
-- ============================================================================

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  actor       uuid references app_users(id),
  actor_name  text,                       -- denormalized for fast display
  category    text not null default 'change',  -- change / note / status / comms / system / access
  description text not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_lead on audit_log(lead_id, created_at desc);
create index if not exists idx_audit_claim on audit_log(claim_id, created_at desc);
create index if not exists idx_audit_firm on audit_log(firm_id, created_at desc);

alter table audit_log enable row level security;

-- Internal staff: full read on their firm scope (they operate all firms).
drop policy if exists audit_internal_all on audit_log;
create policy audit_internal_all on audit_log for all
  using ( is_internal() ) with check ( is_internal() );

-- Firm users: read their own firm's audit entries (transparency for the firm).
drop policy if exists audit_firm_read on audit_log;
create policy audit_firm_read on audit_log for select
  using ( firm_id = my_firm_id() );

-- Firm users may also WRITE audit entries (so their edits are logged too).
drop policy if exists audit_firm_insert on audit_log;
create policy audit_firm_insert on audit_log for insert
  with check ( firm_id = my_firm_id() );
