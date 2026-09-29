# LawRuler → ClaimReach: current sync handoff

September 28, 2026. Replaces the earlier investigation plan. Local code is implemented; deployment, a live source replay, and native attachment compatibility remain unverified. No customer messages, signature requests, status backfill, or production schema changes were made during this sync build.

## Verified in LawRuler

- Authenticated browser access works. The MVA webhook currently has **all statuses selected**, case type **INNO MVA**, and POST to https://claimreach.com/api/webhooks/lawruler.
- Selected document categories: Communications - Client, Intake, Signed Contracts. Categories alone do not prove usable PDF bytes or a completed agreement.
- The current 13 body mappings include LeadID, CaseType, Status, contact/routing fields, Description, and DOI. They do **not** include custom PRESIGN answers yet.
- The active source is **Presign Form**, case type 222, header 7823. Post Sign, DNU and MVA GUIDE were excluded as Brett instructed.
- Source has 26 custom rows and eight contact rows; scripts count as rows, not answered questions. Driver/passenger, fault and treatment choices were inspected without saving editor changes.
- Earlier production logs showed New Lead payloads, with some authentication failures before later successful imports. This build has not established a live Signed/DQ or original-retainer round trip.

## Implemented locally

1. **Exact-matter status reconciliation.** Live INNO MVA messages use existing active alias/status definitions and the central compare-and-set setter. Imported statuses do not trigger signing, firm delivery, notification fanout or acquisition enrollment.
2. **Stop duplicate chasing.** Signed/closed/DNC mappings stop acquisition on that matter. DQ without a valid standardized reason creates a persistent hold and visible review need. App callbacks, Dial Queue, due-drip preview and dispatch honor holds while preserving eligible siblings. My Work/history retains signed files.
3. **Conservative replays.** Unsequenced reopen/backward/conflicting terminal updates require review. Receipt time is not source order. Unknown aliases are not guessed. Sticky holds have no automatic release; this package has no hold-release UI.
4. **PRESIGN answers.** Explicit source fields map into the shared MVA answer document. Only genuinely absent leaves are filled. Existing values, false, empty arrays, deliberate clears and unrelated fields survive. Semantic mismatches remain visible source facts. Historical resends are staged for review.
5. **Open-call protection.** App saves send answer deltas and compare revisions. Concurrent edits to the same answer return a visible conflict; different edits merge. Metadata and in-flight typing survive. Older calls without a canonical baseline are staged until opened and saved.
6. **Independent documents.** Missing/unsupported originals no longer prevent status reconciliation. Verified bytes are filed on the exact firm/lead/matter with content-hash duplicate protection. Storage/index failures return a retry response; malformed files and remote links remain pending review. Completed originals in a partial batch are reported.
7. **Visible results.** File and Documents & signing show source status, holds, missing originals, failed imports, answer counts and source question/answer facts. Applied-answer provenance retains the raw source values that populated each leaf across later corrected resends.

No new database migration was added in this increment. The full ZIP retains prior v9 migrations 0110/0111; their presence is not proof the deployed database has them. Keep drips OFF.

## LawRuler setup after the matching deployment

Keep the existing secret header and INNO MVA case-type filter. Do not expose the secret in chat, documents or screenshots.

Add Body rows with keys **Custom4120 through Custom4141, plus Custom4143**, mapped using LawRuler's actual field picker to the corresponding PRESIGN fields. The accompanying PRESIGN answer map lists each verified token and question. Script-only rows 4119, 4142 and 4144 do not supply answers. Do not type guessed custom placeholder syntax or select similarly named Post Sign fields.

Template expansion and actual value encoding need a controlled sample. The importer accepts verified labels, two-letter/full state names, strict dates, explicit treatment arrays or one exact treatment label. Unresolved placeholders are ignored or held for review; numeric option IDs and ambiguous comma-separated multiselect values are not guessed.

Existing FirstName/LastName/Phone/Email mappings remain. The eight contact cards do not establish custom API tokens. Corrected populated contact fields are preserved; a Full Name is not split into assumed first/last names.

## Deployed acceptance still required

1. Deploy matching source and verify required existing schema. Confirm field mappings and authentication with a controlled record.
2. Observe one Signed and one DQ source event. Verify exact claim, source result, stopped acquisition, unchanged sibling, and no new signing/notification/delivery.
3. Verify actual PRESIGN encodings and phone/desktop display. Test importing while a different answer is edited in an open call, and test a same-answer conflict.
4. Observe an actual original-document payload. Supported: original PDF/CSV bytes, eight files maximum, 8 MiB per file, 20 MiB per request. Filename must identify the source lead or have a matching manifest. Remote URLs are not downloaded. Native LawRuler attachment compatibility is unproven.
5. Recover today's missed records through reviewed backfill. Use **recovery_mode=historical** for historical source/original resends and separately preview/apply reviewed statuses. A trigger change does not replay past events.

Imported Signed is a source report, not fabricated DocuSeal evidence or permission to bypass packet readiness. Originals, source signing dates and verified signatures remain separate. Historical-evidence delivery policy is unchanged.

## Next build

All agent case types will use the App/CR Desk shell. Motel 6 uses **LONG FORM SECONDARY**, completes as a secondary intake, and needs no new signature. The actual 125-entry source form has been captured; that includes scripts/labels.

Management cleanup and access decisions follow separately. Tony retains agent capabilities. No live access changes, cadence activation, account creation, time tracking or work in the other post-retainer portals is included.

## Official references

- [LawRuler webhooks and document categories](https://support.lawruler.com/hc/en-us/articles/35123928463507-Supercharge-Your-Legal-CRM-with-the-Powerful-Webhooks-Integration)
- [LawRuler API guide](https://support.lawruler.com/hc/en-us/articles/360042382314-The-Legal-CRM-API-Guide)
- [LawRuler custom intake forms](https://support.lawruler.com/hc/en-us/articles/235635348-Setting-Up-Customizing-Intake-Case-Forms-Conditional-Logic)
