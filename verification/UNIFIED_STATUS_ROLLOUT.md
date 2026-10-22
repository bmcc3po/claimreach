# Unified status rollout — approval required

Branch: codex/unified-current-status, based on main 247e78d.
PR202 and PR203 remain independent. Neither PR is merged or overwritten here.

## Deployment order
1. Review the additive 0130 section of RUN_THESE_MIGRATIONS.sql. Do not run the complete historical runner. This section creates nullable status detail columns, private history, service-only transactional saving, and future firm-decision projection. It does not backfill statuses or write current_stage.
2. Verify migration against a non-production schema clone, including existing triggers and RLS. Local PostgreSQL-compatible tests use a minimal schema; they do not substitute for the clone check.
3. Approve and apply 0130 separately, then deploy the application as one release. The header deliberately fails closed if the schema is missing.
4. Open the same authorized claim in File, Call and NETFLY where applicable. Change Current Status with the required category/descriptor/note; verify saved data and report refresh, stale tabs, denial for inaccessible claims, and agent permissions. Confirm no notifications or sends occur from header status changes.

## Historical reconciliation: preview before any backfill
The operational export adds raw saved status, proposed_status, firm_decision/reason/date/source, historical signing evidence, delivery date/source, unknown/conflict flags, record version, generation time, scope/filter/count. Proposed status is not silently used as saved status. No original rows are changed or deleted.

Check TMP-1201 against the actual latest firm decision, delivery and placement chronology. The test fixture reproduces the reported Delivered + later firm rejection shape but is synthetic. Live chronology was not read in this environment: Supabase list_projects requires an unavailable connection link_id.

Also review TMP-1231 (drop-letter/signature evidence), TMP-1216 (missing send time), and TMP-1303 (delivery versus historical call reason). Missing exported dates are unknown, not proof of a missing event. Never deduplicate TMP-1245/TMP-1246 or other separate files by shared phone/email.

For each approved correction retain claim identity, source event ID, expected_updated_at, reviewer, reason and note. Use the exact-matter Current Status command only after source review; stop on stale versions. Do not perform a bulk status rewrite. Ambiguous legacy keys remain visible with mapping_required=true.

## Rollback
Revert the app release and disable future firm-decision projection if necessary; retain nullable columns and all claim_status_history rows. Preserve legitimate changes made after cutover. Export a checkpoint/version comparison before any restoration. Do not replay signing/delivery notifications or restore stale status snapshots. Reversing the schema or dropping history is not part of rollback. Old code may not understand newly introduced status keys, so rollback must retain a compatible read adapter or use a forward fix.

## API / privacy contract
GET/POST /api/current-status requires exact lead_id and claim_id. POST requires expected_updated_at, status, category, descriptor, note and callback_at when scheduled. Keys in src/lib/current-status.ts are stable. Imported or inactive keys are not guessed. Milestones require existing verified evidence; BMC-only permissions remain enforced.

Default /api/export/standard is operational. Explicit format=technical retains the authorized standard-field export. Neither is a vendor endpoint. The default operational columns omit DOB, SSN fragments and driver license; technical CSV consumers must import identifier columns as text to preserve leading zeros. Source attribution/approved-source registry exceptions are independent of status reconciliation.

## Verification commands
Application dependencies: npm ci --ignore-scripts. Test-only tools are installed outside the repo: npm install --prefix /tmp/claimreach-test-tools tsx react-test-renderer@18.3.1 @electric-sql/pglite.

- npx tsc --noEmit
- node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs src/lib/current-status.test.ts
- node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs src/lib/file-search.test.ts
- node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs src/lib/file-search-route.test.ts
- NODE_PATH=/workspace/claimreach/node_modules node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs verification/current-status-ui.cjs
- node verification/current-status-db.cjs
- node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs src/lib/intake-console/engine.test.ts
- node --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs src/lib/mva-call/engine.test.ts
- npx @cloudflare/next-on-pages (local packaging only)

## NETFLY numbering (0131)
Review/apply additive 0131 with the status schema before enabling this application. Inserts into the exact TMP NETFLY ONTAKE secondary campaign allocate NF-TMP1001 onward through a database sequence. Existing import/create paths receive the number returned by the insert. Internal lead/claim IDs, document paths and delivery history are unchanged. Failed transactions may leave sequence gaps; numbers are never reused.

Existing files keep their original numbers. Owner-only GET /api/netfly/numbering-preview reads the complete campaign (including archived rows) in one database statement and returns count plus ordered old-to-new mappings and expected versions. It does not consume numbers or write records. No renumber-apply endpoint exists in this branch. Review the full source scope first; regenerate the preview after new imports. Preserve old numbers in lead_no_aliases when a later approved migration changes them. The aliases are searched in global search and resolved by NETFLY routes; ordinary updates cannot remove them. No live mapping/count is claimed because database access is blocked.

Rollback retains issued NF numbers and aliases. Do not reset the sequence, recycle numbers, or undo a later agent update. Retain compatible alias resolution if reverting application code. Existing PR203 search remains independent; the common header uses the new /api/files/search contract.

## Mapping and unresolved decisions
| Saved key | Header/export label | Migration treatment |
| --- | --- | --- |
| new | New lead | Existing key, initial state |
| contacting | Still contacting | Existing key |
| scheduled_callback | Scheduled call back | New key; callback date also feeds Desk callback queue |
| esign_sent | Sent esign | Requires existing exact-matter agreement evidence |
| signed_grievous | Signed esign | Existing key; requires signature evidence |
| delivered | Sent to firm | Existing key; evidence is separately verified |
| retained | Firm accepted | Existing key; records a firm-decision event |
| firm_rejected | Firm rejected | New key; records a firm-decision event |
| bmc_rejected | BMC rejected | New key; existing owner/admin restriction retained |
| dq / dnc / wip / flag | DQ / DNC / WIP / Flag | Existing keys; mandatory category/descriptor/note |
| signed_dropped with verified source | Firm rejected or BMC rejected | Future signed-decline workflow writes explicit source; existing records need reviewed chronology |
| signed_wip / signed_flag | WIP / Flag | Legacy key retained and flagged for mapping; no signature erased |
| other signed QA/approval, external review, transferred, duplicate, dead, custom/retired states | Existing legacy value | mapping_required; preserve raw value and internal QA workflow until taxonomy is approved |

Brett still needs to confirm the complete descriptor taxonomy and treatment of legacy QA/approval/withdrawal/custom statuses. The minimal reason list is defined in current-status.ts; it does not infer claimant eligibility. Existing QA/e-sign/delivery workflows retain their evidence gates; replacing those remaining workflow keys requires a separate reviewed mapping, not a destructive bulk normalization.

## Consolidated controls and propagation
FileStatusControl is the sole agent current-status editor in FileHeader (File/intake), CallFileHeader and NetflyFile. ClaimIntake finish actions, QA WIP/Flag actions and the file WIP banner open that editor. Competing FileOutcomeActions and bulk status changes are removed; legacy general status setter routes reject with a pointer to the shared editor. Call dispositions continue to record actual calls and suppress DNC contact without assigning current status. LawRuler messages cannot overwrite a status recorded after cutover; external evidence and acquisition holds remain separate.

Each save sends the exact claim and updated_at version; the transaction locks it and writes history before returning success. Other tabs refetch through their own authorization using ID-only events/BroadcastChannel, focus and visible-page polling. Reports refresh from saved data; no browser broadcasts claimant data. Agents retain claims.status permissions; BMC rejection remains owner/admin-only. Header changes do not send retainers, packets, emails or drop-letter requests.

## Vendor boundaries and remaining rollout gates
Operational/technical exports retain leads.export and session RLS; neither is a vendor endpoint. The partner report remains constrained by its existing exact firm/campaign and approved-source registry. A source registry omission is not a status correction. Do not expose the new internal agent note, medical/eligibility detail, SSN, DOB, license identifiers, other firms' decisions or raw evidence records through vendor projections without a separately approved field-level policy. Existing partner note visibility should be reviewed independently rather than treating all internal notes as vendor-safe.

Read-only source reconciliation verified the reported delivered-but-rejected example: owner-confirmed signing/delivery with unknown original dates precedes a scoped firm turn-down; no later acceptance or placement appeared in the complete activity history. No correction was applied. Unknown-date owner-confirmed delivery now remains explicit in export provenance and supports future firm-decision projection and existing reviewer access.

The full NETFLY campaign contains 18 records (4 active, 14 archived), with no existing NF numbers. An all-record created_at/id ordered preview assigns NF-TMP1001–1018; the four active records fall at 1015–1018. Confirm whether archived records participate before approving any renumbering. Regenerate the preview immediately before execution; new allocations can change it.

Before production: validate hosted authentication, grants and notification integration in staging; review legacy mapping exceptions and source attribution; decide archived-record numbering; and obtain explicit migration/deployment approval. The history foreign key follows the existing claim/activity deletion cascade, preserving the existing owner-only archived-file permanent-purge behavior; normal archive retains history. No backfill, renumbering or deployment has run here.

## Test result and reproducibility
Offline suite: 189 test files, 183 passing after the targeted signed-outcome fixture correction. Six remaining failures also reproduce on unchanged main 247e78d with the same harness: case-history-route (missing file-agents mock), lawruler-acquisition-pages (missing work-area mock), CallsHome (missing received-date mock), agreement-choice (old signed-correction UI expectation), desk-note-draft (old review-button expectation), and home-navigation (missing file-agents mock). They are not claimed as passing. PR203 owns CallsHome changes; this branch does not replace its work.

For existing classic-JSX/CSS tests use `node --require ./verification/test-bootstrap.cjs --import /tmp/claimreach-test-tools/node_modules/tsx/dist/loader.mjs <test-file>`. The dedicated header interaction script runs separately with its renderer. Both engines pass (intake 78; MVA 71). Local PGlite checks apply the exact draft migration sections to a minimal schema; concurrency testing exercises 20 independent insert requests against the sequence, not a production multi-node load test.

The read-only export reports unknown next_action_owner when there is no authoritative next-action assignment. It does not substitute the signing agent or intake agent. Full historical correction remains a reviewed operational step, not something the new UI silently performs.

## Additional live-schema validation
Read-only catalog reconstruction applied both draft migrations locally to all 83 public tables, 1,222 columns and 338 constraints, with 46 captured policies and eight existing identity/delivery/firm/timestamp/numbering triggers. Synthetic records passed transactional saves, stale-version rejection, unknown-date owner delivery, later acceptance and history preservation. Auth users and vault references are skeletal local fixtures; the outbound notification trigger and actual hosted grants/authentication were not exercised. This is broader schema compatibility evidence, not a complete hosted staging certification. Snapshots are in /tmp/cr-live-{schema,policy-functions,triggers}.json; reproduce with NODE_PATH=/tmp/claimreach-test-tools/node_modules node verification/current-status-schema-db.cjs /tmp; no production claimant rows were copied into the database.

Active TMP MVA taxonomy audit (read-only): 160 claims, including 26 unresolved legacy keys (external_dq_review 11, not_interested 10, dead 4, signed_dropped 1). Remaining counts: dq 51, delivered 35, contacting 23, new 15, esign_sent 9, signed_grievous 1. Matching the attachment row count is not proof of identical membership or complete evidence reconciliation.
