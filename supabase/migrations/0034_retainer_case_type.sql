-- ============================================================================
-- 0034 RETAINER CASE-TYPE BINDING
-- Retainer templates (text and PDF) can be tied to a case type, with one marked
-- default per case type. On a file, the matching default pre-selects; one-offs
-- are still pickable. case_type NULL / 'any' = available on every case type.
-- ============================================================================

alter table retainer_templates add column if not exists case_type text;       -- e.g. bard_powerport, motel_trafficking, NULL/'any'
alter table retainer_templates add column if not exists is_default boolean not null default false;

alter table pdf_templates add column if not exists case_type text;
alter table pdf_templates add column if not exists is_default boolean not null default false;

-- At most one default per case type is enforced in the API (clearing siblings on
-- set), not by a DB constraint, so 'any' defaults can coexist with type defaults.
create index if not exists idx_retainer_tpl_case on retainer_templates(case_type);
create index if not exists idx_pdf_tpl_case on pdf_templates(case_type);
