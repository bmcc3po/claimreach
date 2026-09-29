# V9 signing implementation — local verification

No deployment, provider calls, real email/SMS, or live signing/database writes were performed by this signing work.

## Implemented

- Shared `signing-matter.ts` resolves explicit claim/call identity before provider or service-role mutations. Call-only requests derive their claim from that call; explicit mismatches fail. Named sole claims retain compatible legacy-null evidence; multi-claim null evidence never becomes a wildcard.
- Latest own DocuSeal agreement includes a newest voided row, so an old completed agreement cannot silently become current. Historical void is explicitly selected. Passenger child files resolve their original indexed agreement as their primary agreement.
- Send, poll, resend, complete, void, preview and summary-email use the matter binding. Passenger email-only file creation stores that passenger's email and no inherited caller cell. Child void rollback targets its child claim. Voided or emergency-superseded PDFs are excluded from summary email.
- Signature progression records a durable claim-recovery marker with the signature write. Subsequent sync recovers failed claim/projection updates without replaying an already-signed status transition, preserves packet diagnostics, uses status compare-and-set, and does not roll back a later DQ/manual decision. Existing artifact manifest recovery remains.
- Notification retry uses `signedNoticeDue`, preserving the v8 leased, provider-idempotent at-least-once model. Fresh submission identity selects recipients from its own claim/campaign and summary from its own call/claim. Passenger notifications never borrow the parent's personal intake answers.
- Generic campaigns can use the same DocuSeal endpoint with a configured campaign template; MVA retains its state/Nevada rules. Non-MVA office completion does not force MVA-specific DOB/SSN. Configuration must provide Client/Intake roles. No external template configuration was performed.
- Explicit emergency packets snapshot private source PDF bytes, template fields, autofill, source hash, claim/campaign, reason, immutable membership and canonical consent before publication. Text templates are frozen into the PDF actually reviewed by the signer. No live template is consulted at signature time.
- `0111_emergency_signing_evidence.sql` and matching appended ledger stanza claim one immutable packet-wide signature/consent event, require every signed PDF/certificate to exist before finalizing, and atomically emit one provisional notification. Public RPC execution is revoked. A reload can resume storing the first recorded evidence without redrawing. Signed/cancelled evidence cannot be overwritten, reopened, or deleted through the new flow.
- Emergency-only evidence is provisional (`needs_resign:true`); it does not forge a primary-complete claim transition or normal firm delivery. `getMatterEmergency` and `emergencySupersedes` define the cross-provider precedence. Explicit primary re-sign logs the source emergency group and naturally supersedes it once newer.
- Legacy SignWell creation and arbitrary direct signable creation were retired in favor of DocuSeal primary or an explicitly reasoned campaign emergency packet. Existing signed history/downloads remain; unsnapshotted pending emergency links require reissue.
- PNC first/last-name edits are available in the shared ContactCard. Successful canonical saves emit name updates. The intake follows only blank/matching known drafts, preserves OBO guardian names, flags ambiguous or already-sent names, and never rewrites provider evidence. Office completion rejects an old agreement naming a different PNC.

## API/UI contracts

- `resolveSigningMatter(db,leadId,{claimId?,callId?,allowArchived?})`: archived allowed only for explicit read-only callers. GET signing returns existing archived state without provider sync.
- Primary GET includes `claim_id`, `agreement_id`, `templates`, `case_type`, `read_only`, safe `agreement` metadata, and `emergency:{group,status,needs_resign}`.
- Primary POST generic campaigns: `lead_id,claim_id,signer_name,via,phone/email,template_key?`; `emergency_resign:true` explicitly permits re-signing a newer signed emergency while preserving historical primary evidence.
- Complete/resend accept `agreement_id`; void accepts `agreement_id` or legacy `id`.
- Emergency creation: `/api/esign`, `op:'send_packet',method:'builtin',emergency_reason,lead_id,claim_id,signer_*,send_via`.
- Emergency submit requires `op:'sign',consent_accepted:true,consent_version:'emergency-v1'`; recovery uses `op:'resume'` and existing recorded evidence only.
- `cr:contact` after name save: `{leadId,name,previousName,first_name,last_name,claimant_name,...contacts}`. Engine exposes `nameReview`, `canUseRecordName`, `useRecordName` for the shared Send notice.

## Executed offline tests

- `src/lib/notify-signed.test.ts`: 28 scenarios.
- `src/lib/mva-call/signing-lifecycle.test.ts`: 14 scenarios.
- `src/lib/emergency-signing.test.ts`: 10 scenarios; generated signed PDFs/certificates loaded back through pdf-lib.
- `work/v9-tooling/signing-routes-test.cjs`: 20 actual-source mocked route scenarios, including explicit emergency re-sign, preserved original evidence and rejection of superseded primary office completion.
- `work/v9-tooling/emergency-sql-test.cjs`: 15 actual Postgres/PGlite scenarios, including grants and immutable evidence trigger.
- `src/lib/mva-call/engine.test.ts`: 59 scenarios, including six new name-reconciliation scenarios and two superseded-agreement completion guards (shared existing engine suite, not additional to parent totals).
- `src/components/calls/signing-poll.test.ts`: 7 actual-source scenarios covering emergency preparation, stale responses after replacement send, passenger updates, fresh emergency readiness and the generic signing desk's completion condition.
- `src/lib/case-history-route.test.ts`: 11 actual-source scenarios, including column-first matter history, shared document labels and archived file flags.
- `src/app/api/leads/route.test.ts`: 12 actual-source name-save route scenarios, including canonical split/display names and compare-and-set conflicts.
- `src/components/contact-saves.test.ts`: 31 component-source harness scenarios, including keyed cross-file cleanup with pending/in-flight saves, canonical ContactCard acknowledgements, one MVA address editor and preserved non-MVA shared fields. This is a shallow hook harness, not a browser/device rendering test.

## Release boundaries

- 0111 is local only, synchronized with `RUN_THESE_MIGRATIONS.sql`. Deploy matching migration/server/client together after authorization. No destructive historical backfill is included.
- Generic campaigns still need approved DocuSeal templates and approved emergency packet configuration. Empty configuration produces a setup-required error, not a silent legacy/provider fallback.
- Notification delivery remains bounded provider-idempotent at-least-once, not exactly-once. Provider archive followed by a failed local void returns explicit reconciliation required and records an audit; no claim of cross-system atomicity.
- Email resending an existing DocuSeal email link remains an explicit unsupported action; it does not silently send a text instead. Original delivery state/history is preserved.
- Production provider behavior, deployed schema, browser device behavior, and full build gate remain parent integration checks. Synthetic tests are not evidence of live delivery or production readiness.
