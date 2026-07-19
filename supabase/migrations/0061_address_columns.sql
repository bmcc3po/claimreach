-- ============================================================================
-- 0061 THE ADDRESS COLUMNS THAT NEVER EXISTED
--
-- Ten files write and read leads.mail_addr1 / mail_addr2. Neither column was
-- ever created; the table has a single mail_addr. Postgres rejects an UPDATE
-- naming a column that does not exist, and it rejects the WHOLE statement, so:
--
--   * the console's identity capture failed entirely — name, DOB, phone, email
--     and address never persisted, which meant a live retainer went out with a
--     blank name and no address
--   * the Contact Info tab could not save anything, including the phone number,
--     because one bad field name killed the whole update
--   * retainer autofill read mail_addr1 and always got nothing
--   * the file header showed "Not collected" forever
--
-- Adding the columns rather than rewriting ten files: addr1/addr2 is also the
-- correct shape, since apartment and unit numbers need their own line for the
-- retainer and for mail that actually arrives.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists mail_addr1 text;
alter table leads add column if not exists mail_addr2 text;

-- Carry over anything captured under the old single-line column.
update leads
set mail_addr1 = mail_addr
where mail_addr1 is null
  and mail_addr is not null
  and mail_addr <> '';

comment on column leads.mail_addr1 is 'Street address line 1. Canonical: the app writes here, not mail_addr.';
comment on column leads.mail_addr2 is 'Apartment, suite or unit number.';
