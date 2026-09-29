# LawRuler PRESIGN → shared MVA intake: verified source map

**Implementation update:** the new local sync package implements the exact-field mapper, source-fact display, missing-only import and concurrent-save protection described below. The diagnosis and proposed protocol later in this document record the pre-fix baseline, not still-unfixed code. Live transport encoding, deployment and backfill remain unverified. See `v9-lawruler-live-sync.md` for the current disposition. Existing question wording is unchanged.

Read-only review of local v9 source, September 28, 2026. **Scope is INNO MVA PRESIGN only.** Exclude Post Sign, DNU and MVA GUIDE. No application, database or customer-record changes. The source schema is now verified from the LawRuler Form Builder: tab 21, case type 222, Presign Form header 7823, saved in `work/lawruler-presign-field-definitions.json`. It contains 34 rows: 26 custom tokens and 8 contact rows whose token displays are unresolved. Follow-up read-only field-editor inspection confirmed the choices for 4121, 4127 and 4131; each editor was cancelled without saving. The initial JSON still contains the builder placeholders for those controls, so the follow-up observations are recorded below. Builder tokens identify fields; their expansion and actual webhook/export value encoding have not yet been tested. Similar wording alone does not establish equivalence.

## One destination for all four views

The current MVA question spine is `src/lib/mva-call/intake.ts:24` plus `question-spine.ts:11`. Each path below is relative to **`claims.answers.mva_call` on the exact selected claim**. Guided, Collapsible, All questions and Simple form use the same engine/descriptors and `IntakeQuestion` renderer. Import once into that shared state; never add four separate field maps or alter approved wording.

`src/lib/canonical-fields.ts` also calls itself a spine, but it is the general integration/form dictionary. Its IDs such as `currently_represented`, `received_treatment` and `at_fault_party` are **not** the live MVA App answer paths. Merely filling those generic keys does not fill the four MVA views.

## Confirmed PRESIGN tokens and target mapping

**Ready** means the source meaning has an existing destination and a deterministic transform can be specified. It does not mean the transport or customer answers were tested. **Review** means values/options or meaning must be confirmed. **Preserve** means retain the exact source question/answer without pretending it answers a different App question. Keep the original for every row, including those that map directly.

All destination paths below remain relative to `claims.answers.mva_call`. Custom tokens are shown exactly as observed. No Post Sign, DNU or MVA GUIDE fields are included.

| Verified source token / PRESIGN field | Destination / disposition | Exact rule and current limit |
|---|---|---|
| `<<Custom4124>>` — accident date | **Ready:** `when` → `story.when`, `story.date` | Validate an absolute date; write `when="Pick a date"`, `date="YYYY-MM-DD"`. Preserve approximate/ambiguous dates for review. Never anchor Today/Yesterday to the resend date. |
| `<<Custom4125>>` — accident city; `<<Custom4126>>` — accident state | **Ready after state decoding:** `city` → `story.city` | Combine coherently as `City, ST`. State selector values were not exposed; verify whether export sends a name, code or option ID. Never substitute the contact/mailing State row. This drives draft agreement selection and deadline logic; do not rewrite sent agreements. |
| `<<Custom4141>>` — brief account of what happened | **Ready:** `notes` → `story.text` | Preserve narrative verbatim. Apply to untouched destination or preview an explicit merge; do not replace an agent narrative. |
| `<<Custom4123>>` — Summary | **Ready, secondary narrative:** `story.text` plus original source record | If 4141 is blank, use Summary; if both differ, show a labeled merge preview, not last-value-wins. Preserve both originals separately. |
| `<<Custom4130>>` — injuries reported | **Ready:** `body.painNote`; **Review:** `body.pain[]` | Preserve text verbatim. Do not infer body-region chips or `body.done.pain=true` from a generic injury statement. Explicit regions may be proposed for human review against existing choices. |
| `<<Custom4132>>` — first treatment visit; `<<Custom4133>>` — most recent visit | **Ready for valid dates:** `body.firstAt`, `body.lastAt` | Strict absolute ISO dates; `same` only for explicit accident-day treatment; `unsure` only for explicit uncertainty. Reject impossible/future/pre-accident dates. Applicability depends on treatment answers, so retained dates may remain hidden until 4131 is resolved. |
| `<<Custom4137>>` — own uninsured/underinsured coverage | **Ready:** `uim` → `body.uim` | Builder confirms Yes/No radio labels; map to existing Yes/No string choices only after checking exported encoding. Blank is not No. If 4138 notes uncertainty, mark a conflict for review rather than silently treating a stored No as confirmed. |
| `<<Custom4140>>` — accepted payment for injuries, explicitly excluding vehicle payment | **Ready:** `check` → `body.check` | Confirmed Yes/No question: Yes → `Yes, for injuries`; No → `No`. Do not invent `Only for the car`; that needs separate explicit evidence. No automated status change. |
| `<<Custom4121>>` — driver/passenger; `<<Custom4122>>` — other explanation | **Ready:** `seat` → `story.seat`, `story.seatOther` | Field editor confirms Driver / Passenger / Pedestrian / Other, matching the App choices exactly. Map these decoded labels one-to-one. Preserve 4122; use as seatOther only for explicit Other. Missing explanation keeps Other incomplete. |
| `<<Custom4127>>` — who was at fault; `<<Custom4128>>` — explanation | **Partly ready:** `fault` → `story.fault`; labeled explanation in narrative/source facts | Confirmed choices: Caller at fault (DQ) → `Caller`; Other Vehicle → `Other driver`. Same Vehicle Driver (if PNC is passenger) remains an explicit passenger/same-vehicle source fact for review: the App has no separate same-vehicle-driver choice. Other is not automatically Not clear; inspect 4128. Preserve every original label and explanation. Do not execute the label's DQ instruction. |
| `<<Custom4131>>` — seen by a doctor, check all that apply | **Partly ready:** `seen` → `body.seen[]`, `body.done.seen` | Confirmed multiselect labels: NO TREATMENT → `Not yet`; Primary Care Physician → `Own doctor`; Chiropractor → `Chiropractor`; Urgent Care → `Urgent care`. **Hospital does not establish ER**: preserve Hospital and hold the treatment group for review until the visit type is verified; do not mark a partial mapping complete. NO TREATMENT combined with another option is a conflict. Verify multiselect encoding/delimiter; never split a raw answer heuristically. |
| `<<Custom4120>>` — currently represented by an attorney for this accident | **Preserve; no automatic `body.rep` mapping** | App asks whether they have already **signed anything** with another firm/attorney. Current representation is not identical to prior signing (including representation that ended). Preserve the source Yes/No as an important imported fact; review before filling `body.rep`. Never infer unhappiness or `Good case`. |
| `<<Custom4129>>` — injured in the accident? | **Preserve; no automatic pain-chip mapping** | Yes does not identify a pain region. No injury at the time is not an exact answer to the App's current-pain question, so do not silently select “Says they're fine.” Preserve boolean meaning and original; 4130 supplies injury detail. The source's “if no, DQ” instruction does not authorize an import disposition. |
| `<<Custom4134>>` — agent treatment-gap check with several conditions | **Preserve; block automatic `body.stretch`/gap polarity mapping** | The Yes/No radio follows a paragraph covering DOI-to-first-visit, last-visit-to-today, and intervening gaps. Yes might mean checks passed or a gap exists. The schema does not establish polarity or which condition was answered. Do not invert it, infer No gap, or alter the engine's rules. Import verified dates; flag this source answer for review. |
| `<<Custom4135>>` — health insurance | **Preserve; no existing matching MVA answer path** | It is neither willingness to treat nor auto coverage. Do not populate `body.willing`, `body.coverage`, `body.uim` or the insurer name from this answer. Source script prose is not a new ClaimReach treatment promise. |
| `<<Custom4136>>` — other driver's auto insurance | **Preserve; no existing matching boolean path** | Do not fill `body.coverage` (PNC's own full/liability coverage), `body.exchanged` (scene information exchange), or `file.carrier` (insurer name). This is an important source fact requiring a read-only imported-facts display or a separately approved new question—not a false match. |
| `<<Custom4138>>` — insurance/UM-UIM agent notes | **Preserve:** labeled source note, optional reviewed addition to `story.text` | Keep uncertainty and context visible. Do not parse the instruction “both no = DQ” as the claimant's answer or automatically disqualify. |
| `<<Custom4139>>` — at-fault government/emergency vehicle | **Preserve; no existing matching MVA path** | Do not map to police attending the scene, vehicle make/model, or silently apply the source DQ instruction. Surface as an imported qualification fact for review. |
| `<<Custom4143>>` — sending-agreement script with a textarea | **Preserve any actual entered note; no workflow mapping** | The script or note cannot establish sent/signed status, a completed agreement, consent, or delivery. |
| `<<Custom4119>>`, `<<Custom4142>>`, `<<Custom4144>>` — opening/transition/closing script rows | **Script only:** no answer destination | Builder has no input controls. Preserve form definition as reference; do not create answered flags, consent or send/delivery evidence from scripted text. |

The field editor displays an `NMW MVA : [question]` mapping prefix even while the inspected case type is INNO MVA (222) and the selected section is PRESIGN. That display prefix is not a campaign routing key. Bind the observed source tokens to the explicitly resolved firm/campaign/matter; do not create an NMW branch or reroute the record from that prefix.

### Contact identity rows: labels are not verified tokens

These eight observed cards display question text or truncated labels in the `token` slot. They are **not** verified template tokens or API keys. Do not send them as guessed payload fields:

| Builder card | Confirmed purpose | Candidate existing lead field, pending verified binding |
|---|---|---|
| `9422-0` | Full legal name | `leads.claimant_name` and carefully resolved first/last names |
| `9423-0` | Date of birth | `leads.dob` |
| `9424-0` | Mailing street | `leads.mail_addr1` |
| `9425-0` | Apartment/unit | `leads.mail_addr2`; preserve the unit |
| `9426-0` | Mailing city | `leads.mail_city` |
| `9427-0` | Mailing state | `leads.mail_state`; not accident state 4126 |
| `9428-0` | ZIP | `leads.mail_zip` |
| `9429-0` | Email | `leads.email` |

Existing basic LawRuler contact aliases may already populate these fields, but that does not verify the identity of these particular form rows. Preserve corrected names and existing contact data; show conflicts. Card IDs locate observed builder rows and must not be treated as undocumented backend field IDs.

### Questions absent from the verified PRESIGN form

There is no dedicated verified field for willingness to treat, missed work, PNC full-versus-liability coverage, information exchanged at the scene, police attendance/report number, insurer name, named treating providers, passenger identities, vehicle year/make/model, or attorney-unhappy/good-case follow-ups. Do not claim these can be imported automatically from PRESIGN, fetch them from excluded tabs, or mark them answered. Narrative may contain relevant detail, which can be proposed for review with its exact source excerpt.

Preserve nonmatching structured source facts visibly in one claim-scoped, read-only **Imported PRESIGN facts** section shared across all views. That is an import provenance display, not a second editable questionnaire. A new durable storage key/table for this ledger is proposed work, not an existing API contract. Keep the original question/token/raw value and any reviewed normalized meaning.

### Implementation priorities and blockers

1. **First transfer useful exact facts:** absolute accident date/location; driver/passenger role and its Other explanation; the two narratives without loss; injury detail; first/last treatment dates; exact matching treatment types; explicit UM/UIM and injury-payment answers. Two fault options have direct mappings; preserve the other two for review. This fills important existing fields before more speculative mappings.
2. **Verify transport values:** the observed `<<CustomNNNN>>` tokens need a reviewed no-send sample/export showing actual expansion and field-key names. Radio labels are known, but their encoded values are not. The label sets for 4121/4127 and multiselect 4131 are now verified, but the exported encodings remain unknown. The state selector 4126 still needs its value/label mapping. Hospital, same-vehicle-driver fault and Other fault require the explicit handling above.
3. **Resolve semantic mismatches explicitly:** keep 4134 gap polarity unresolved; retain attorney/current-representation, injury flag, health insurance, other-driver insurance and government-vehicle answers as their own imported facts. Do not manufacture equivalent App answers or silently amend the approved script.
4. **Recover contact field identifiers** before binding those eight rows. Preserve existing contact corrections and apartment/unit data.
5. **Protect concurrent edits and source history** using the protocol below. Applying only to the claim is insufficient while an old live-call snapshot can overwrite it.

Question choices/branches: `src/lib/mva-call/engine.ts:117,557,561,593,749,1260`. Exact path dictionary: `question-spine.ts:11`. Existing MVA choices are string enums; flags such as `done.pain`, `done.seen`, `justMe` remain real booleans. The LawRuler builder's required flags describe that source form; they must not rewrite ClaimReach's requiredness/visibility rules.

## Pre-fix baseline: why the old import did not accomplish this

- `normalizeLead` recognizes contact, incident, description and routing/status aliases (`src/lib/lead-ingest.ts:35`). It has no structured pain/treatment/insurance/representation mapping.
- `ingestLead` fills blank lead columns, creates a new claim without MVA answers, and retains raw keys under `leads.vendor_fields.sources.lawruler` (`lead-ingest.ts:208,260,288`). Each raw value is converted to text and capped at 4,000 characters; the source bag for a sender is replaced by its latest snapshot. This is not a complete versioned PRESIGN answer ledger.
- The MVA webhook calls that helper, records source status/signing provenance and stores originals; it does not map the intake CSV/PDF or supplied structured answers into `mva_call` (`src/app/api/webhooks/lawruler/route.ts:202,224,235`; `src/lib/lawruler-documents.ts:119`). Its configured `mapInbound` path occurs later on the Motel-specific branch, not this MVA branch.
- First-call bootstrap heuristically reads description for location/date/fault/no-lawyer only, and only when no saved answers exist on a single-matter file (`src/app/(calls)/app/[id]/page.tsx:109,135`; `src/lib/mva-call/lead-story.ts:118`). This is not a structured PRESIGN import and does not establish complete injury/treatment answers.
- Recovery preview/apply currently handles status and original-document provenance, not a question-level answer reconciliation (`src/app/api/webhooks/lawruler/status-sync/route.ts`).

## Safe import protocol

1. Bind a versioned PRESIGN-only field map to case type 222 / Presign Form header 7823 and the verified custom tokens; confirm actual transport encodings and unresolved contact identifiers before applying. Keep original question, raw answer, source record ID, form/tab, captured/source timestamp, import timestamp and content hash. Unknown, contradictory or unsupported values must remain visible—not silently dropped or coerced to No.
2. Resolve exact firm + campaign + LawRuler lead + ClaimReach claim before parsing/applying. Refuse ambiguous matter identity. Parse only PRESIGN sections from an export containing multiple tabs; preserve the original artifact separately.
3. Preview field-level **source / current / proposed / conflict**. Fill genuinely untouched blanks; preserve populated agent answers and deliberate clears. Existing records have no reliable per-field authorship, so a blank cannot always be presumed untouched. Require review for such cases. Importing data must not manufacture agent-confirmation, disposition, signature or completed-contract state.
4. Apply approved leaf/group changes using the expected revision and an idempotent source/mapping hash. City/state, accident date, treatment arrays/flags and passenger identity must merge coherently. Record every applied/skipped/conflicting decision. Keep contact-name corrections intact. No historical lead-created notifications, cadence enrollment or delivery.
5. Handle active sessions explicitly. Bootstrap prefers live `intake_calls.answers` over claim answers; `/api/calls/save` later replaces the entire `mva_call` snapshot (`app/[id]/page.tsx:109`; `api/calls/save/route.ts:109`). An import written only to the claim can therefore be invisible and then overwritten. Version/merge open-session saves or hold application until the live session is reconciled and refreshed. Never silently restart its place in the intake.
6. Do not reuse `/api/claim-intake` as a blind import shortcut: its merge is shallow at the top level and it may change new → contacting (`route.ts:31,54`). Do not reuse `/api/calls/save` either: it creates/touches a call and writes `last_called_at`. Historical answer import needs a dedicated no-side-effect path.

Acceptance: a synthetic PRESIGN payload fills each verified equivalent field identically in all four views, with the same conditional follow-ups; non-equivalent facts remain visible as source facts and unverified options/polarity remain held; export/delivery reads the same selected claim; replay is a no-op; agent edit/clear and concurrent session survive; unrelated tabs and sibling claims stay untouched; unknown values remain reviewable; no contact, send, status advance, signature fabrication or cadence enrollment occurs.
