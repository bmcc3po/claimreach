SPEC — DO NOT BUILD UNTIL BRETT SAYS GO

PHASE I — m6 COMMS ENGINE (post-launch, after LOR pipeline or parallel)
Prereqs (Brett): heartbeat cron green; JustCall keys (Yvette); M6 sending
number in retention_settings; TMP-approved templates; quiet-hours window.

1. Ladder walker: on m6 entry, enroll the file at step 1 of the seeded
   9-step ladder; scheduler (heartbeat) advances steps on time; two-way
   contact (the 0082 trigger already exists) pauses/resets per settings.
2. Send rails: SMS via JustCall API from the M6 number; email via Resend
   from a TMP-branded address. Every send logged to communications with
   ladder_step; visible in Contact history.
3. Case-file send: compose text/email to this client from the case page
   (staff + firm, m6 predicate, template-first with free-text allowed).
4. Bulk case updates: pick recipients (all active m6 / filtered), pick
   template, preview, send; per-recipient log; failures flagged on Today.
5. Safety rails: opt-out honored hard; quiet hours enforced; no send to
   dead contact points; templates require firm approval flag before use;
   idempotent per step per file.
