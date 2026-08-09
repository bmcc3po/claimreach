-- ============================================================================
-- ClaimReach — 0007: Full contact info on the lead (person spine)
-- Emergency contacts x2, contact permissions, PII (DOB, SSN encrypted).
-- ============================================================================

alter table leads add column if not exists dob date;
alter table leads add column if not exists ssn_enc text;          -- store encrypted/tokenized, never plaintext
alter table leads add column if not exists ssn_last4 text;        -- for display

-- Contact permissions
alter table leads add column if not exists perm_call boolean default true;
alter table leads add column if not exists perm_text boolean default true;
alter table leads add column if not exists perm_email boolean default true;

-- Emergency contact 1
alter table leads add column if not exists ec1_name text;
alter table leads add column if not exists ec1_phone text;
alter table leads add column if not exists ec1_email text;
alter table leads add column if not exists ec1_relation text;
alter table leads add column if not exists ec1_perm_speak boolean default false;     -- ok to speak with them
alter table leads add column if not exists ec1_divulge boolean default false;        -- ok to divulge case detail

-- Emergency contact 2
alter table leads add column if not exists ec2_name text;
alter table leads add column if not exists ec2_phone text;
alter table leads add column if not exists ec2_email text;
alter table leads add column if not exists ec2_relation text;
alter table leads add column if not exists ec2_perm_speak boolean default false;
alter table leads add column if not exists ec2_divulge boolean default false;

-- Track who revealed SSN, for audit (the reveal-logs-to-audit feature).
-- (Audit entries are written to audit_log; this column just flags presence.)
