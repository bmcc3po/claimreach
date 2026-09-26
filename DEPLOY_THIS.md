# ClaimReach deploy: clean look for the whole app + texts on Calls

Upload what's inside the claimreach folder of this zip to GitHub (Add file, Upload files, keep the folders), then Create pull request and Merge. Cloudflare deploys on its own. No database changes and no new env vars this time.

## What changes

The regular app (dashboard, leads, queue, files, settings, login) gets the same clean iPhone look as Calls: white grouped lists on light gray, hairlines, a light side menu, segmented switches, and statuses as a colored dot and word instead of pills. Dark mode is covered too. It is one new stylesheet, src/app/ios.css, loaded after globals.css. Deleting that file and its one import line in src/app/layout.tsx puts the old look back.

Calls home gets a Texts tab: every text that came in over the last three days, newest first. Tapping one opens the file with the texts up. A text from a number with no file opens New call with the number filled in.

The call screen gets a back arrow to Calls at the top left, and a red count on the text bubble when she texts while you're on the call.

Agents get Sign out on the Calls home (Full app only showed for them before, and it bounced them back).

## Files

    src/app/ios.css                         new, the clean look
    src/app/layout.tsx                      loads ios.css
    src/components/SideNav.tsx              logo drawn for the light side menu
    src/app/(calls)/calls/page.tsx          Texts tab data
    src/app/(calls)/calls/[id]/page.tsx     ?text=1 opens texts
    src/components/calls/CallsHome.tsx      Texts tab, Sign out for agents
    src/components/calls/CallConsole.tsx    unread count, open texts on arrival
    src/components/calls/CallView.tsx       back arrow, badge
    src/components/calls/calls.css          back arrow and badge styles
    src/lib/mva-call/engine.ts              unread count
