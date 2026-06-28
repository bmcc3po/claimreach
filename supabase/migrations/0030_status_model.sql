-- ============================================================================
-- 0030 STATUS MODEL
-- Statuses become editable records (not a hardcoded enum) so the owner can add
-- and edit them in-app. Each status carries behavioral flags that drive the QA
-- pipeline, billing, and the firm visibility wall. Idempotent.
--   - statuses:         the controlled, owner-editable status set + flags
--   - lawruler_aliases: maps old LawRuler status strings to new keys for import
--   - dq_reasons:       controlled DQ-reason vocabulary (owner edits, agents pick)
-- Also converts claims.status from enum to text and backfills old values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- statuses
-- phase:    pre_qa | in_qa | post_qa | terminal
-- qualify:  qualify | disqualify | undetermined
-- side:     agent | qa | owner | firm | system
-- tone:     good | bad | warn | info | neut   (maps to StatusBadge colors)
-- ---------------------------------------------------------------------------
create table if not exists statuses (
  key            text primary key,
  label          text not null,
  track          text not null default 'none',     -- esign | nosig | intake | firm | terminal | none
  phase          text not null default 'pre_qa',
  tone           text not null default 'neut',
  side           text not null default 'agent',
  qualify        text not null default 'undetermined',
  requires_esign boolean not null default false,
  billable       boolean not null default false,
  unlocks_firm   boolean not null default false,
  is_final       boolean not null default false,
  lawruler_group text,
  sort           int not null default 100,
  active         boolean not null default true,
  system_locked  boolean not null default false,    -- core pipeline statuses can't be deleted
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Seed (upsert so re-running keeps the owner's later edits to non-key fields
-- only on first insert; on conflict we leave existing rows alone).
insert into statuses
  (key, label, track, phase, tone, side, qualify, requires_esign, billable, unlocks_firm, is_final, lawruler_group, sort, system_locked)
values
  -- INTAKE
  ('new',             'New',                 'intake',   'pre_qa',   'neut', 'agent',  'undetermined', false, false, false, false, 'New/Open',       10,  true),
  ('contacting',      'Contacting',          'intake',   'pre_qa',   'info', 'agent',  'undetermined', false, false, false, false, 'New/Open',       20,  true),
  -- E-SIGN TRACK
  ('esign_sent',      'e-Sign Sent',         'esign',    'pre_qa',   'warn', 'agent',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 30,  true),
  ('signed_grievous', 'Signed: Grievous',    'esign',    'in_qa',    'warn', 'system', 'undetermined', true,  false, false, false, 'Wanted/Chasing', 40,  true),
  ('signed_qa',       'Signed: QA',          'esign',    'in_qa',    'warn', 'qa',     'undetermined', true,  false, false, false, 'Wanted/Chasing', 50,  true),
  ('signed_wip',      'Signed: WIP',         'esign',    'in_qa',    'warn', 'agent',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 60,  true),
  ('signed_flag',     'Signed: Flag BMC',    'esign',    'in_qa',    'bad',  'owner',  'undetermined', true,  false, false, false, 'Wanted/Chasing', 70,  true),
  ('signed_approved', 'Signed: Approved',    'esign',    'post_qa',  'good', 'firm',   'qualify',      true,  true,  true,  false, 'Clients',        80,  true),
  ('signed_dropped',  'Signed: Drop Letter', 'esign',    'terminal', 'bad',  'firm',   'disqualify',   true,  true,  false, true,  'Rejected',       90,  true),
  -- NO-SIG TRACK
  ('grievous',        'Grievous',            'nosig',    'in_qa',    'warn', 'system', 'undetermined', false, false, false, false, 'Wanted/Chasing', 100, true),
  ('qa',              'QA',                  'nosig',    'in_qa',    'warn', 'qa',     'undetermined', false, false, false, false, 'Wanted/Chasing', 110, true),
  ('wip',             'WIP',                 'nosig',    'in_qa',    'warn', 'agent',  'undetermined', false, false, false, false, 'Wanted/Chasing', 120, true),
  ('flag',            'Flag BMC',            'nosig',    'in_qa',    'bad',  'owner',  'undetermined', false, false, false, false, 'Wanted/Chasing', 130, true),
  ('approved',        'Approved',            'nosig',    'post_qa',  'good', 'firm',   'qualify',      false, true,  true,  false, 'Clients',        140, true),
  ('dq_billable',     'DQ Billable',         'nosig',    'terminal', 'bad',  'firm',   'disqualify',   false, true,  false, true,  'Rejected',       150, true),
  -- FIRM-SIDE
  ('delivered',       'Delivered to Firm',   'firm',     'post_qa',  'info', 'firm',   'qualify',      false, false, true,  false, 'Referred',       160, true),
  ('retained',        'Retained',            'firm',     'post_qa',  'good', 'firm',   'qualify',      false, false, true,  false, 'Clients',        170, true),
  -- TERMINAL (non-billable)
  ('dq',              'DQ',                  'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'Rejected',       180, true),
  ('not_interested',  'Not Interested',      'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'New/Open',       190, true),
  ('dnc',             'Do Not Call',         'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'New/Open',       200, true),
  ('duplicate',       'Duplicate',           'terminal', 'terminal', 'neut', 'agent',  'disqualify',   false, false, false, true,  'New/Open',       210, true),
  ('dead',            'Dead',                'terminal', 'terminal', 'bad',  'agent',  'disqualify',   false, false, false, true,  'Closed',         220, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Convert claims.status enum -> text so any status key is valid.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'claims' and column_name = 'status' and udt_name = 'claim_status'
  ) then
    alter table claims alter column status drop default;
    alter table claims alter column status type text using status::text;
    alter table claims alter column status set default 'new';
  end if;
end $$;

-- Backfill old enum values to the new keys.
update claims set status = 'contacting'  where status = 'contact_attempted';
update claims set status = 'approved'    where status = 'qualified';
update claims set status = 'delivered'   where status = 'sent_to_firm';
update claims set status = 'signed_approved' where status = 'signed';
-- 'new','in_progress','dq','dead','duplicate' already valid keys
update claims set status = 'contacting'  where status = 'in_progress';

-- The queryable DQ-reason tag (keep the existing free-text dq_reason too).
alter table claims add column if not exists dq_reason_key text;

-- ---------------------------------------------------------------------------
-- lawruler_aliases: old LawRuler status string -> new status key (for import).
-- ---------------------------------------------------------------------------
create table if not exists lawruler_aliases (
  alias       text primary key,            -- exact LawRuler status text
  status_key  text not null references statuses(key),
  created_at  timestamptz not null default now()
);

insert into lawruler_aliases (alias, status_key) values
  ('Signed & Awaiting Secondary',                'signed_qa'),
  ('INBOUND',                                    'new'),
  ('ROTH VOICEMAIL TRANSFER',                    'new'),
  ('ROTH LIVE TRANSFER',                         'new'),
  ('Signed Sent Awaiting Firm Approval',         'delivered'),
  ('spanish_lead',                               'contacting'),
  ('Intake Questionnaire Completed (Default)',   'contacting'),
  ('Secondary Intake OK COMPLETE',               'approved'),
  ('Secondary Intake DQ COMPLETE',               'dq_billable'),
  ('TRANSFER TO FIRM SUCCESSFUL',                'retained'),
  ('TRANSFER TO FIRM -NO ANSWER',                'dead'),
  ('On Call with PNC',                           'contacting'),
  ('Contact Attempted (Default)',                'contacting'),
  ('Scheduled Appointment (Default)',            'contacting'),
  ('Not Interested',                             'not_interested'),
  ('Disqualified (Default)',                     'dq'),
  ('Already Represented',                        'dq'),
  ('Wrong Number',                               'dq'),
  ('Duplicate Lead',                             'duplicate'),
  ('DO NOT CALL REQUEST',                        'dnc'),
  ('Sent e-Sign (Default)',                      'esign_sent'),
  ('Signed e-Sign (Default)',                    'signed_grievous'),
  ('Cancelled E-Sign (Default)',                 'contacting'),
  ('Signed E-Sign QA Verification',              'signed_qa'),
  ('Signed E-Sign WIP',                          'signed_wip'),
  ('Flag for BMC',                               'signed_flag'),
  ('SIGNED READY TO SEND',                       'signed_approved'),
  ('Signed ESign Sent To Firm',                  'delivered'),
  ('STF',                                        'dead'),
  ('Intake Questionnaire Emailed (Default)',     'contacting'),
  ('Secondary DQ Sent to Firm',                  'dq_billable'),
  ('Secondary OK Sent To Firm',                  'delivered'),
  ('Signed E-Sign Already Sent',                 'signed_grievous'),
  ('SIGNED & DECLINED',                          'signed_dropped'),
  ('DROP LETTER',                                'signed_dropped'),
  ('New Lead (Default)',                         'new'),
  ('IB CALL',                                    'new'),
  ('New Listing',                                'new'),
  ('Referral Accepted (Default)',                'delivered'),
  ('Referral Declined (Default)',                'dq'),
  ('Test Lead',                                  'new'),
  ('Pending Review',                             'qa')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- dq_reasons: controlled vocabulary, owner-editable, agents pick only.
-- active=false retires a reason without losing history (key stays queryable).
-- ---------------------------------------------------------------------------
create table if not exists dq_reasons (
  key        text primary key,
  label      text not null,
  category   text not null default 'Other',
  sort       int not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into dq_reasons (key, label, category, sort) values
  ('sol',           'SOL',           'Eligibility',    10),
  ('diagnosis',     'Diagnosis',     'Medical',        20),
  ('already_rep',   'Already Rep',   'Representation',  30),
  ('criteria',      'Criteria',      'Eligibility',    40),
  ('prior_signup',  'Prior Signup',  'Representation',  50),
  ('location',      'Location',      'Eligibility',    60),
  ('duplicate',     'Duplicate',     'Contact',        70),
  ('no_contact',    'No Contact',    'Contact',        80),
  ('other',         'Other',         'Other',          90)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: everyone authenticated can read these config tables; only owner/admin
-- write. (Mutations also go through the API with supabaseAdmin, but lock anyway.)
-- ---------------------------------------------------------------------------
alter table statuses        enable row level security;
alter table lawruler_aliases enable row level security;
alter table dq_reasons      enable row level security;

do $$ begin
  create policy statuses_read on statuses for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy aliases_read on lawruler_aliases for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dq_reasons_read on dq_reasons for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
