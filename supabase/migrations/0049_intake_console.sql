-- ============================================================================
-- 0049 AGENT INTAKE CONSOLE
-- Additive only. The console lands completed calls in their OWN table. It does
-- not touch leads or claims on this pass, so live intake keeps running while we
-- watch real calls flow through. Promotion to a lead is wired second, once the
-- write has been observed on the floor.
--
-- Branch answers live in `answers` jsonb rather than one column per question:
-- the question set differs per firm and per case type, so jsonb keeps the schema
-- stable as firm configs change.
-- ============================================================================

create table if not exists intake_calls (
  id            uuid primary key default gen_random_uuid(),
  firm_id       uuid references firms(id),        -- nullable: console can run before a firm row exists
  firm_slug     text,                             -- tenant key from the console config ('tmt','tmp','roth')
  agent_id      uuid references app_users(id),
  agent_name    text,
  caller_id     text,                             -- pasted from JustCall, matches the recording
  first_name    text,                             -- first name only
  callback      text,
  call_type     text,                             -- new_potential | existing | non_client | not_legal
  matter        text,                             -- auto | gpi | employment | family | criminal | contract | other
  answers       jsonb not null default '{}'::jsonb,
  disposition   text,                             -- SIGN | REFER | DISQUALIFY | SECONDARY_REVIEW | CALLBACK | TRANSFER
  reason        text,                             -- computed routing reason
  close_key     text,                             -- which scripted close the agent was shown
  flags         text[] not null default '{}',     -- commercial vehicle / catastrophic injury / hospitalized 3+ days
  summary       text,                             -- generated case summary
  -- Post-signature capture. Held SEPARATELY from `answers` because it contains
  -- identity data (DL number, DOB, SSN) that should be access-restricted rather
  -- than sitting in the general answer blob. Tighten the read policy on this
  -- column before the floor starts collecting it at volume.
  post_sign     jsonb,
  lead_id       uuid references leads(id),        -- set when the call is promoted (phase 2)
  promoted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_intake_calls_firm    on intake_calls(firm_id, created_at desc);
create index if not exists idx_intake_calls_agent   on intake_calls(agent_id, created_at desc);
create index if not exists idx_intake_calls_disp    on intake_calls(disposition);
create index if not exists idx_intake_calls_created on intake_calls(created_at desc);

alter table intake_calls enable row level security;
do $$ begin
  create policy intake_calls_internal on intake_calls for all
    using (is_internal()) with check (is_internal());
exception when duplicate_object then null; end $$;

-- Optional per-firm console overrides. The code registry in
-- src/lib/intake-console/config.ts holds the defaults; anything set here is
-- deep-merged over them, so a firm can be retuned without a deploy.
alter table firms add column if not exists intake_config jsonb;
