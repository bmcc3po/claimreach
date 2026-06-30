-- ============================================================================
-- 0040 KEYSTONE REWIRE: campaign is the spine.
-- A claim = a client's enrollment under ONE campaign. The campaign owns the
-- intake questionnaire, the retainer packet, and whether e-sign is required.
-- This migration adds the structural links so intake/retainer/track all resolve
-- from the campaign instead of being guessed off case_type.
-- ============================================================================

-- 1) Tie each claim to its campaign (the enrollment link).
alter table claims add column if not exists campaign_id uuid references campaigns(id);
create index if not exists idx_claims_campaign on claims(campaign_id);

-- 2) Campaign-level e-sign switch: picks the signed_/no-sign status track.
alter table campaigns add column if not exists esign_required boolean not null default true;

-- 3) Campaign owns the retainer PACKET (retainer + HIPAA + HITECH + any extras),
--    an ordered list of pdf_template ids and/or retainer_template ids. Kept as
--    jsonb so a packet can mix text + PDF docs. Shape:
--    [{ "kind":"pdf"|"text", "id":"<uuid>", "label":"Retainer" }, ...]
alter table campaigns add column if not exists retainer_packet jsonb not null default '[]';

-- 4) Backfill: set each claim's campaign_id from its lead's campaign_id.
update claims c
  set campaign_id = l.campaign_id
  from leads l
  where c.lead_id = l.id and c.campaign_id is null and l.campaign_id is not null;

-- 5) Dedup-override audit fields on the claim (P1-4): when an agent adds a 2nd
--    claim of the SAME case type, they must justify it; QA sees a persistent alarm
--    and must acknowledge before approve.
alter table claims add column if not exists dup_override boolean not null default false;
alter table claims add column if not exists dup_override_reason text;
alter table claims add column if not exists dup_override_by uuid;
alter table claims add column if not exists dup_override_at timestamptz;
alter table claims add column if not exists dup_ack_by uuid;      -- QA who acknowledged
alter table claims add column if not exists dup_ack_at timestamptz;

-- 6) Retainer PACKET signing: docs in one packet share a packet_group so signing
--    the session applies the signature across all docs (retainer + HIPAA + HITECH)
--    in the single 5-tap ceremony.
alter table signable_documents add column if not exists packet_group text;
alter table signable_documents add column if not exists packet_seq int;
alter table signable_documents add column if not exists completed_pdf_url text;
create index if not exists idx_signable_packet on signable_documents(packet_group);
