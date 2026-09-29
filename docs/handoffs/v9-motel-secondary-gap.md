# Motel secondary intake in /app — gap review

Read-only source review, September 28, 2026. Sources: current `work/claimreach-v9` and captured LawRuler `work/lawruler-motel-secondary-field-definitions.json`, TMP Motel Traffic → LONG FORM SECONDARY, header 7666. No application edits, customer reads, sends, portal actions or production changes. Published database forms and runtime permissions were not queried; a published campaign form can override the built-in form described below.

**The current `/app` cannot conduct this secondary interview.** A reusable classic Motel questionnaire and property editor exist, but agents are redirected to the CRM, its wording is not an exact copy of the captured LawRuler form, and its completion paths do not consistently mean “secondary interview finished, no signing.”

## Highest-impact work

1. **Provide a real Motel secondary entry inside `/app` before closing staff access to the CRM.** Show eligible, exact TMP Motel matters as a separate secondary work list. Open the existing matter; do not create another acquisition lead or send a retainer. Preserve the same App shell, contact editing, draft, property selection and return-to-list behavior.
2. **Build one versioned secondary question definition from the verified source.** Preserve exact questions, scripts, order and source tokens. Do not relabel the existing built-in questionnaire “LawRuler secondary” or generate it with AI: material differences are documented below. Keep existing answer IDs through an explicit crosswalk where meaning really matches.
3. **Give both presentations the same no-signing finish contract.** Save all answers and properties successfully first, then record secondary completion/internal review independently of signature or firm delivery. A failed save must prevent completion. Callback and incomplete work must remain resumable.
4. **Finish source metadata verification before enabling the new interview.** The capture has 125 entries: **108 rows with input controls and 17 script/label rows**. Seventy-one rows contain checkbox/radio controls, but **no option labels or stored values were captured**. Only 13 rows have `required=true`, despite an opening instruction saying all fields are required. These are not 125 validated questions ready to run.

## Existing entry paths and reusable pieces

| Path / component | Current behavior | Required change for secondary App use |
|---|---|---|
| `src/lib/mva-call/links.ts:20`; `(calls)/app/page.tsx:25,80` | `APP_KINDS` contains MVA only. Open list selects new/contacting acquisition matters. | Add a campaign-scoped secondary work type/list with its own eligibility, including retained cases needing the interview. Merely adding a case-type string will not create this workflow. |
| `(calls)/app/[id]/page.tsx:63` | Non-MVA matters redirect to `/leads/[key]?claim=…`. | Dispatch the explicitly selected Motel matter to a secondary screen under `/app`, preserving lead + claim identity. Never use the MVA question engine for this interview. |
| `(internal)/leads/[id]/page.tsx:103`; `LeadWorkspace.tsx:219` | Case Questions mounts `IntakeSurface` with selected claim answers, properties and resolved campaign fields. | Reuse the field renderer/property machinery through an App host rather than exposing all CRM tabs. |
| `(internal)/intake/[id]/page.tsx:18–29,51,70` | Standalone classic intake selects **the oldest claim**, creates a claim when none exists, and ignores a selected `?claim` parameter. | Do not redirect App agents here. Resolve an exact existing matter and refuse ambiguity; a secondary interview must not create an unrelated enrollment. |
| `IntakeConsole.tsx:208` | Older new-call console sends Motel leads to `/intake/[id]`. | Retire that detour for this secondary entry; it is an acquisition path, not safe reopening of a retained matter. |
| `IntakeSurface.tsx:42–108` | Guided + permission-gated All sections share an in-memory answer/property snapshot. Exit goes to `/leads/[id]`. | Keep one answer source and campaign definition; supply an App return route with claim identity. New App work must not depend on CRM access. |
| `forms.ts:6–45` | Campaign-published form → case-type published master → built-in fallback. | Resolve the exact campaign/version deliberately and show “secondary setup incomplete” if the verified secondary definition is unavailable. Do not silently fall back to a different questionnaire. |

The ClaimReach `/m6/questionnaire` route redirects to `/m6/pfs` (`(m6)/m6/questionnaire/page.tsx:7`); it is not this App interview. Leave firm/retention portal workflows separate. No external post-retainer application was inspected.

## Concrete content and behavior gaps

These findings compare the captured source to the **built-in** `src/lib/questionnaire.ts`, not to an uninspected live published form.

| Source evidence | Current built-in difference / risk |
|---|---|
| `Custom2617` complete opening/reassurance script | `script_intro`/`script_reassure` at lines 88–102 shorten/rephrase and split it. Preserve source wording before calling the result verbatim. |
| `Custom2492` includes “If no end intake” | `g_at_hotel` at 110–117 expressly instructs **DO NOT end the call** because callers are retained. This is a policy conflict, not a cosmetic difference; owner must resolve it. Do not execute imported DQ/end instructions automatically. |
| `Custom2493` self versus another person; confirm POA/NOK | Current contact-only `caller_type` and separate `poa_nok_confirmed` do not reproduce the source prompt in its original position. |
| `Custom2499`, `Custom3741` room/floor question and separate room-location narrative | Current `room_floor` at 171 combines these into one text answer. A reviewed crosswalk must retain both originals. |
| `Custom4017` first incident date; `Custom4018` final incident date | Current `stay_month` at 169 is one approximate month/year, not a date range. No corresponding separate built-in start/end fields were found. |
| `Custom2618` Summary; `Custom4024` gender; `Custom2583` police investigation; `Custom2584` prostitution-related arrest; `Custom4097` social handles | No dedicated equivalents found in the built-in Motel definition. Property police/EMT attendance is not a police investigation. Do not drop these or repurpose a nearby answer. |
| `Custom2538` meeting method is a choice control; `Custom2586` social-media evidence is text | Current `met_how` at 216 is free text; `has_social_media` at 254 is boolean. Control/answer semantics differ; unknown choices cannot be reconstructed from those App fields. |
| `Custom2606` emergency contact full name; `2607–2611` relationship/contact/safe message | Current name/phone/relationship fields live on Contact Info and use split names (`153–158`); `ec_email`, `ec_may_leave_msg` and `ec_message_script` are intake fields. Restore the source sequence without guessing name splits or confusing safe-message permission with permission to discuss the case. |
| `Custom4019–4023` identified property name/street/city/state/ZIP | Preserve these as the exact property's resolved data, separately from claimant recollection and home address. Current property loop can retain structured data, but raw source tokens are not automatically mapped to it. |

Source order also differs: LawRuler puts legal history before control/recruitment, while the built-in places legal history much later. `GuidedIntake.tsx:126–154` injects a separate property loop after `g_can_identify`, skips property fields in their original section positions and can inject built-in property questions when a form lacks them. Its `motel-properties.ts` loop asks full questions for four G6 properties, name-only for later G6 properties and abbreviated questions for non-G6 properties. That existing policy must be reconciled explicitly with the captured single-property secondary form; it cannot be assumed source-equivalent.

## Persistence and completion

- **Answers:** `GuidedIntake.tsx:203–245` autosaves to `/api/claim-intake`; `ClaimIntake.tsx:264–298` uses the same endpoint. Logical “lead-scope” questionnaire answers are stored in the selected **`claims.answers`**, not automatically in canonical `leads` contact columns.
- **Properties:** the same endpoint stores repeatable data in `claim_properties`, with known columns plus `custom` for imported form fields. It invokes `replace_claim_properties` (`api/claim-intake/route.ts:77–129`), which requires the existing property replacement migration. Answer save and property replacement are separate operations; an answer save may succeed before a property error. Completion must verify the whole result.
- **Concurrency:** classic answer save shallow-merges a submitted answer bag and retries against `updated_at` (`route.ts:39–72`). It is not the new MVA leaf-delta protocol; stale whole-form answers can still overwrite a concurrent edit to the same keys. Secondary sessions need an expected baseline/revision and a persisted current question/property, not a fresh `idx=0` on every open (`GuidedIntake.tsx:60`).
- **Guided finish:** waits for a successful save, then sets local `finished=true` and displays “Intake complete” (`GuidedIntake.tsx:283–309`). It does not persist a secondary-complete status/review timestamp.
- **All-sections finish:** offers “Signed the retainer,” e-sign, transfer and other generic outcomes (`ClaimIntake.tsx:479–518`). Worse, `finishWithStatus` awaits `save(false)` at 242, but `save` catches an error at 297 without returning failure; status submission can proceed after an unsuccessful save. Do not reuse this finish action unchanged.
- **Existing LawRuler status mapping is different:** `lawruler-status.ts:18–25` maps secondary OK complete → `approved`, OK sent → `delivered`, and DQ sent → `dq_billable`. These are historical/source workflow meanings. An agent finishing questions inside ClaimReach must not be marked signed or delivered. The source closing says the next step is internal review. Define an explicit secondary completion → review → separately acknowledged delivery path through the existing status setter, with no silent new status vocabulary or billing event.

For this secondary mode, no agreement selector, send, re-sign, emergency signing or signing prerequisite should appear. Preserve existing retained documents read-only. This mode-specific rule must not remove the user-required primary DocuSeal/emergency signing capabilities from campaigns that need acquisition signing.

## Metadata and access decisions still needed

- Capture exact option **labels, stored values, single/multiple selection, exclusive choices and Other follow-ups** for the 71 choice-bearing rows. Priority: hotel/self/identify gates (`2492–2494`), dates/duration/minor (`2503,2505`), gender (`4024`), legal history (`2507–2515`), control/recruitment, hotel knowledge, emergency relationship/message and safe channels (`2607,2610,2611,2615,2616`). The two generic checkbox controls in the capture do not establish two real options. Do not invent Yes/No for every checkbox.
- Capture conditional visibility and requiredness separately from wording. The capture contains no condition definitions; opening prose promises the caller may pause/skip, while “all required” and field flags differ. Preserve “unknown,” “declined” and “not applicable” distinctly where approved; do not force a false answer just to complete the form.
- Temporary CRM cleanup policy is **not implemented in the reviewed layout**: `(internal)/layout.tsx:15–22` redirects firm users but permits internal roles. The intended restriction is Brett's verified active owner identity, not every `owner` and not just a hidden menu. Build the secondary App entry before enabling it.
- **Tony remains an admin who also works intake.** Keep his existing role, overrides and firm assignment. Eligibility should use the existing internal-role/intake capability model; never rewrite him to `agent` or restrict the new screen to `role === 'agent'`. Other authorized admins/managers can work App intake while the separate temporary page policy keeps staff CRM owner-only. Shared intake APIs must keep exact tenant/matter authorization; a page gate is not an API permission boundary.
- Leave public signing/auth/provider callbacks and eligible firm `/portal`/`/m6` access intact. No new permission or account change is proposed by this read-only review.

**Acceptance before enabling:** source-definition snapshot comparison (including scripts and choice labels); exact claim/property scope; no accidental MVA questions/signing controls; correct safety/callback behavior; multi-property reopen and current-position recovery; concurrent save conflict handling; failed answer/property save prevents finish; finish never fabricates signature/delivery; Tony retains privileges; non-owner staff can complete everything inside `/app` while direct staff CRM navigation is blocked by the separately approved policy.
