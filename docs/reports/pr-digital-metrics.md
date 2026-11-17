# PR Digital INNO MVA reporting

## Call-history portal update — November 11, 2026

The client list now opens an individual contact history with provider call times, direction, result and recorded duration. The summary shows outbound attempts, leads with linked outbound attempts, inbound calls and response-time coverage. CSV retains the complete detail columns and adds call counts and first/latest outbound timestamps.

Outbound attempts are linked outbound provider records, deduplicated by provider plus call identifier (or row ID). Inbound calls are separate. Manual call logs are displayed separately, not added to provider totals, because they can describe the same call. Manual log timestamps are labeled as logging time and cannot establish response time. Unknown results are not inferred from duration; provider Answered does not establish a completed intake.

Response time requires an original receipt timestamp and an outbound call/first-dial timestamp. Inbound calls no longer establish outreach response time. Date-only source receipts remain date-only. Missing or conflicting evidence gets an explicit reason. Read-only production inspection found 194 nonarchived source-approved leads, 1,284 linked provider call/voicemail records, zero manual logs, and no populated lawruler_created_at values. These are source inventory counts, not guaranteed public report totals: the existing signature, test-file and matter eligibility filters still apply.

The existing firm/campaign/source allowlist and authentication gates are unchanged. Call histories use the same sole-matter restriction as the prior report. No raw activity metadata, recordings, transcripts, provider IDs or credentials are projected. Existing scoped notes and last-activity timestamps remain available. No schema changes or production writes are required.

Validation: 41 focused tests pass, plus intake engine 78 and MVA engine 71. Desktop 1440px and mobile 390px synthetic browser checks verify opening histories without console errors or horizontal page overflow. Production packaging and signed-in live acceptance must be recorded separately; a fixture preview does not prove live authentication.

The existing password-protected `/pr-digital` report now has received-date cohorts, six summary metrics, exclusive post-signing groups, weekly/state breakdowns, sortable details, received/signed-date list filters, multiple statuses, state, uncalled-only and filtered CSV export.

Report data still comes through the existing firm/campaign/source approval projection. No account, password, grants, RLS, campaign scope, signature, delivery or claimant status is changed. An owner-only preview endpoint authenticates the active owner through the existing gate, then uses the exact same active report access configuration and projection. It cannot accept a caller-supplied scope or issue a partner session cookie. Extra evidence reads use the existing approved source set. Lead-level calls and unscoped notes are withheld when a lead has multiple matters; exact claim notes remain eligible. Self, plaintiff and case notes are not projected; the Notes column uses the latest file/call note or matching call-log comment.

Definitions:

- In progress: unsigned New, Contacting or e-Sign Sent. Call evidence changes only the report's unsigned New display to Contacting.
- Lost: unsigned DQ (including source DQ requiring a reason) or Not Interested. Other terminal states and signatures needing verification remain visible by current status.
- Signed: the existing signature evidence report, including signed files subsequently declined.
- Post-signing: declined first, then confirmed delivery/owner confirmation, then awaiting delivery. These partition Signed.
- Speed: verified source receipt timestamp to first recorded call/first-dial stamp, using the existing speed helper. A manual call-log creation timestamp is not a verified call start. Calendar-only receipt dates do not produce speed values. The average shows its sample coverage.
- Call duration: summed recorded communication duration, not verified conversation-only time. Existing ingestion may include ring time; the UI explicitly labels this limitation. No missing call history is invented.
- State: client mailing state. Last activity uses scoped communication, note, activity, signature, delivery and decision evidence.
- All date ranges use Pacific calendar days and inclusive end dates. Last 7/30 days include today. Weekly cohorts start Monday. Unknown receipt dates remain in all-time and appear in a Not recorded group.
- CSV uses precisely the currently filtered/sorted client rows and protects formula-like values, quotes and line breaks.

Validation: TypeScript passed; 16 report/filter/evidence regression tests, signature and partner isolation tests passed; MVA engine 71 and intake engine 78 passed. The report tests include wrong-firm/sibling evidence, partial-read failure, exclusive decline totals, DST date boundaries, sorting and CSV injection protection. Browser-based desktop/mobile verification was unavailable in this session.

Owner toggle: Reports (`/reports?area=mva`) offers View as PR Digital only for the active owner. The original ReportsView component and its data calculations are unchanged, and remain mounted while previewing so returning preserves its filters. The public partner API and password authentication are unchanged. Three additional tests verify owner authentication, inactive/non-owner denial before privileged reads, exact source-scope parity, no writes/cookies, disabled access and read failures. Both report views and the owner toggle passed synthetic React rendering checks.
