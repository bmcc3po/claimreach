-- ============================================================================
-- 0038 E-SIGN CEREMONY (Stage 1)
-- Extend signable_documents for a DocuSign-grade in-house signing ceremony:
-- envelope id, document hash, sender + signer IPs, viewed/consent timestamps,
-- signature type (drawn|typed), and the consent record.
-- ============================================================================

alter table signable_documents add column if not exists envelope_id text;     -- short human envelope id, e.g. CR-7F3K9Q
alter table signable_documents add column if not exists doc_hash text;         -- sha-256 of the source document bytes/body
alter table signable_documents add column if not exists sender_ip text;        -- IP of the agent who sent it
alter table signable_documents add column if not exists viewed_ip text;        -- IP first time the signer opened it
alter table signable_documents add column if not exists signature_type text;   -- drawn | typed
alter table signable_documents add column if not exists consent_at timestamptz;-- when signer accepted E-SIGN consent
alter table signable_documents add column if not exists pdf_template_id uuid references pdf_templates(id) on delete set null; -- when signing an uploaded PDF
alter table signable_documents add column if not exists cert_pdf_url text;     -- Certificate of Completion (Stage 2)

-- Backfill envelope ids for any existing rows that lack one.
update signable_documents
  set envelope_id = 'CR-' || upper(substr(md5(id::text), 1, 6))
  where envelope_id is null;

create unique index if not exists idx_signable_envelope on signable_documents(envelope_id);

-- Storage bucket for completion certificates and signed PDFs (Stage 2).
insert into storage.buckets (id, name, public)
  values ('signed-docs', 'signed-docs', true)
  on conflict (id) do nothing;
