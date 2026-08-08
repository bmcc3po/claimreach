-- ============================================================================
-- 0075 LEXAMICA OUTBOUND
--
-- Additive only. One table, one column. If the TMT relationship goes sideways
-- this costs an afternoon to remove and nothing else is coupled to it.
--
-- The audit table is not optional bookkeeping. It is the only thing that can
-- answer "we sent you 40, why did 37 land", and that question always gets asked
-- eventually. It stores the EXACT payload and the EXACT response, so a
-- disagreement is settled by looking rather than by arguing.
-- ============================================================================

create table if not exists lexamica_submissions (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,
  payload       jsonb not null,
  http_status   int,
  response_body text,
  lexamica_id   text,
  sent_by       uuid,
  created_at    timestamptz not null default now()
);

create index if not exists idx_lexamica_sub_lead on lexamica_submissions(lead_id);
create index if not exists idx_lexamica_sub_created on lexamica_submissions(created_at desc);

comment on table lexamica_submissions is
  'Every outbound send to the Lexamica referral network, with the exact payload and response. Reconciliation depends on this.';

-- Populated only on a successful send. Its presence is the idempotency guard:
-- agents double click, and a duplicate posts the same claimant into another
-- firm''s network twice where it looks like two separate cases.
alter table leads add column if not exists lexamica_id text;

comment on column leads.lexamica_id is
  'The id Lexamica returned. Present means this lead has already been referred; a resend requires an explicit force.';

-- Verify.
select 'lexamica_submissions' as table_name, count(*) as rows from lexamica_submissions;
