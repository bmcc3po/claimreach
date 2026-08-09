-- ============================================================================
-- 0042 FIRM DELIVERY
-- Automated handoff to the firm when a file reaches an unlocks_firm status.
-- Config lives on the campaign (the spine): where to send, the mail-merged
-- email template, and which of the four artifacts to attach. A per-lead guard
-- (firm_sent_at) prevents double-sends; a deliveries log records every attempt.
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campaign-level firm delivery config.
--   firm_email        primary recipient (the firm intake inbox)
--   firm_cc           comma-separated additional recipients (default empty)
--   firm_reply_to     optional reply-to (defaults to EMAIL_FROM if blank)
--   firm_subject_tpl  mail-merge subject template ({{contact.full_name}} etc.)
--   firm_body_tpl     mail-merge HTML/text body template
--   attach_intake_pdf  toggle: intake Q&A as a PDF
--   attach_intake_csv  toggle: intake Q&A as a CSV
--   attach_retainer    toggle: the signed retainer packet PDF(s)
--   attach_certificate toggle: the certificate of signature
--   firm_delivery_on   master switch for auto-send on unlocks_firm transitions
-- ---------------------------------------------------------------------------
alter table campaigns add column if not exists firm_email          text;
alter table campaigns add column if not exists firm_cc             text;
alter table campaigns add column if not exists firm_reply_to       text;
alter table campaigns add column if not exists firm_subject_tpl    text;
alter table campaigns add column if not exists firm_body_tpl       text;
alter table campaigns add column if not exists attach_intake_pdf   boolean not null default true;
alter table campaigns add column if not exists attach_intake_csv   boolean not null default false;
alter table campaigns add column if not exists attach_retainer     boolean not null default true;
alter table campaigns add column if not exists attach_certificate  boolean not null default true;
alter table campaigns add column if not exists firm_delivery_on    boolean not null default false;

-- ---------------------------------------------------------------------------
-- Per-lead send guard. firm_sent_at is set on first successful send so the
-- auto-trigger never double-fires; the manual button can force a resend.
-- ---------------------------------------------------------------------------
alter table leads add column if not exists firm_sent_at     timestamptz;
alter table leads add column if not exists firm_send_result text;

-- ---------------------------------------------------------------------------
-- Delivery log: one row per send attempt (success or failure), for the audit
-- trail and the "resend / view history" UI.
-- ---------------------------------------------------------------------------
create table if not exists firm_deliveries (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,
  campaign_id   uuid references campaigns(id),
  firm_id       uuid references firms(id),
  to_email      text,
  cc_email      text,
  subject       text,
  attachments   jsonb not null default '[]'::jsonb,   -- [{name, kind, bytes}]
  ok            boolean not null default false,
  error         text,
  triggered_by  text,                                  -- 'auto' | 'manual' | 'automation'
  actor_name    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_firm_deliveries_lead on firm_deliveries(lead_id);
create index if not exists idx_firm_deliveries_created on firm_deliveries(created_at desc);

alter table firm_deliveries enable row level security;
do $$ begin
  create policy firm_deliveries_read on firm_deliveries for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
