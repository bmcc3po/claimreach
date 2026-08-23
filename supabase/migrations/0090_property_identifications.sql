-- ============================================================================
-- ClaimReach 0090: LawRuler property identification tool
--
-- Standalone /tools/property for intake agents who work in LawRuler, not
-- ClaimReach. They identify buildings (Google place_id) and tie them to a
-- LawRuler leadid. No claimant PII on that page.
--
-- properties_canonical is the building (one row per TMP firm + place_id).
-- Add street + zip so LawRuler custom fields can be copied without parsing
-- the formatted address. Keep `address` as the full line. Keep
-- `current_brand` (do not add a second brand_current column).
--
-- property_identifications is the link: one LawRuler leadid → many buildings,
-- with remembered brand, stay month/year range, and a generated mismatch
-- flag (same expression as claim_properties). Not claim_properties — that
-- table is the hotel-knowledge battery and requires a ClaimReach claim_id
-- the agent may not have yet. Not leads.property_* — those five columns
-- are the webhook's singular LawRuler fields.
--
-- Writes go through the token-gated API with the admin client (TMP only).
-- RLS: internal full, TMP firm read, no anon, no firm write.
--
-- Idempotent. Brett applies; do not run from the agent.
-- ============================================================================

alter table properties_canonical add column if not exists street text;
alter table properties_canonical add column if not exists zip    text;

create table if not exists property_identifications (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id),
  lawruler_leadid   text not null,
  canonical_id      uuid not null references properties_canonical(id),
  remembered_brand  text,
  current_brand     text,
  brand_mismatch    boolean generated always as
                      (remembered_brand is distinct from current_brand
                       and remembered_brand is not null
                       and current_brand is not null) stored,
  stay_from         text,
  stay_to           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (firm_id, lawruler_leadid, canonical_id)
);

create index if not exists idx_pi_leadid
  on property_identifications (firm_id, lawruler_leadid);

drop trigger if exists trg_pi_touch on property_identifications;
create trigger trg_pi_touch before update on property_identifications
  for each row execute function touch_updated_at();

alter table property_identifications enable row level security;

drop policy if exists pi_internal_all on property_identifications;
create policy pi_internal_all on property_identifications for all
  using ( is_internal() ) with check ( is_internal() );

drop policy if exists pi_firm_read on property_identifications;
create policy pi_firm_read on property_identifications for select
  using ( firm_id = my_firm_id() );

comment on table property_identifications is
  '0090: LawRuler leadid → canonical property. Token-tool writes; m6 case file reads.';
comment on column properties_canonical.street is
  'Street line for LawRuler property_street paste. Separate from formatted address.';
comment on column properties_canonical.zip is
  'ZIP for LawRuler property_zip paste.';
