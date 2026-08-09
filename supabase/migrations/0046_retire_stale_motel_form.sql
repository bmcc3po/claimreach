-- ============================================================================
-- 0046 RETIRE STALE MOTEL 6 STORED FORM
-- The intake renderer prefers a PUBLISHED row in intake_forms over the built-in
-- questionnaire in code. An old flattened Motel 6 form (fewer sections, the
-- duplicate emergency-contact block, property buried) was published there and
-- has been shadowing every code-side change to the questionnaire.
--
-- This unpublishes any stored trafficking/motel form so resolveIntakeFields()
-- falls through to the restructured built-in INTAKE (21 sections, merged EC,
-- property moved up, 3-10 per screen). We DEMOTE to 'draft' rather than delete,
-- so nothing is lost: the builder history is preserved and can be re-published
-- later once it is rebuilt to match. Idempotent.
-- ============================================================================
update intake_forms
   set status = 'draft', updated_at = now()
 where status = 'published'
   and (
        lower(claim_type) like '%motel%'
     or lower(claim_type) like '%traffick%'
     or lower(claim_type) like '%hotel%'
   );
