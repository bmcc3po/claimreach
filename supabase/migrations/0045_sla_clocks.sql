-- ============================================================================
-- 0045 SLA CLOCKS
-- Two 72-hour promises that ClaimReach tracks in-your-face:
--   esign_chase_hours    e-sign SENT but not signed: agent must get the claimant
--                        back on the line before it dies (learned: ~72h or lost).
--   deliver_sla_hours    SIGNED but not delivered to firm: the file must clear
--                        Grievous -> QA -> WIP -> Re-QA -> Delivered within 72h.
-- Both are configurable here (no hardcoded 72), derived at read time so no stored
-- countdown rows ever go stale. Idempotent.
-- ============================================================================
alter table sla_settings add column if not exists esign_chase_hours int not null default 72;
alter table sla_settings add column if not exists deliver_sla_hours int not null default 72;

-- Record when the current e-sign was sent, so the chase clock has an anchor even
-- if we later summarize. (signable_documents.sent_at is the source of truth; this
-- is a convenience mirror on the lead for fast board queries.)
alter table leads add column if not exists esign_sent_at timestamptz;
