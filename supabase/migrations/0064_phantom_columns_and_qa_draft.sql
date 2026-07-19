-- ============================================================================
-- 0064 THE LAST OF THE PHANTOM COLUMNS, AND QA THAT SURVIVES A CLICK
--
-- Part one: a full audit of every contact field id against the real schema
-- turned up four more columns the UI writes to that were never created. Same
-- failure as mail_addr1: Postgres rejects the whole UPDATE, so one phantom
-- field silently threw away every other change on the form.
--
--   caller_dob         the caller's date of birth, when they are not the injured party
--   caller_phone_alt   a second number for the caller
--   mm_married         medical malpractice: married at the time
--   mm_spouse_name     medical malpractice: spouse name, for consortium
--
-- Part two: QA grades only existed in React state until a decision button was
-- pressed, so clicking to another tab threw the whole review away. qa_draft
-- holds the in-progress grades so a reviewer can leave the file and come back.
-- Idempotent.
-- ============================================================================

alter table leads add column if not exists caller_dob        date;
alter table leads add column if not exists caller_phone_alt  text;
alter table leads add column if not exists mm_married        text;
alter table leads add column if not exists mm_spouse_name    text;

-- In-progress QA review. Not a substitute for qa_reviews, which stays the
-- permanent record written when a decision is actually made.
alter table leads add column if not exists qa_draft jsonb;

comment on column leads.qa_draft is
  'In-progress QA grades, autosaved. The submitted review lives in qa_reviews.';
