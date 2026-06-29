-- ============================================================================
-- 0039 PDF RETAINER: campaign binding + autofill
-- PDF templates can bind to a campaign (and already to case_type from 0034) so
-- they show on the right files. Per-field autofill mapping (which merge token a
-- text field pulls) lives inside the existing fields jsonb as field.mapTo, so no
-- column is needed for that.
-- ============================================================================

alter table pdf_templates add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create index if not exists idx_pdf_tpl_campaign on pdf_templates(campaign_id);

-- Retainer text templates can also bind to a campaign (case_type already exists).
alter table retainer_templates add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create index if not exists idx_retainer_tpl_campaign on retainer_templates(campaign_id);
