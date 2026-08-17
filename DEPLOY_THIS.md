# ClaimReach deploy — m6 client care + LawRuler ingest fixes

Unzip over the repo root, replacing files. Then commit and push.

    unzip -o claimreach_LATEST_deploy_this.zip
    cd claimreach
    git add -A
    git commit -m "m6 client care app + lawruler ingest fixes"
    git push

Cloudflare auto-deploys. Then open https://claimreach.com/m6

## New: the m6 client care app

    src/app/(m6)/m6/layout.tsx          auth gate, both firms
    src/app/(m6)/m6/page.tsx            Today
    src/app/(m6)/m6/cases/page.tsx      Cases
    src/app/(m6)/m6/cases/[id]/page.tsx Case file
    src/components/m6/M6Nav.tsx
    src/components/m6/CaseList.tsx
    src/components/m6/CaseFile.tsx
    src/lib/m6.ts                       shared vocabulary
    src/app/api/m6/touch/route.ts       log a touch
    src/app/api/m6/note/route.ts        shared note thread
    src/app/api/m6/schedule/route.ts    schedule a call
    src/app/api/m6/contact-point/route.ts

## Changed

    src/middleware.ts       /m6 sends unauthenticated users to /firm-login
    src/app/globals.css     m6 styles appended at the end
    src/lib/webhooks.ts     mail_address1 was a phantom column, now mail_addr1
    src/app/api/hooks/in/[key_id]/route.ts   same phantom column, plus a
                                             phantom `status` column on leads
    src/app/api/webhooks/lawruler/route.ts   LawRuler ingest

## Migrations

    supabase/migrations/0082_m6_retention.sql    ALREADY APPLIED to Supabase
    supabase/migrations/0083_lead_no_trigger.sql ALREADY APPLIED to Supabase

Both are in the zip so the repo matches the database. Do not re-run them;
they are idempotent, but there is no reason to.

## Still parked

  * Dedicated Motel 6 sending number. retention_settings.sending_number is
    NULL, which disables sending, so nothing can text a client from an
    agent's line and burn the number the run sheet tells them to save.
  * JustCall API key, secret, and webhook from Yvette, to ingest TMP's calls.
  * LawRuler is posting urlencoded, which cannot carry files. The intake form
    will not arrive until the attach-documents toggle flips it to multipart.
  * LawRuler status -> pipeline_stage mapping. Status is currently recorded to
    the activity feed only, on purpose: the two vocabularies do not match yet.
