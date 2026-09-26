# ClaimReach deploy: the calm site

Upload this zip to the repo root on github.com (Add file, Upload files), let it make a branch and pull request, wait about a minute for the "Unzip upload" check, then merge. No database changes to run.

## What changes

One look across the whole site. One typeface everywhere (Geist, served from ClaimReach itself, nothing from Google), crisp 1px lines that hold up on a PC screen, color only when it means something.

The side menu is navy with the everyday work at the top (Home, Leads, Signed, My queue, QA queue). Calls, AI tools and Admin are sections that fold when you click their heading; More (Reports, Delivery Board, Grievous) starts folded. The button left of the page name shrinks the menu to icons. Your name at the bottom opens Profile, Dark mode, Open the App and Sign out. The top bar has search for any lead (Ctrl K), New call, and notifications.

Home answers five things: Needs you (every file past a deadline, worst first), Slipping (waiting 2+ days for a first call, high tier still open, qualified and waiting on the firm; click a line to open it), Just moved, new leads over the last 14 days, and the team boards. The four numbers across the top link to their lists. Days follow Central time.

Leads (and Signed) is one clean table: name and phone, case and what she said, status with any clock under it, lead number, state, when it last moved. Tabs across the top split by where files are (All, Needs action, Intake, In QA, Approved and firm, Closed). Everything else is behind Filters, and each filter in use shows as a line you can click off. Select files and a bar comes up at the bottom for status, stage, assign, firm and archive. Board and Timeline are still one click away.

The App on a computer uses the whole screen. A navy rail on the left (Home, Calls, Leads, Signed, My queue), the top bar with search and New call. When the call has room it splits: caller, qualifiers and call steps down the left, the question in the middle, CarCure on the right. With a wide CarCure panel the rebuttal groups get an index down its left side that follows you as you scroll, and every group folds. The App home list is full width and New call opens as a centered box. The phone layout does not change. The split between the call and the panel starts fresh at the new default; drag it and it remembers again.

## Files

    public/fonts/ (new: Geist and Geist Mono, open font license)
    src/app/clean.css (new), src/app/layout.tsx
    src/components/SideNav.tsx, NotifyBell.tsx, ui/Icon.tsx
    src/app/(internal)/layout.tsx, src/app/(firm)/portal/layout.tsx
    src/app/(internal)/dashboard/page.tsx, src/components/home/HomeView.tsx (new)
    src/components/LeadsView.tsx, src/lib/case-name.ts (new), src/lib/statuses.ts
    src/components/calls/calls.css, CallConsole.tsx, DeskPanel.tsx, DeskChrome.tsx, CallsHome.tsx
    src/app/(calls)/layout.tsx
