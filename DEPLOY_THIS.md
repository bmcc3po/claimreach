# ClaimReach deploy: the wide App, INNO MVA, attorney pick, dialer, slidable split, Motel 6 status sync, lead links, text box

Upload this zip to the repo root on github.com (Add file, Upload files), let it make a branch and pull request, wait about a minute for the "Unzip upload" check, then merge. No database changes to run. This one includes everything in claimreach_links_and_textbox.zip and claimreach_textbox_fix.zip; skip those.

## What changes

The App on a computer is the full workspace. A bar across the top has Home, search any lead (Ctrl K), New call and Full site. The right side has CarCure (with a jump bar across the top for every rebuttal group and line set, plus Ask CaseCure), Texts, Phone (the JustCall dialer), Retainer (live preview), File (status, agreements with the signed copy, notes you can add, documents, history, and what the marketer sent) and Tools (deadline check for any state and date, her local time, which agreement she gets, the split if she insists). Opening an INNO MVA file on the desktop site goes straight here; the classic page is still one click away from the File tab.

INNO MVA. New call asks "What kind of call?" (INNO MVA) and "Attorney" (Turnbull Moak & Pendergrass is the only one today). The call's Send step shows the attorney above the agreement. On the desktop site, an INNO MVA file shows its attorney in the header, and Case Questions shows what was answered in the App (the old 28-question form is not used for these files), with Open in the App.

Dialer. On a desktop, the call screen's right side has a Phone tab with JustCall's own dialer inside it. Sign in to JustCall once. Call her back with one tap; firm lines for a 3-way are listed with Copy. The dialer stays loaded while you switch tabs; Pop out opens it in its own window for long calls. On the phone, the text sheet has a Call section: Call in JustCall, Copy number.

Slidable split. Drag the bar between the call and the panel to resize. It remembers per computer; double-click puts it back.

Motel 6 secondaries. When the LawRuler Motel 6 hook fires, the ClaimReach file now follows LawRuler: Secondary OK Sent To Firm sets Delivered to Firm, Secondary Intake OK COMPLETE sets Approved, Secondary DQ Sent to Firm sets DQ Billable. The LOR turns ready on LawRuler's real wording. Delivered to Firm now counts as billable. Auto firm email stays off for the Motel 6 campaign, so nothing is emailed to TMP. After merging, open claimreach.com/api/webhooks/lawruler/status-sync once while signed in to bring the files LawRuler already sent up to date.

Lead links by lead number on the desktop site and the App: /leads/TMP-1042, /app/TMP-1042, /leads/lr/<LawRuler ID>, /app/lr/<LawRuler ID>. Old links still work.

The App's text box stays white with dark text in dark mode, and the text sheet fits above the keyboard with the newest texts in view.

## Files

    src/lib/lawruler-status.ts (new), src/app/api/webhooks/lawruler/route.ts, status-sync/route.ts (new)
    src/lib/m6.ts (LOR wording), src/lib/statuses.ts (Delivered billable)
    src/components/calls/JustCallDialer.tsx (new), DeskPanel.tsx, CallConsole.tsx, CallView.tsx, CallsHome.tsx, calls.css
    src/lib/mva-call/links.ts, src/app/(calls)/app/[id]/page.tsx
    src/components/LeadWorkspace.tsx, src/app/(internal)/leads/[id]/page.tsx
    src/lib/lead-key.ts (new), src/components/CanonicalUrl.tsx (new), src/app/(internal)/leads/lr/[leadid]/page.tsx (new)
    src/components/calls/KeyboardFit.tsx (new), src/app/(calls)/layout.tsx
    plus the smaller files listed in git
