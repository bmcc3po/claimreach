# ClaimReach deploy: JustCall goes through a filter, Google lookups locked

No database changes. Do these in this order. The key is in the chat, not in any file.

Cloudflare Pages, claimreach, Settings, Environment variables (Production): set JUSTCALL_WEBHOOK_SECRET to the key. If it already exists, replace it.

Upload this zip at github.com/bmcc3po/claimreach/upload/main, wait for the check, merge. The deploy it starts picks up the key.

JustCall, webhooks: change every ClaimReach webhook (call completed, text, voicemail, AI report, sales dialer) to
https://gvtafevoisfxcfkugvoj.supabase.co/functions/v1/justcall-filter?key=THE_KEY

## What changes

JustCall no longer sends ClaimReach the whole account. It sends to a small filter in Supabase that keeps calls, texts and voicemails for numbers that have a ClaimReach file, plus every text on the ClaimReach texting line (so someone new texting in still shows up), and drops the rest. ClaimReach refuses anything that comes without the key.

The Google place lookup (/api/places) and the street pictures (/api/streetview) now need a ClaimReach sign-in. The LawRuler property tool keeps working with its own key.

## Files

    supabase/functions/justcall-filter/index.ts (already deployed to Supabase; this is the copy of record)
    src/app/api/justcall/webhook/route.ts, src/components/IntegrationsManager.tsx
    src/app/api/places/route.ts, src/app/api/streetview/route.ts, src/components/PropertyTool.tsx
    tsconfig.json (leaves the Supabase function out of the site build)
