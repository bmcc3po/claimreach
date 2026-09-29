# V9 delivery and export verification

Local implementation in `work/claimreach-v9`, based on imported v8 `ab63de6`. No live database writes, client reads, provider sends, or deployment were performed by this reviewer.

## Implemented

- Firm delivery requires every selected agreement PDF and selected signing certificate. The current agreement selector includes unfinished/voided replacements, so an older completed packet cannot silently substitute. A newer provisional emergency also prevents substitution until the explicit re-sign/provisional policy is satisfied.
- Nested `answers.mva_call` uses the shared call report for PDF and CSV. Client details, intake answers, carrier, report number and vehicle details are included; SSN is excluded. The PDF export resolves the named matter through the caller's session first.
- Signed-date export bounds filter each derived matter record's `sign_date`, including its own agreement evidence. A person's copied signing date no longer excludes a newly signed sibling or admits an unsigned sibling. Existing sole-matter legacy fallback is preserved.
- Local migration **0110** adds a durable per-claim dispatch reservation, stable provider request key, uncertain-outcome blocking, and owner/admin reconciliation with a provider-check note. A forced retry cannot bypass a running or uncertain attempt. A successful prior send can be deliberately repeated with a new key.
- The reservation verifies lead/claim/firm/campaign identity after packet assembly. A narrow private-schema trigger prevents reassignment/archive during a running or uncertain attempt. Normal authenticated edits still work; clients gain no dispatch-table access or RPC execution.
- Manual delivery remains available to an internal agent with `claims.status`; it adds no separate QA approval. The route reads the lead/matter through session RLS before privileged dispatch operations and exposes the selected recipient for confirmation.
- Follow-up review fixed signed disposition's emergency supersession gap and removed signing-read dependency from DNC/other non-signed dispositions. A status confirmation remounts on matter changes rather than retaining the previous matter's pending selection.
- Delivery checks the current agreement's injured-person name against the canonical PNC after contact-name correction. A mismatch requires review and corrected signing; original evidence is preserved. A guardian signer remains valid when the injured person matches.
- The file header exposes archive/restore under the existing server capability, with a whole-file confirmation and preservation explanation. Default agents do not receive archive access. It calls the existing bulk API for one named file and exposes no permanent-delete action.

## Evidence

| Check | Result | Boundary |
|---|---:|---|
| `firm-delivery.test.ts` | 31 pass | Actual delivery helper; synthetic storage, DB RPC contract and email seam. Includes concurrent send attempts, incomplete packets, current-agreement replacement, certificate failures, uncertain provider result, final DB stamp failure and corrected-name/guardian cases. |
| `firm-delivery-route.test.ts` | 7 pass | Actual transpiled route; session visibility, agent permission, reconciliation actor binding and missing migration. |
| `intake-render.test.ts` | 5 pass | Actual shared loader/renderer/export route; generated PDF bytes decoded and checked for saved MVA values, correct matter and no SSN. |
| `standard-fields.test.ts` | 26 pass | Existing mapping/export suite plus own-matter date bounds and preserved sole legacy fallback. |
| `mva-call/dispo-route.test.ts` | 5 pass | Actual transpiled route; DNC during signing-read failure, emergency supersession, identity mismatch and valid signed report. |
| `case-history-route.test.ts` | 6 pass | Actual File/retainer/signable routes; selected history, shared document labels, foreign-matter refusal, preserved legacy separation and denied legacy evidence mutation. |
| `FileArchiveButton.test.ts` | 5 pass | Actual component with hook harness; capability visibility, confirmation/cancellation, exact file archive/restore body and visible failure. |
| `work/v9-verification/dispatch-sql-checks.cjs` | 17 pass | Actual migration executed twice against synthetic in-memory PostgreSQL (PGlite); grants, trigger privileges, identity/scope guards, CAS, reconciliation and transaction rollback. |

The SQL checks are single-session executions, not a live multi-session load test. Application concurrency tests model the RPC contract; production provider delivery and deployed migrations remain unverified here. Parent owns overall typecheck/build and consolidated release review.

## Deployment and recovery requirements

0110 is local only and its ledger stanza is synchronized. Apply through the project's reviewed migration process before deploying code that reads the dispatch table. Missing migration fails visibly and prevents a send. Signing agent separately owns 0111 and emergency evidence handling.

For an uncertain attempt, an owner/admin checks the provider with the displayed attempt/request key, waits at least two minutes for a still-running attempt, then records delivered or not delivered with evidence. Reconciliation never sends an email. A not-delivered conclusion permits a later deliberate send; it must never be selected merely to clear the warning.

Emergency firm-delivery policy still needs the user's explicit decision: current code refuses normal primary readiness for provisional emergency evidence and explains that DocuSeal re-sign or an explicitly approved provisional workflow is needed. No automatic provisional delivery override was invented.

MVA readiness is independent of attachment choices: delivery requires its current completed, nonvoided DocuSeal agreement and its full packet plus certificate readable from private storage, even with both signing attachments disabled. A PNC-name mismatch blocks delivery; guardian signing compares the injured person. Only selected artifacts are emailed. Every campaign checks for a superseding provisional emergency regardless of attachment configuration. Non-MVA intentionally unsigned delivery remains available with both signing attachments disabled and no active superseding emergency; it is not proof of primary signing. Five added regression groups cover these boundaries, including ten MVA failure cases and emergency-only/superseding cases across MVA and non-MVA.
