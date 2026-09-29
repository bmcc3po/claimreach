# ClaimReach v9 candidate: handoff to Claude

This v9 candidate is built on the preserved v8 ZIP import (local checkpoint `ab63de6`) on branch `codex/claimreach-v9`. **It is not deployed or merged.** The v8 handoff is preserved in `docs/handoffs/v8-checkpoint.md`. See `verification/README.md` for repeatable offline checks and the accompanying release record for the exact candidate commit and final validation. This is not a full production security certification or launch approval.

## Product decisions to preserve

- Dashboard remains the starting page. Review case and resume intake keep the selected matter. Keep useful queue distinctions.
- Guided, Collapsible, All questions and Simple form remain available. They present the same MVA questions, labels, choices, conditions, follow-ups and saved answers. Width changes presentation, not questionnaire semantics.
- MVA is agent-owned through signing, office completion, review and firm delivery; do not add a mandatory separate QA handoff. Preserve other campaigns' required review processes.
- DocuSeal is primary across campaigns. Keep an explicit campaign-configured in-house emergency signer during outages, with preserved original evidence and a visible re-sign requirement.
- Preserve SMS/drip capabilities and the current **drips OFF** state. This implementation did not enable or resume them. Do not turn them on as a side effect of rollout or historical recovery.
- Corrected client names and original signed documents are evidence. A later import or screen refresh must not silently replace them.

## Implemented in this candidate

| Area | Current implementation |
|---|---|
| MVA question parity | Shared question descriptors/controls serve the four renderers, including conditional representation/treatment questions, passenger capture, alternate recipient number and guided continuation. The saved section/question cursor restores the same intake position. Existing answer IDs and persisted answer structure remain compatible. |
| Case navigation | Case destinations group History, Communications, and Documents & signing. Call-workspace utilities remain available at compact widths; Review case/Resume intake preserve matter identity. Prior intake evidence remains available as history. This is not a claim that every admin page has been redesigned. |
| Contact and matter state | Contact/Case Details save handling, canonical first/last/display-name edits, matter-scoped summaries, keyed pending controls and same-matter routes were tightened. Draft intake names reconcile only when safe; already-issued mismatched signing names require review rather than rewriting evidence. |
| Signing | Send/poll/resend/complete/void/preview resolve the exact matter and current agreement. Newer voided/replacement/emergency evidence cannot silently reveal an older agreement as current. Passenger contact and evidence stay with the passenger's matter. Failed signature-to-claim updates can be recovered with status comparisons and durable markers. |
| Emergency signing | Explicit outage reason, frozen source/template/autofill snapshot, immutable packet membership, consent and one recorded signature event; completion requires the packet's stored PDFs/certificates. Evidence remains provisional and linked to the later DocuSeal re-sign. Existing signed history/downloads remain; unsnapshotted pending links need reissue. |
| Delivery and exports | Selected packet artifacts must be complete. Delivery has a durable per-matter reservation and uncertain-outcome reconciliation. Manual delivery remains available to a permitted internal agent. PDF/CSV consume nested MVA answers, exclude SSN, and keep matter-specific signing-date filters. Whole-file archive/restore uses existing permissions and preserves evidence. |
| LawRuler recovery | Settings has an owner/admin, firm-scoped preview and selected correction flow. Unknown labels need an explicit reviewed mapping; updates compare the expected current status and suppress historical events/delivery. Both App and legacy Motel ingestion preserve corrected populated contact fields. Original PDF/CSV bytes use private, exact-matter, hash-based storage with retry repair and separate source-signing provenance. |

## Required release work: not applied here

**0110_firm_delivery_dispatch.sql and 0111_emergency_signing_evidence.sql are required local migrations, not applied to production.** Their append-only stanzas are in `RUN_THESE_MIGRATIONS.sql`. Review/apply them through the approved migration process with the matching server/client release. 0110 supplies dispatch reservations, identity guards and reconciliation; 0111 supplies immutable emergency evidence and controlled completion. Missing schema must remain a visible failure, not a reason to bypass the guard. Do not blindly rerun unrelated historical ledger entries.

The final deployed environment still needs verification: matching application version and schema, private storage/access controls, configured provider account/template bindings, callback authentication/routing, allowed recipients and notification configuration. Mocked providers, synthetic SQL and generated PDFs do not prove a successful live provider round trip. Keep existing drips OFF during this work.

## Concrete remaining boundaries

1. **Generic campaign configuration.** Each campaign still needs its approved DocuSeal template and required Client/Intake roles, plus its approved emergency packet configuration. Empty configuration returns setup-required; there is no silent legacy-provider fallback. No provider templates or external account settings were configured by these workstreams. Confirm each campaign's effective packet rather than relying on an unrelated legacy-template warning.
2. **Emergency delivery policy needs Brett's decision.** The candidate keeps emergency evidence provisional and blocks treating it as normal primary-complete evidence. Normal firm delivery requires the primary/re-sign path. Do not invent an automatic provisional-delivery override; any permitted provisional workflow, recipient wording and approval conditions must be explicitly decided. Do not claim legal enforceability from these technical tests.
3. **Historical LawRuler resends must carry `recovery_mode=historical`.** The marker preserves source/originals pending review and suppresses App new-lead events/unmatched-comms work, Motel status/LOR workflows and a new Motel retention clock. Ordinary unmarked live-hook behavior is intentionally preserved and may trigger configured workflows. Settings preview GETs never mutate; selected POST applies reviewed exact matters. Never use unmarked bulk resends as a recovery shortcut.
4. **Missing migration data is not reconstructed.** A status-only webhook cannot recreate an absent original retainer. Original CSVs are retained as documents; automatic CSV-column-to-MVA-answer mapping is not implemented. Review real source labels, field mapping and exact lead/matter identity before importing historical intake answers. Missing originals require a reviewed source resend/import. Remote document URLs remain blocked until an approved host/transport contract exists. Source-reported signing, stored originals and independently verified signature evidence remain distinct.
5. **Cross-system outcomes still require reconciliation.** An uncertain delivery must be checked against the provider using its request/attempt key before an owner/admin records delivered/not delivered. Reconciliation does not send. Provider archive followed by failed local void is explicitly unresolved. Notification delivery remains provider-idempotent at-least-once, not exactly-once. Do not clear warnings merely to permit another send.
6. **Attachment choices do not bypass MVA readiness.** Every MVA send requires its current completed, nonvoided DocuSeal agreement and its full packet plus certificate readable from private storage, even when both agreement attachments are disabled. A PNC-name mismatch blocks delivery; guardian signing compares the injured person. Only selected artifacts are emailed. A newer active emergency blocks normal delivery for every campaign regardless of attachment switches. Non-MVA campaigns retain intentionally unsigned delivery when both signing attachments are disabled and no active emergency supersedes primary evidence; that configuration is not proof of signing.
7. **Specific UI/provider limits remain.** Resending an existing DocuSeal email link is an explicit unsupported action; do not substitute SMS. Confirm real browser/device behavior and same-matter navigation after the matching release. Delivery Board purpose/data acceptance and the distinction between the compiled MVA question spine and configurable form-builder forms need explicit product validation; this candidate does not claim every administrative surface or form-publishing path has been unified.

Final suite review also repaired a pre-existing legacy form-conversion omission: generated appointment-commitment visibility now preserves the existing console's injury/treatment/willingness/date-window rule. Its stored form condition uses the existing date classifier, with both date boundaries covered. This does not publish or backfill already-stored forms and does not change the current MVA-call spine or approved question wording. The Motel scope test's exact expected mapping was updated for standard columns already present in the v8 mapper.

Use the shared question spine, signing-matter resolution and status setter for further changes. Do not reintroduce a renderer-specific question list, lead-wide signing selection, mutable historical evidence or a separate provider workflow to bypass a missing configuration.

## Supporting evidence

- `docs/handoffs/v9-lawruler-recovery.md`: recovery protocol, tests and data limitations.
- `docs/handoffs/v9-delivery-export.md`: delivery/export behavior, migration and reconciliation boundaries.
- `docs/handoffs/v9-signing.md`: signing contracts, emergency evidence and remaining provider limits.

The accompanying release record contains final checks and candidate identity. Follow the deployment boundary above; no production rollout is implied by this handoff.

## Final browser inspection

Local synthetic preview used the actual CallConsole, DeskChrome, LeadWorkspace and styles with mocked endpoints and external connections blocked. Checked 390Ã—844 phone, 1024Ã—768 iPad landscape and 1440Ã—900 desktop; all four intake modes, conditional treatment follow-up, correction of a contact name and unsent draft, reload, matter separation, failed-save feedback, review/resume and signing history navigation. Fixed mobile mode crowding, the overlapping tools button, narrow dialog fields and cramped case-header identity. These are browser viewport checks, not physical-device Safari acceptance or a live provider round trip. Renderings are supplied separately.

MVA historical agreements from LawRuler/legacy providers are preserved as history; the candidate does not silently promote them to verified DocuSeal evidence. Current MVA delivery requires its current primary packet. Decide and implement any verified historical-evidence acceptance path explicitly before delivering such legacy matters.

## Candidate validation

- TypeScript: zero errors.
- Offline suite runner: 54/54 suites passed on the final implementation, including 36 delivery scenarios, 20 signing route scenarios and real in-memory PostgreSQL checks for both new migrations.
- Cloudflare packaging: exit 0, Vercel Build Completed, 193 Edge Function Routes and final Build completed. A local Windows adapter was required; instructions are in verification/README.md. Build warnings include platform/cache notices and one non-blocking CSS flex alignment compatibility warning.
- No live-provider round trip, deployment or production migration was performed for v9.
