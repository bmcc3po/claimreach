-- ============================================================================
-- ClaimReach — 0027: PDF document templates with drag-and-drop field layouts.
-- Upload a firm PDF, place signature/date/text/checkbox fields, assign each to
-- the client or the agent, then send through SignWell with exact coordinates.
-- ============================================================================
create table if not exists pdf_templates (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id) on delete cascade,
  name        text not null,
  doc_type    text default 'retainer',        -- retainer | consent | other
  file_path   text,                            -- Supabase storage path of the PDF
  file_name   text,
  page_count  int default 1,
  -- field layout: array of { id, type, page, xPct, yPct, wPct, hPct, role, label, required }
  -- coordinates stored as PERCENTAGES of page so they survive any render scale.
  fields      jsonb not null default '[]',
  page_dims   jsonb not null default '{}',     -- { "1": {"w":612,"h":792}, ... } in PDF points
  certified   boolean not null default true,   -- true = SignWell
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pdf_templates_firm on pdf_templates(firm_id);
alter table pdf_templates enable row level security;
drop policy if exists pdf_tpl_internal on pdf_templates;
create policy pdf_tpl_internal on pdf_templates for all using ( is_internal() ) with check ( is_internal() );

create or replace function touch_pdf_template() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_pdf_template on pdf_templates;
create trigger trg_touch_pdf_template before update on pdf_templates
  for each row execute function touch_pdf_template();

-- a storage bucket for the PDFs (private)
insert into storage.buckets (id, name, public)
values ('retainer-pdfs', 'retainer-pdfs', false)
on conflict (id) do nothing;
