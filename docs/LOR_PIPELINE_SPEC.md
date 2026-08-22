SPEC — DO NOT BUILD UNTIL BRETT SAYS GO

# LOR PIPELINE — LawRuler → ClaimReach (m6) → PostGrid certified mail

Flow: agent marks "Secondary intake OK sent to firm" in LawRuler → existing
webhook upserts the file into m6 and flags it LOR-READY → ClaimReach checks
completeness → (one human click, v1) → ClaimReach calls PostGrid → certified
mail to the resolved defendant → PostGrid status webhooks update the case
(sent / in transit / delivered / returned) → Today flags anything stuck.

LawRuler never talks to PostGrid. ClaimReach is the brain.

---

## PART 1 — BRETT'S LAWRULER CHECKLIST (do before the build is testable)

In the existing Motel Traffic webhook (Webhook.aspx):

1. TRIGGER: confirm "Secondary intake OK sent to firm" is in the status
   trigger list. Add it if missing.
2. BODY TAB — add these mappings (find each field's {{default##}}/{{custom##}}
   token in the picker):
   - first_name  → client first name        ← "Unnamed file" says this is
   - last_name   → client last name            missing or empty NOW; fix first
   - gender      → gender field (drives she/he/they in the letter)
   - incident_start → incident window start date (motel custom tab)
   - incident_end   → incident window end date (motel custom tab)
   - property_name  → brand as claimant recalls it (e.g. Motel 6)
   - property_street, property_city, property_state, property_zip
     (or property_address single line + city/state/zip — match whatever the
     motel custom tab actually stores; tell Cursor which shape you mapped)
3. Note which of these are blank on the 7 live files — the backfill CSV
   (Phase D) must include the same columns.
4. Do NOT toggle the webhook on until Phase C (secret wiring) is done.

## PART 2 — CLAIMREACH CONFIG (Brett supplies values, Cursor builds storage)

- Per-firm sender block: sender name, phone, fax, email, signature image,
  initials, typist initials, letterhead logo. (TMP v1 = Josh Bauer's block.)
- Per-campaign letter settings: injury_phrase ("sexually abused and
  exploited" for m6), response_days (30), delivery method (USPS Certified).
- Defendant/recipient table: org_name, attention line, addr1,
  city_state_zip, entity_role (franchisor / franchisee / owner_of_record).
  Seed row 1: G6 Hospitality Property LLC d/b/a Motel 6, LEGAL DEPT.,
  6509 Windcrest Drive Suite 100, Plano TX 75024, franchisor.
  Per case, one or more recipients are selected — same letter can go to
  multiple defendants at different addresses.

## PART 3 — CURSOR PHASE PROMPT (run after launch week; plan first)

Branch: task/m6-lor-pipeline. Plan before code. This touches outbound legal
mail — flag the plan to me before implementing.

1. SCHEMA (migration, I apply): lead LOR fields per recipient-send:
   lor_sends table (lead_id, recipient_id, status
   [ready/blocked/queued/sent/delivered/returned/failed], postgrid_letter_id,
   tracking_number, sent_at, delivered_at, marked_by, block_reasons jsonb).
   Config tables per Part 2 (firm sender block, campaign letter settings,
   defendants/recipients).
2. INGEST: extend /api/webhooks/lawruler mapping with the Part 1 fields.
   Arrival of status "Secondary intake OK sent to firm" sets the file
   LOR-READY (creates a lor_sends row per default recipient in 'ready' or
   'blocked').
3. COMPLETENESS GATE: required = full name, gender/pronouns resolvable,
   incident start+end, property name+address, resolved recipient, client
   mailing address NOT required (letter goes to defendant), sender config
   present. Any missing → status 'blocked' with block_reasons; shows on
   Today as "LOR blocked: <reasons>". No send possible while blocked.
4. TEMPLATE + SEND: implement the LOR template with the placeholder set
   from Brett's spec (letter.date and start_minus_3yr derived at send).
   Prefer PostGrid-hosted template + merge variables; if signature/letterhead
   per-firm images don't fit their templating, render PDF in ClaimReach and
   send via PostGrid's PDF path — evaluate in the plan. Certified Mail with
   Electronic Return Receipt.
5. SEND CONTROL v1: "Send LOR" button on the case file (staff + firm, m6
   predicate), enabled only when 'ready'. IDEMPOTENT: an existing
   postgrid_letter_id on that lor_sends row = hard refuse to send again;
   creating a duplicate letter to a defendant must be impossible from UI
   or webhook replay. Design so v2 can remove the click (auto-send on
   ready) without rearchitecting.
6. TRACKING LOOP: /api/webhooks/postgrid endpoint (secret-verified, same
   fail-closed pattern as LawRuler's) consuming letter status events →
   updates lor_sends → case file LOR card shows live status + tracking
   number; Today flags 'returned' and 'failed'.
7. TODAY: LOR section = blocked files (with reasons), ready-to-send,
   returned/failed. Signed-but-no-LOR flag from Phase G folds into this.
8. ENV: POSTGRID_API_KEY + POSTGRID_WEBHOOK_SECRET in Cloudflare (Brett
   sets; fail-closed if absent). Use PostGrid TEST key until Brett flips
   to live — first end-to-end test sends to Brett's own office address,
   not to G6.

## SEQUENCING

- Phase G (launch week): LOR card + manual mark + Today flag (already
  specced). Ships so Josh sees LOR status day one.
- This pipeline: the week after launch. Backfilled files will then have
  real names/dates/properties for the gate to check.
- v2 (later, Brett's call): remove the human click for fully automatic
  send on LOR-READY.

## OPEN ITEMS (Brett)

- Confirm the exact LawRuler status string (spelling/case) used as trigger.
- Which LawRuler custom fields hold incident window + property address on
  the motel tab (names as they appear in the token picker).
- Whether multiple defendants per case is needed at v1 or single
  (franchisor) is enough to start.
- PostGrid account: create it, grab TEST + LIVE keys.
