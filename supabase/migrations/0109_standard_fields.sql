-- ============================================================================
-- 0109 — Standard fields (Brett, Sep 28 2026): one column per field, the
-- same on every screen, export and webhook. Adds the standard contact and
-- incident fields the record did not have yet. Additive only; idempotent.
--   home_phone, work_phone : the PNC's other numbers (cell stays leads.phone)
--   dl_number              : driver's license number from the File step
--   incident_city/_state   : where the incident happened (the MVA agreement
--                            follows incident_state). incident_start already
--                            holds the incident date.
-- ============================================================================
alter table public.leads add column if not exists home_phone text;
alter table public.leads add column if not exists work_phone text;
alter table public.leads add column if not exists dl_number text;
alter table public.leads add column if not exists incident_city text;
alter table public.leads add column if not exists incident_state text;

comment on column public.leads.phone is 'Standard field cell_phone: the PNC''s cell. The one cell on every screen, export and webhook.';
comment on column public.leads.home_phone is 'Standard field home_phone.';
comment on column public.leads.work_phone is 'Standard field work_phone.';
comment on column public.leads.dl_number is 'Standard field dl_number.';
comment on column public.leads.incident_city is 'Standard field incident_city.';
comment on column public.leads.incident_state is 'Standard field incident_state (two-letter code).';

-- Void an agreement (Brett, Sep 28 2026): an unsigned agreement sent by
-- mistake, or a signed one the PNC signed wrong and that has to be sent
-- again. The row is never deleted (a signed document is evidence); it is
-- marked voided with who, when and why, and the DocuSeal link is archived.
alter table public.esign_submissions add column if not exists voided_at timestamptz;
alter table public.esign_submissions add column if not exists voided_by uuid;
alter table public.esign_submissions add column if not exists void_reason text;
