-- 0096: signed-docs lockdown, part 2 of 2. Run AFTER the code with
-- /api/signed-doc is live. Signed retainers carry SSN and DOB.
--
-- 1) Backfill storage paths from the old public URLs.
-- 2) Point stored links at the gated app route.
-- 3) Make the bucket private so the old public URLs stop working.
-- SignWell rows (external URLs) are untouched.

update signable_documents
   set completed_pdf_path = substring(completed_pdf_url from '/object/public/signed-docs/(.+)$')
 where completed_pdf_path is null
   and completed_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set cert_pdf_path = substring(cert_pdf_url from '/object/public/signed-docs/(.+)$')
 where cert_pdf_path is null
   and cert_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set completed_pdf_url = '/api/signed-doc/' || id || '/signed'
 where completed_pdf_path is not null
   and completed_pdf_url like '%/object/public/signed-docs/%';

update signable_documents
   set cert_pdf_url = '/api/signed-doc/' || id || '/cert'
 where cert_pdf_path is not null
   and cert_pdf_url like '%/object/public/signed-docs/%';

update storage.buckets set public = false where id = 'signed-docs';
