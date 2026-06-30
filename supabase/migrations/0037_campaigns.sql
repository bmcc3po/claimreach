-- ============================================================================
-- 0037 CAMPAIGNS
-- A campaign is a firm-specific deployment of a case type. "TMP MVA" = Turnbull
-- running MVA. The same type (MVA) can power many campaigns across firms. A
-- campaign carries the firm, case type, intake template, default retainer, and
-- tier/billing rules so Add lead only needs first/last name + campaign.
-- ============================================================================

create table if not exists campaigns (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                       -- "TMP MVA"
  firm_id            uuid references firms(id),            -- which firm/attorney
  case_type          text not null,                        -- "mva" (the reusable type)
  intake_template    text,                                 -- claim_type key for intake form resolution
  retainer_template_id uuid references retainer_templates(id),
  tier               text,                                 -- A/B/C... default tier for this campaign
  bill_rate          numeric(10,2),                        -- per-sign billing rate
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_campaigns_firm on campaigns(firm_id);
create index if not exists idx_campaigns_active on campaigns(active);

-- Tie a lead to its campaign (campaign carries firm + type downstream).
alter table leads add column if not exists campaign_id uuid references campaigns(id);
-- Display name of the campaign at time of intake (denormalized for the list view).
alter table leads add column if not exists campaign text;

alter table campaigns enable row level security;
do $$ begin
  create policy campaigns_read on campaigns for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
