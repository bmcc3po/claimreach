# ClaimReach deploy: the App (/app), desktop call screen, marketer leads, speed

From the iPhone: upload this zip to the repo root on github.com (Add file, Upload files), let it make a new branch and pull request, wait about a minute for the "Unzip upload" check to finish, then merge the pull request in the GitHub app. Cloudflare deploys on its own.

Run migration 0098 in the Supabase SQL editor (supabase/migrations/0098_speed_and_marketer_leads.sql). It only adds indexes and one column. The site works before it runs; it is faster after, and marketer fields are only kept on the file once it has run.

## What changes

Speed. The whole site was slow because the dragging-files alert asked the database about each lead one at a time, up to 200 trips in a row, on every dashboard load and every minute from the bell in every open tab. It now checks them in parallel and holds the answer for 30 seconds. The dashboard and the App home load their lists side by side instead of one after another, and a page asks the login server once instead of twice. Migration 0098 adds the indexes the slow reads were missing.

The App. Calls (MVA) is now App (Mobile) at claimreach.com/app. Old /calls links, including the ones in sent emails, still land in the right place. New call asks "What kind of call?" first (car accident today, more later). "Take a call" in the side menu opens the App with New call up. The old firm picker and forms are archived at /console/archive, out of the menu.

Desktop. On a screen 1180 pixels or wider the call screen splits: the call on the left, and on the right CarCure (every rebuttal and line, searchable, plus Ask CaseCure), Texts (the JustCall thread with a full-size composer and the call recordings), Retainer (the exact agreement she will get with what the call filled in, before it is sent) and Lead (what the marketer sent). Reaching Send brings up the Retainer preview by itself. On the phone, Send has a "Preview the agreement" link.

Google address finder on Where (city and state) and Home address: type a few letters, tap the match.

Ask CaseCure answers for real now, through the same AI relay as Crissi, with the MVA playbook as its brief.

Marketer and LawRuler leads. The LawRuler webhook reads keys however LawRuler spells them and routes by CaseType: anything that says MVA goes to that firm's MVA campaign, and INNO MVA goes to TMP. The lead shows up in the App with the Story step pre-picked from the description and DOI (fault, state, crash date, no lawyer), and a "From the lead" card the agent confirms out loud. The Motel 6 hook is untouched.

LawRuler text link: claimreach.com/app/lr/ followed by LawRuler's lead ID opens that lead's call screen, waits if the text beat the webhook, and survives a sign-in.

Marketers can also post straight in: POST claimreach.com/api/webhooks/marketer with header x-cr-secret. Each marketer's secret goes in Cloudflare as MARKETER_WEBHOOK_SECRETS, like prdigital:longsecret,othervendor:othersecret. The same person arriving from both doors lands on one file.

LawRuler posts that were turned away while the hook was being set up can be pulled in by opening claimreach.com/api/webhooks/lawruler/replay while signed in as the Operator or an admin.

## Files

    supabase/migrations/0098_speed_and_marketer_leads.sql   new, run in Supabase
    RUN_THESE_MIGRATIONS.sql                                0098 appended
    src/lib/alerts.ts, src/components/NotifyBell.tsx        the slow alert fix
    src/lib/auth-user.ts + 22 pages and layouts             one login check per page
    src/app/(internal)/dashboard/page.tsx                   loads side by side
    src/app/(calls)/app/...                                 the App: home, call, print, LawRuler link
    src/app/(calls)/calls/...                               now redirects to /app
    src/app/(internal)/console/...                          Take a call opens the App; old one archived
    src/components/calls/DeskPanel.tsx                      desktop right half
    src/components/calls/PlaceField.tsx                     Google address finder
    src/components/calls/LrWait.tsx                         waiting for a LawRuler lead
    src/components/calls/CallConsole.tsx, CallView.tsx, CallsHome.tsx, calls.css
    src/lib/lead-ingest.ts, src/lib/mva-call/lead-story.ts  marketer and LawRuler leads
    src/lib/mva-call/knowledge.ts, src/app/api/calls/ask    Ask CaseCure
    src/lib/mva-call/preview.ts, src/app/api/calls/esign/preview   agreement preview
    src/app/api/webhooks/lawruler/route.ts (+ replay), src/app/api/webhooks/marketer/route.ts
    src/middleware.ts, src/app/login/page.tsx               lead links come back after sign-in
    src/components/SideNav.tsx                              App (Mobile), Take a call
