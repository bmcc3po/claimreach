-- ============================================================================
-- ClaimReach — 0010: Caller information fields on the lead (shared source)
-- These back the Contact Info tab and any inline-in-intake shared copy.
-- ============================================================================
alter table leads add column if not exists ip_first text;
alter table leads add column if not exists ip_last text;
alter table leads add column if not exists caller_first text;
alter table leads add column if not exists caller_last text;
alter table leads add column if not exists caller_type text;
alter table leads add column if not exists caller_phone text;
alter table leads add column if not exists caller_email text;
alter table leads add column if not exists mail_addr1 text;
alter table leads add column if not exists mail_addr2 text;
alter table leads add column if not exists mail_city text;
alter table leads add column if not exists mail_state text;
alter table leads add column if not exists mail_zip text;
alter table leads add column if not exists ip_ssn text;
alter table leads add column if not exists caller_ssn text;
alter table leads add column if not exists is_legal_rep boolean;
alter table leads add column if not exists caller_relation_ip text;
alter table leads add column if not exists ip_phone text;
alter table leads add column if not exists ip_email text;
alter table leads add column if not exists ec_first text;
alter table leads add column if not exists ec_last text;
alter table leads add column if not exists ec_phone text;
alter table leads add column if not exists ec_address text;
alter table leads add column if not exists ec_relationship text;
alter table leads add column if not exists ec_permission boolean;
alter table leads add column if not exists ip_deceased boolean;
alter table leads add column if not exists ip_dod date;
-- ip_dob already added in 0007 (dob). Map ip_dob -> dob in app layer; add explicit if needed:
alter table leads add column if not exists ip_dob date;
