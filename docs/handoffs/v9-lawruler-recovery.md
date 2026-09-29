# v9 LawRuler recovery implementation

Local implementation only. No live client records were read, replayed, corrected, or sent. No provider requests, remote document fetches, database migrations, commits, or deployments were performed by this workstream.

## What is ready

- **Settings → Review LawRuler imports**, shown only to active owners/admins with settings/file access, has an explicit firm picker and read-only preview. Rows show the original source label, current ClaimReach status, exact matter, stored originals, and missing signing evidence. No unknown status is guessed. Manual mappings require a reviewed target, approval and explanation.
- `GET /api/webhooks/lawruler/status-sync?firm_id=<uuid>` is now a read-only, paged preview; optional `lead_id`, `cursor`, `limit` narrow the request. `GET /api/webhooks/lawruler/replay?firm_id=<uuid>` is now a read-only diagnostic preview of failed envelopes.
- `POST /api/webhooks/lawruler/status-sync` accepts only selected exact matters, their original source labels, expected current statuses and chosen target statuses. The server also enforces the claims.status permission override, re-reads the source and compares the current status at the database update. Ambiguous identities, changed previews, unknown/unapproved mappings, inactive targets and missing DQ reasons refuse the correction. Historical changes do not run application automation, outbound webhooks or firm delivery, and do not replace original signing/QA dates with the current time.
- The inbound LawRuler hook authenticates before parsing or privileged logging, caps its body at 20 MiB, rejects remote original URLs, and stops on duplicate source IDs, ambiguous matters, phone-only matches to unlinked source identities or multiple fallback campaigns.
- All accepted App campaigns and the legacy Motel route use the same private original-storage helper. Original PDF/CSV bytes are stored unchanged under the exact firm/lead/claim with SHA-256 and immutable object names. A retry verifies existing bytes and repairs an upload whose document index or provenance failed. Motel IntakeForm PDFs retain their existing secondary-interview category.
- `loadLawRulerProvenance(db, leadId, claimId)` returns exact-matter source status, source-reported signing/date, original-document metadata and missing evidence, without URLs or a fabricated signing-provider record. A later status-only hook does not erase previously supplied signing evidence.

## Historical resend marker and corrected data

**Every historical batch/resend must include `recovery_mode=historical`.** Omit the field only for an ordinary live webhook. Any supplied value other than `historical` is rejected, rather than silently treated as live. Marked resends save source evidence/originals and remain pending status review. They skip legacy Motel secondary-status transitions and LOR workflow updates; newly recovered Motel records do not start a new retention clock. The shared App importer skips its new-lead outbound event and unmatched-communications reconciliation for this marker. This is an explicit inbound option; it does not change ordinary live-hook automation.

Both the actual App importer and legacy Motel path preserve populated corrected first/last/display names and phone/email columns on a resend. Motel now reads every incoming candidate column before filling blanks, and does not reset an existing contact-point record to good/primary. Ambiguous existing Motel matters stop before lead or contact writes. Historical selected status recovery writes no contact/name fields and creates no DocuSeal agreement/provider evidence.

## Operator/API contract

The selected-apply body is:

```json
{
  "firm_id": "<uuid>",
  "selections": [{
    "lead_id": "<uuid>",
    "claim_id": "<uuid>",
    "expected_status": "new",
    "source_status": "<exact original label from preview>",
    "status": "<active ClaimReach status>",
    "mapping_approved": true,
    "mapping_note": "Why this mapping matches the source",
    "dq_reason_key": "<required for a DQ status>"
  }]
}
```

Known existing secondary mappings retain their established definitions. Unknown labels or overrides require explicit approval and a review note. An apply returns individual outcomes; HTTP 207 means one or more selected matters failed or partly completed. The UI invalidates the preview after an apply or uncertain response and requires a fresh read before retrying.

For originals, send multipart files with the existing `x-lr-secret` authentication and a numeric LawRuler LeadID. Each PDF/CSV must be 1 byte–8 MiB; at most eight originals per request. A filename such as `264972-Client-Retainer.pdf` must agree with that source ID. An unnumbered filename needs an `attachment_manifest` entry `{name, lead_id, claim_id?}` matching the exact source and matter. A CSV's embedded Lead Number, when present, must agree. PDF checks verify header/trailer; this is not independent signature or legal validation. Generic document names may need explicit classification review rather than being recognized as retainers.

## Verified offline

- 18 recovery/storage tests: source and firm scope; sibling exclusion; signing provenance retention; unknown mapping approval; stale status/source; compare-and-set race; no historical trigger calls; original dates preserved; DQ validation; partial audit failure; original identity/content checks; immutable dedupe; upload/index and provenance retry; byte/metadata collisions.
- 18 real-route-source harness tests: authentication before body/admin/logging; size/JSON bounds; remote URL refusal; duplicate/matter/phone collisions before ingest; MVA source evidence; actual multipart storage through both MVA and Motel branches; owner/admin boundaries; read-only previews; exact selection validation; owner permission overrides; corrected-name/contact preservation; legacy ambiguity before updates; historical marker and shared-ingest event suppression, with ordinary live behavior retained.
- 4 component/selection tests: initial explicit preview, manual approval and note, ambiguous/unselected exclusion, visible option-loading failure.
- Existing ingestion suite: 12 tests passed. Its ordinary-live synthetic creation logs the existing missing-service-key warnings; no live credentials or sends were used. New historical-mode tests use mocked event sinks and assert zero event calls.
- Existing MVA workstream: 51 engine and 10 actual-renderer parity tests passed before this workstream. Final local TypeScript check passed after the historical-marker changes; parent owns the combined build/browser validation. No live acceptance is claimed.

## Remaining boundaries

This does **not** claim migrated records are already corrected. Actual saved labels and source originals must be previewed and reviewed after deployment. Historical originals absent from ClaimReach need a source resend or separately reviewed import; a status-only webhook cannot recreate a missing file. Existing structured webhook fields continue through the existing ingestion mapper. The original CSV is retained as a document; this change does not invent a CSV-to-MVA-answer mapping or claim every historical intake question was automatically recovered. Remote URL transport remains blocked pending an approved host/payload contract. Source-reported signing and stored originals remain explicitly separate from independently verified signatures and DocuSeal evidence.

A document or audit database failure can leave a successfully stored private original; the exact retry repairs its metadata without replacing the bytes. A status update followed by audit/queue failure returns a partial outcome for review. These operations are not a single cross-service transaction. No runtime production acceptance or legal enforceability claim is made.
