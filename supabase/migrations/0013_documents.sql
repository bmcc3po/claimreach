-- ============================================================================
-- ClaimReach — 0013: Case documents (LOR, retainer, records)
-- Files live in Supabase Storage bucket 'case-docs'; this table is the index.
-- ============================================================================
create table if not exists case_documents (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  lead_id     uuid references leads(id) on delete cascade,
  claim_id    uuid references claims(id) on delete set null,
  doc_type    text default 'other',      -- lor / retainer / records / other
  file_name   text not null,
  storage_path text not null,
  uploaded_by uuid references app_users(id),
  uploaded_by_name text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_case_docs_lead on case_documents(lead_id, created_at desc);

alter table case_documents enable row level security;
drop policy if exists case_docs_internal on case_documents;
create policy case_docs_internal on case_documents for all using ( is_internal() ) with check ( is_internal() );
drop policy if exists case_docs_firm on case_documents;
create policy case_docs_firm on case_documents for all using ( firm_id = my_firm_id() ) with check ( firm_id = my_firm_id() );

-- Create the storage bucket (id + name 'case-docs'), private.
insert into storage.buckets (id, name, public)
values ('case-docs', 'case-docs', false)
on conflict (id) do nothing;
