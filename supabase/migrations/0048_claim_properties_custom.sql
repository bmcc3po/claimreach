-- ============================================================================
-- 0048 CLAIM_PROPERTIES CUSTOM OVERFLOW
-- The built-in Motel form maps each per-property question to a fixed column.
-- Imported/beta forms (e.g. Beta Motel) can have arbitrary property questions
-- with their own field IDs that do not match those columns. Rather than fail the
-- insert or lose the answer, unknown property field IDs are stored in this jsonb
-- bag, keyed by field id. Fixed columns still win for the built-in form.
-- Idempotent.
-- ============================================================================
alter table claim_properties add column if not exists custom jsonb not null default '{}'::jsonb;
