-- 0095: signed-docs lockdown, part 1 of 2 (safe to run any time, before deploy).
-- Adds the storage path columns the new code writes. Additive only.
alter table signable_documents add column if not exists completed_pdf_path text;
alter table signable_documents add column if not exists cert_pdf_path text;
