-- ============================================================================
-- ClaimReach — 0016: Intake form builder. Questionnaires stored as data so
-- admins can create/edit campaigns without code. The renderer reads these first,
-- falling back to the built-in TS questionnaires (trafficking, medmal).
-- ============================================================================
create table if not exists intake_forms (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references firms(id),
  claim_type  text not null,                 -- the key intakeForType matches on (e.g. 'pfas', 'bard')
  name        text not null,                 -- human label, e.g. "PFAS Intake v2"
  description text,
  status      text not null default 'draft', -- draft / published
  version     int not null default 1,
  fields      jsonb not null default '[]',   -- array of Field objects (same shape as TS)
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (firm_id, claim_type, version)
);
create index if not exists idx_intake_forms_type on intake_forms(claim_type, status);

create or replace function touch_intake_form() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_intake_form on intake_forms;
create trigger trg_touch_intake_form before update on intake_forms
  for each row execute function touch_intake_form();

alter table intake_forms enable row level security;
-- Internal staff manage forms; everyone authenticated can READ published forms (to render intake).
drop policy if exists forms_internal_all on intake_forms;
create policy forms_internal_all on intake_forms for all
  using ( is_internal() ) with check ( is_internal() );
drop policy if exists forms_read_published on intake_forms;
create policy forms_read_published on intake_forms for select
  using ( status = 'published' );
