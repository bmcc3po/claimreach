# AI Handoff

This file is the shared continuity record for Claude Code and ChatGPT/Codex. It is live operational state, not general documentation.

## Required agent behavior

- Read this file before changing code.
- Keep one concise current snapshot. Replace stale status instead of stacking conflicting status sections.
- Update it before stopping, handing off, asking for help, or saying work is complete.
- Record exact commands, verification results, and error text when blocked.
- Mark work complete only after verification.
- Leave one concrete next safe action whenever work remains.
- Keep only the five newest session-log entries.
- Never put secrets, API keys, credentials, payment data, or client/claimant PII in this file.

## Current objective

- Outcome: claimreach_round7b.zip for the launched MVA desk: standard fields (one name and one column per field on every screen, export and webhook), void a sent or signed agreement, plus the round 7 hotfix (hard-mapped contact, address split, Simple form radio buttons + File section).
- Why it matters: Brett cannot build webhooks without standardized default mappings; TMP-1186 had the wrong agreement out with no way to change it.
- Definition of done: tsc clean, suites green, next-on-pages build, overlay verified on origin/main 23f7f38, zip delivered.

## Current state

- Status: round7b built. Still open from Astra round 6: #57 delivery by claim, #58 QA evidence, #59 dirty autosave, #62 MMS inbound_media, #63 signed classifier/drip/notify lease, #65 cadence, #66 classic Retainer tab.
- Working branch: round7 (local; delivery by zip upload; git push is 403 from this session)
- Deployment or preview: 0108 and 0109 (+0109b) APPLIED live. 0108 dropped the old two-argument move_leads_to_firm, so bulk "Move to firm" fails on the deployed round-6 code until round 7 is live.
- Live data actions on Brett's request: TMP-1186's unsigned Alabama/Georgia agreement set to expired with an audit entry so the Nevada one can be sent; Brett to archive DocuSeal submission 11647066.
- Nevada templates: NV and NV_FLAT now exist for INNO MVA (Brett ran Set up agreements).
- Last verified result: tsc clean; standard-fields 7, us-address 9, server 13, engine 51, lead-ingest 10, SsnDob 3, docuseal 12 pass; standard record columns checked against live schema

## Work completed

- Round 6 (see DEPLOY_THIS.md top section for the full list): claim-status setter hardening + claim scope through every caller; packet manifest/recovery on the real esign GET route incl. passengers; QA capability/evidence/write-gates; drip wrapper, atomic firm move (0107), property targeting, save allowlists; contact-state sync; notify retry; honest speed/signed metrics; Nevada tiered + non-tiered retainer packets with approval-reason gate; passenger-as-own-PNC (own cell, rep/willing/address, linked files, story prefill); PNC wording sweep with saved-answer migration; console contact card; MMS auto-filing; Simple form view; clickable missing items; numbered File steps; quick case-type filters on Leads/Signed.

## Files and systems changed

- src/lib/claim-status.ts, mva-call/esign.ts, firm-delivery.ts, signed-docs.ts, notify-signed.ts, comms.ts, statuses.ts, linked-files.ts (new), esign-packets/tmp-mva.ts, docuseal.ts
- api routes: calls/dispo, calls/esign (+preview), calls/email, calls/file, qa, drip, leads (+bulk), claims, signable packet+submit, justcall/webhook
- console: engine.ts (+test), CallView, ChoreList, FullIntake, OneQuestion, FormView (new), DeskPanel, CallConsole, IntakeWorkspace, SsnDob, WhereField, scripts.ts, calls.css
- CRM: LeadWorkspace, ContactInfo, CaseDetails, FileStatusControl, LeadsView, ReportsView, leads/signed/reports pages, clean.css
- DB: supabase/migrations/0107_round6_hardening.sql (APPLIED live, probe-verified)
- public/esign-src/.../tmp-mva-nv.pdf, tmp-mva-nv-flat.pdf (new packet PDFs)

## Verification performed

- Commands or checks: rm -rf .next/types && npx tsc --noEmit -p .; npx tsx engine.test.ts (46), lead-ingest.test.ts (10), SsnDob.test.ts (3); Playwright shots (Simple form, passenger card, NV chooser blocks send without a reason, pain notes); npx @cloudflare/next-on-pages; overlay of the full changed set on a clean checkout of origin/main; 0107 probes via has_function_privilege + rolled-back synthetic two-firm move.
- Result: all green (build route count noted in DEPLOY_THIS).

## Active blockers or open questions

- Exact issue: LawRuler MVA hook posts rejected 401 "bad or missing x-lr-secret" since Sep 27 15:41Z (Motel hook fine — TMP-1184/1185 posted). Brett fixing the header in LawRuler; /api/webhooks/lawruler/replay?hours=48 recovers the rejected posts afterward.
- Cadence system: design agreed in chat, four decisions still open with Brett (ownership, status key, e-sign chase SMS wording, quiet hours). DO NOT build until he answers.
- Global UI consolidation round (Users, Firms, Templates, Integrations, Settings, Campaigns manager, Form builder, firm portal): committed as its own reviewable round, still to do.
- Nevada contracts carry no printed TMP countersignature (unlike AL/GA) — flagged to Brett; docs went in as supplied.

## Next safe action

- Brett uploads claimreach_round6.zip; then triage Astra's next handback the same verify-fix-dispute way, and start the global UI round.

## Session log

Add the newest entry first. Use: `YYYY-MM-DD HH:MM TZ — agent — outcome / blocker / next action`.
