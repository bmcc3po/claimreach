# ClaimReach deploy: MVA call console + signed-docs lockdown

Upload everything in this zip to GitHub (main), keeping the folders. Cloudflare deploys on its own.

## Before upload (done 2026-09-26)

Migration 0095 and 0097 are applied. Env vars in Cloudflare: DOCUSEAL_API_KEY, DOCUSEAL_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, JUSTCALL_API_KEY, JUSTCALL_API_SECRET, JUSTCALL_DEFAULT_FROM.

## After it is live

Run 0096 (signed-docs private) from RUN_THESE_MIGRATIONS.sql.
Open claimreach.com/calls as an owner and tap Set up agreements. That makes the TX, FL and AL/GA templates in DocuSeal.
In DocuSeal, add a webhook to https://claimreach.com/api/esign/docuseal with a secret header named X-CR-Secret set to the DOCUSEAL_WEBHOOK_SECRET value.

## What is new

The call console at /calls: home (open, call backs, signing, done, search, new call) and /calls/[id] (Guided, Freestyle, Q&A, Help with rebuttals and lines, texting through JustCall with calls and recordings, DocuSeal e-sign, dispo). Agents land on /calls. First sign-in makes a new password.

    src/app/(calls)/layout.tsx, calls/page.tsx, calls/[id]/page.tsx, calls/[id]/print/page.tsx
    src/app/set-password/page.tsx
    src/components/calls/*            CallView (from the approved canvas), CallConsole, CallsHome, PrintActions, calls.css
    src/lib/mva-call/*                engine (ported from the canvas), dispo, state, server, esign, tests
    src/lib/docuseal.ts, src/lib/esign-packets/tmp-mva.ts, src/lib/password-rules.ts
    public/esign-src/...              blank TMP retainer PDFs DocuSeal fetches once at setup
    src/app/api/calls/*               save, dispo, text, comms, search, new, email, esign (+complete, resend), esign-setup
    src/app/api/esign/docuseal        DocuSeal webhook (fails closed without the secret)
    src/app/api/me/password           first sign-in password
    src/app/api/v1/leads              POST to create leads; GET fixed

## Auth and access changes (flagged per AGENTS.md)

    /api/v1/leads now needs the key secret as well as the key id (Authorization: Bearer <secret>). The key id alone sits in vendor webhook URLs. GET was returning 500 before (it asked for a status column leads does not have), so nothing that works today breaks.
    (internal)/layout.tsx and (calls)/layout.tsx send anyone flagged must_change_password to /set-password.
    middleware.ts lets /esign-src/*.pdf through without a login (blank forms only).
    Dashboard sends agents to /calls.
