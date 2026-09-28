# ClaimReach v8 checkpoint handoff

Saved Sep 28 2026, when Brett asked to stop and save. Development stopped here. Nothing in this checkpoint is deployed.

## Starting point

- Base: `main` at `822338f` (merged PR #40, head `577490c`). Its source is identical to the round 7b zip Astra reviewed.
- Work branch: `round8`, local to Claude's session. `git push` is refused (403) from this session, so the zip is the delivery. There is no PR.
- Checkpoint commit: see the last commit on `round8` (listed in the chat message with this zip).

## Status words used below

- **Implemented**: code written and committed on `round8`.
- **Tested**: automated tests below ran and passed on the integrated branch. These are offline tests with fake database, storage and provider. They are not browser, device or live-provider acceptance.
- **Deployed**: nothing in this checkpoint is deployed. Live is still PR #40 (round 7b).

## Implemented and tested (offline) in this checkpoint

1. **Matter rule** (`src/lib/matter.ts`)
   - `resolveMatter` now reports `sole`, which means the lead has exactly one claim, however the claim was picked.
   - New `matterRowsFilter` and `rowBelongsToMatter`: a legacy row with no claim counts only for a sole matter on a compatible campaign.
   - Test: `matter.test.ts`, 5 passing.
2. **Standard fields truth pass** (Astra 7b standard-fields review)
   - `buildStandardRecord` uses the shared matter rule. A bad named claim fails. An ambiguous lead borrows nothing. Read errors fail. There is no 3-claim limit.
   - Incident facts come from the matter's own call. Voided agreements are excluded. Standard keys win over event data in webhooks.
   - The export filters by the matter's campaign, pages through everything, fails loudly on read errors, and carries the Leads filters.
   - Fields are marked writable, derived or protected. Every writable inbound field reaches its column. LawRuler/marketer ingest fills incident and phone columns.
   - A new address without a ZIP clears the old ZIP.
   - Tests: standard-fields 24, us-address 10, lead-ingest 12.
3. **Firm transfer copy-then-switch (G1)** (`leads/bulk` move_firm)
   - Originals stay until the database commits. Every cleanup result is checked. "Nothing moved" is said only when true; partial results list the leftover paths and write an audit entry.
   - Test: bulk-move-firm 13.
4. **QA approval needs the matter's own complete packet (#58)** (`api/qa`, `QaPanel`)
   - Signed-only, voided, incomplete packet and sibling evidence are refused.
   - Unassociated legacy evidence returns `needs_association`, with an "Attach to this matter" action for owner, admin, manager or qa.
   - Test: qa-evidence 18.
5. **Firm delivery per matter (#57)** (`firm-delivery.ts`, `intake-render.ts`, `api/firm-delivery`, SendToFirmButton)
   - Uses the claim's campaign settings, the claim's intake bundle, and the designated current agreement. The sent guard is per claim, and `firm_deliveries.claim_id` is written.
   - Test: firm-delivery 20.
6. **Contact save races** (ContactInfo, CaseDetails, console ContactCard, new `useFieldAutosave.ts`)
   - Field-level revisions. A refresh never cancels or reverts an edit. Only changed fields are sent. A failure stays dirty.
   - Test: contact-saves 23.
7. **Signed-notice lease (#63)**
   - `notify_state` lease, `no_recipient` state, Resend `Idempotency-Key`. This is at-least-once, not exactly-once.
   - One signed classifier (`isSignedKey`) for Leads, Signed and Reports.
   - Drip enroll/process need `drips.manage`, an active user and an RLS-visible lead. The drip kill switch `DRIP_DISPATCH_ENABLED` must be "on" to send.
   - comms duplicate path stamps the original time.
   - Tests: notify-signed 23, statuses 8, drip-dispatch 11, comms 11.
8. **MMS filing (#62)** (`inbound-media.ts`, JustCall webhook, `api/inbound-media`, Settings panel)
   - One `inbound_media` row per attachment with retry. Safe fetch: https only, no private hosts, 2 redirects max, 15s, 15 MB, type allowlist.
   - Single match is filed; several or none are quarantined; staff resolve. Webhook counts are truthful.
   - Test: inbound-media 19.

## Other tests run on the integrated branch (all passing)

engine 51, server helpers 13, SSN/DOB 3, DocuSeal 12, signed-docs 17, file-fence 41, drip-rules 17.

Type check `npx tsc --noEmit -p .`: zero errors. `npx @cloudflare/next-on-pages`: Build completed, Edge Function Routes (193).

## Not done or partial (do not treat as fixed)

Astra round 7b P1 items still open:

- **One question spine across Guided, Collapsible, All questions and Simple form.** Not started. This is Brett's main complaint.
  - Simple form is missing the represented-caller follow-ups.
  - Passenger fields differ by view.
  - Simple form drops the injury-check wording and cues.
  - Simple form's recipient field bypasses "Another number" (`toOther`).
  - The footer next step is wrong in Simple form, and Simple form does not scroll to the target.
- **Matter binding still open in:**
  - disposition (call A with claim B; event uses the lead campaign)
  - File tab notes (oldest claim)
  - e-sign send (template chosen from the lead campaign before the matter is resolved)
  - resend (ignores claim)
  - poll, complete and void (still use `claim_id OR null`, which should switch to `matterRowsFilter`)
  - the call page (checks lead case type before the matter)
  - classic links (drop `?claim`)
  - the WIP banner (lead-level)
  - emergency signable submit/packet (no claim; replay can rewrite evidence)
- **Signing lifecycle:**
  - A claim transition that fails after signing is not retried.
  - The passenger child file cannot complete its own agreement (`pax_index` filter).
  - A passenger created by email only stores the caller's phone and not their own email.
  - Passenger void does not roll back the child claim.
  - The case email (`api/calls/email`) can attach a voided PDF.
  - Void race: DocuSeal archives but the PNC signed first, and no reconcile record is kept.
- **esign.ts:** use `signedNoticeDue(row)` in `syncSubmission` and remove the "exactly once" comment (see the notify agent note).
- **Cadence phase 1** (Brett's 15-attempt MVA schedule, 8am to 9pm client-local), and drafting e-sign chase SMS wording for Brett's approval. Not started.
- **Classic Retainer tab** showing the real TMP DocuSeal agreements (#66). Not started.
- **Follow-ups the agents flagged:**
  - LeadsView bulk move does not show the move's `warning`/`cleanup_pending`.
  - `m6-scope.test.ts` "live LR shape" expectation needs the new null keys (it was already failing before).
  - `comms.ts` `matchLeadByPhone` filters a `leads.status` column that does not exist.
  - The JustCall filter edge function passes only `phone_norm` matches.
  - Drip dispatch loop still swallows errors and has no STOP/quiet-hours checks. Keep `DRIP_DISPATCH_ENABLED` off.
  - `resolveFormKey` still reads the first claim for the intake PDF export.
  - Firm delivery guard is read-then-stamp (a concurrent double send is possible).
  - Hooks/in still defaults `case_type` to `motel_trafficking` when a sender omits it; Brett to decide.

## Behavior changes Brett should know (auth/permission flagged per AGENTS.md)

- `/api/drip`:
  - Deactivated accounts are refused on every op.
  - Enroll and "Run due drips" need `drips.manage` (owner, admin and manager by default). Agents and QA lose it unless they have an override.
- QA: lead-level legacy retainers no longer count on their own. QA attaches them to the matter once.
- JustCall webhook: outbound texts are now logged as outbound (old code logged every text as inbound). An unrecorded message returns 500 so JustCall retries.

## Migrations and configuration

- 0108 and 0109 (plus 0109b void columns) are already APPLIED live, from earlier rounds. No new migration is in this checkpoint.
- Optional env:
  - `DRIP_DISPATCH_ENABLED`: leave unset or off.
  - `JUSTCALL_MEDIA_HOSTS`: comma-separated allowlist for MMS media hosts, once JustCall's host is confirmed.

## Exact next steps

1. Upload this zip as a PR, let the Cloudflare check run, and merge only after Brett's go-ahead.
2. Build the canonical MVA question spine: one descriptor list with id, label, full question, options, condition, requiredness and save path, consumed by all four views. Add a cross-view parity test that renders each view and compares question ids and options.
3. Finish matter binding in dispo, the File tab, e-sign send/resend/poll/complete/void, the call page gate, classic links, the WIP banner and emergency signing, using `resolveMatter` plus `matterRowsFilter`.
4. Signing lifecycle items above, then the esign.ts notice change.
5. Classic Retainer tab (#66), then cadence phase 1.
