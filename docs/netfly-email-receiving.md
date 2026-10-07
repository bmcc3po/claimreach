# NETFLY email receiving

Send or forward NETFLY signed-case emails to `netfly@oourkaudor.resend.app` after activation. A Google Workspace alias can forward to it later; do not replace the existing innovativeintake.com MX records.

## Activation

1. Resend → Webhooks: add `https://claimreach.com/api/webhooks/netfly-email`, subscribing only to `email.received`.
2. Cloudflare Pages → claimreach → Settings → Variables and Secrets → Production:
   - `NETFLY_RESEND_WEBHOOK_SECRET`: the signing secret for that exact webhook, stored as a secret.
   - `NETFLY_RECEIVING_TO`: `netfly@oourkaudor.resend.app`.
   - `NETFLY_EMAIL_FROM_DOMAINS`: `netflydigital.com,innovativeintake.com` (exact authenticated sender domains).
   - `NETFLY_EMAIL_FROM_ADDRESSES`: optional comma-separated individual forwarders; defaults to `bcurry@turnbullfirm.com`. An explicitly empty value disables this list. These addresses still require Resend's verified DMARC result; quoted From lines and email headers never grant permission.
   - `NETFLY_RESEND_API_KEY`: a dedicated Resend Full access key for retrieving incoming messages, stored as a secret. Resend does not offer a receiving-only key. Leave the existing sending-only `RESEND_API_KEY` unchanged.
3. Redeploy after setting production variables. Do not copy production receiving credentials to public PR previews.
4. Send a clearly marked synthetic case with a PDF, inspect the new NETFLY file and original attachment, then replay its webhook. There should still be one lead and one copy of the PDF. Archive the synthetic file after verification.

## Import behavior

The original plain-text email and PDF attachments are stored privately on the claim. Recognized labeled fields fill blank answers; existing contact details, agent answers, and unavailable markers win. The email's From/To/CC addresses are never treated as client contacts. Narrative medical or legal conclusions are not guessed. The rep confirms imported facts with the client and reviews the original signed PDF.

Missing name, phone, note, or PDF creates a visible partial file. Phone can be added after the live transfer. Import never grants text/call permission, approves a retainer, sends to a firm, or starts a return clock.

Exact repeated case-note content reuses the same file; webhook retries are idempotent. An explicit LawRuler Lead ID can bind to one active, same-campaign file with a matching client name. Name or shared phone alone never attaches a legal document to an existing file. A materially changed email without the LawRuler ID may create another partial file requiring staff reconciliation.

Only signed, recent Resend events for the configured inbox and DMARC-authenticated allowed sender domains or individual forwarders are accepted. Unverified sender authentication is held in Resend for review. A failed attachment import keeps the partial lead and returns a retryable response; replay the event after fixing the cause. The integration imports up to eight PDFs, 15 MB each. Other attachment types stay in Resend. The complete original text is retained even when longer than the 20,000-character handoff note.

Unapproved senders to this receiving inbox produce a visible held-email receipt. They do not create client files. Their webhook is acknowledged without repeated retries; an owner can replay the preserved message after correcting the sender configuration.

## Manual paste

In a NETFLY file, open **NETFLY intake** or **File → Paste email & fill missing details**. Paste the entire email, inspect the proposed fields, uncheck any unwanted fields, and save. Unrecognized text remains in the original handoff note.

## Evidence

`netfly-email.test.ts` covers parser, signature, sender/recipient restrictions, attachment download boundaries, and blank-only updates. `netfly-email-import.test.ts` covers partial files, replay, repeated forwards, attachment failures/recovery, archived files, and firm isolation. Automated tests do not send client communications.

