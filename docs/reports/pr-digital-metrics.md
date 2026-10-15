# PR Digital INNO MVA reporting

The existing password-protected `/pr-digital` report now has received-date cohorts, six summary metrics, exclusive post-signing groups, weekly/state breakdowns, sortable details, received/signed-date list filters, multiple statuses, state, uncalled-only and filtered CSV export.

Report data still comes through the existing firm/campaign/source approval projection. No account, password, grants, RLS, campaign scope, signature, delivery or claimant status is changed. Extra evidence reads use the existing approved source set. Lead-level calls and unscoped notes are withheld when a lead has multiple matters; exact claim notes remain eligible. Self, plaintiff and case notes are not projected; the Notes column uses the latest file/call note or matching call-log comment.

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
