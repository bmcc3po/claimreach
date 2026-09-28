# ClaimReach deploy: Astra audit repairs

Everything in this zip was verified against the live database or the source before it was fixed, then rebuilt and clicked through. Upload it as one zip. Your steps after it deploys are at the bottom.

## Security (the audit's gate 1)

- Three database views (one carrying claimant names, phones and emails) were readable with the site's public key. **Already closed on the live database** while you were out, as migration 0100 Part A. Nothing in the app reads them from the browser, so nothing changed for users.
- A deactivated user could keep working until their login expired. Every permission check now treats an inactive account as signed out, and deactivate/reactivate report a failure instead of pretending it worked.
- The old SignWell webhook accepted unsigned posts and would flip a lead to signed from whatever JSON it was handed. It now treats a post as a nudge only: it looks the document up in DocuSeal-style fashion, re-reads it from SignWell with our stored key, and writes only what SignWell itself confirms.
- Exports of claimant data now require the Export leads permission. Owner, admin and manager have it by default. Agents do not, so an agent can no longer pull the whole book as CSV. If you want an agent exporting, give them the override on the Users screen.
- Send to firm is now internal staff only. A firm login can no longer trigger delivery of an arbitrary lead id.
- Migration 0100 **Part B** is written but NOT applied, because it changes write behavior: it blocks a user from editing their own role, firm, active flag or permissions, and blocks a case document from being relabeled onto another case's lead or claim. Read `supabase/migrations/0100_audit_hardening.sql` and run Part B when you're comfortable.

## One durable case record (gate 2)

- Saving the intake now merges into what's already saved instead of replacing it, so a save from one screen can never delete answers captured on another.
- The three gate questions were being stripped out of every All-sections save. That's why 58/58 answered reopened as 3 questions left, and why the audit log showed a saved safety answer being deleted. They save like every other question now.
- Switching Guided to All sections (or back) used to remount stale answers from the page load. Both surfaces now share one live copy.
- Changing tabs within a second of typing used to drop the last edit. The pending save now flushes when you leave.
- An empty property row no longer marks the Properties section complete: every added property has to be identified and answered.
- Creating a lead now stamps the campaign name on the file and creates its claim row, so the list stops warning "No campaign" on files that have one.
- Signing now moves the pipeline stage to Intake Complete, and a successful firm delivery moves it to Sent to Firm, so My Queue stops calling a signed file "Referral Received". Reports now count every Signed status, not just plain "signed".
- eSign dates are stamped with the office calendar date (Central), not the UTC date, so an evening signature stops landing on tomorrow.
- Opening a Motel or any non-MVA file in the call console read the agent the car-wreck script. Those files now route to their own case page.

## DocuSeal chain (gate 3)

- A completed agreement whose signed PDF failed to download used to be stuck forever with no file. It now retries on every later look until the PDF and certificate are stored, and logs the recovery to the file.
- Multi-document packets now store every PDF, not just the first.
- Firm delivery now attaches the DocuSeal signed PDF and signing certificate (it only read the old SignWell store before), and a delivery configured to carry the retainer refuses to email at all if no signed retainer is stored, instead of sending the firm an empty packet.
- Leave it for QA is a pause now, not a wall: the parked screen has "Reopen and finish it now" in every view.
- Integrations, eSign now documents DocuSeal as the active system with the exact webhook URL, and marks SignWell as legacy.

## DOB and SSN (your note)

- Date of birth types itself into MM/DD/YYYY, rejects fake and future dates, and reads back what it heard ("Reads as Oct 26, 1977").
- SSN is all 9 digits with the dashes placed for you, or "Last 4 only", which shows a fixed XXX-XX- in front of a 4-digit box and confirms "Prints on the HIPAA pages as XXX-XX-4486".
- Each campaign has a "require all 9" switch (campaigns.ssn_require_full, already added). Turn it on and the last-4 choice disappears, with the server enforcing it from every screen. It's off everywhere today.

## Your steps after the upload deploys

1. **DocuSeal webhook is still failing.** The Event Log shows docuseal.rejected 401 every few minutes: DocuSeal is calling ClaimReach without the right key, so signatures only land while an agent's screen is open. In DocuSeal (test mode OFF), set the webhook URL to `https://claimreach.com/api/esign/docuseal?key=` followed by your DOCUSEAL_WEBHOOK_SECRET from Cloudflare, and tick form.viewed, form.completed, form.declined, submission.completed.
2. **Your 6 PM test signing went through DocuSeal's TEST account.** The live key wasn't in use at deploy time. If you added it after 5:48 PM, retry the latest deployment in Cloudflare so it takes, then send one more test.
3. **Run migration 0100 Part B** (in RUN_THESE_MIGRATIONS.sql) after reading it.
4. Motel and the other case types still sign through the legacy path. Making DocuSeal carry them needs each case type's retainer PDFs and field positions, like we did for TMP MVA. Send me the Motel packet PDFs and I'll build it.

## Not done yet, on purpose

- The audit's UI consolidation (one shell for CRM, calls and the board; Contact Info and Case Details redesign) is the next block of work, after you review these repairs.
- The audit's access-matrix question ("which internal roles see which firms' files") is a policy decision for you, not a bug: today all internal roles see all firms by design.
