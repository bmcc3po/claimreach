# ClaimReach deploy: Astra audit repairs, round 2

One zip, on top of what's live. It contains everything from the first repair round plus the fixes from Astra's review of that round. Your steps are at the bottom.

## What Astra's review got right, now fixed

- **The 0100 Part B trigger really was broken.** Inside a SECURITY DEFINER function, current_user is the function's owner, so my privileged-role exemption fired for everyone and the guard checked nothing. It was never applied, so nothing was ever protected wrongly. The corrected version is migration 0102: it runs as the real caller, and it also blocks self-service INSERT and DELETE on accounts, not just role edits. The old Part B text is marked superseded everywhere.
- **Deactivation now dies at the database too.** 0102 rewrites the RLS helper functions so active=false means no rows through the Data API, even with a still-valid login token. The app-level check shipped last round. A failed auth-level ban now comes back as a visible warning instead of silence.
- **Exports are internal staff only**, on top of the Export leads permission, so a firm login given an export override can never pull other firms' files.
- **Document rows are bound to their stored file.** 0102's case_documents check now also verifies the storage path itself belongs to that firm and lead, not just the labels.
- **Signed-file recovery now actually runs.** The screen's status check reaches completed agreements too, a missing certificate retries the same as a missing PDF, and the file's history says plainly when the copy has NOT stored yet instead of "Signed copy stored".
- **Deliveries carry the whole packet.** Extra signed PDFs are found by their stored names and attached, and the no-retainer refusal now holds even on a forced resend. Force only skips the already-sent guard.
- **Saves are ordered.** A save only lands on the version of the file it merged against; a save from another screen re-reads and re-merges instead of overwriting. Overlapping property saves converge to one set instead of doubling. Contact Info and Case Details flush their pending save when you switch tabs, same as the intake screens. Guided's "Intake complete" screen waits for the save to land and stays put with the error if it fails.
- **Property completeness follows the real tier rules** on both surfaces: first four Motel 6 properties take the full battery, a 5th+ Motel 6 is name-only, non-Motel-6 takes the abbreviated set. The counter and the section badges use the same rules.
- **"Open the file" after a dispo goes to the classic case page** (it was bouncing straight back to the call). "Full site" from a call file now opens that file, not the dashboard.
- **The moving incident date is fixed at the root.** "Today" and "Yesterday" now save as the actual calendar date, so a file reopened tomorrow keeps the real crash day.
- **Lead creation can't half-succeed.** If the claim row fails twice, the half-made lead is archived and the screen says to add it again. Case type must match the campaign.
- **The Signed report number uses the status table's own definition** of a signed status (covers custom statuses like Delivered/Retained), not a name prefix.
- **SSN last-4 mode survives a remount**, and an unreadable campaign SSN rule now fails closed with "try again" instead of quietly acting like the rule is off.

## What Astra flagged that stays open, and why

- **DocuSeal for Motel and the other case types.** Still needs each case type's retainer PDFs and field positions from you, same as we built for TMP MVA. That is the one launch gate I cannot build from here.
- **One shell for CRM, calls and the board; Contact Info and Case Details redesign.** Next block, after you review this round. You also have unsent notes on the ending flow.
- **Cross-role negative tests, an outage drill, a backup restore drill.** Operational; needs you present.
- **Grievous "wrote a result while displaying a false failure".** Still not reproduced from the code; needs your screen.

## Your steps after the upload deploys

1. Fix the DocuSeal webhook (still rejecting with 401 every few minutes): in DocuSeal with test mode OFF, set the webhook URL to `https://claimreach.com/api/esign/docuseal?key=` plus your DOCUSEAL_WEBHOOK_SECRET, and tick form.viewed, form.completed, form.declined, submission.completed.
2. If you added the live DOCUSEAL_API_KEY after 5:48 PM, retry the latest Cloudflare deployment, then send one test agreement. I'll confirm it hit the live account.
3. Run migration **0101 Part B** and migration **0102** from RUN_THESE_MIGRATIONS.sql (bottom of the file). Do NOT run the old 0100 Part B block; it's marked superseded in the file.
4. Supabase dashboard, Auth: turn on leaked-password protection (one toggle, no SQL).
5. Send me the Motel retainer packet PDFs and I'll build Motel on DocuSeal.

## Already live (applied directly, disclosed as it happened)

The three exposed views are locked to the server. Signed-out visitors can no longer execute any privileged database function. campaigns.ssn_require_full exists and defaults to off.
