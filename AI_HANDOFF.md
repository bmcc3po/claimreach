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

- Outcome: Astra's consolidated round-5 review answered as claimreach_round6.zip on top of merged main (cc1b06a, PR #37), together with Brett's Sep 28 live-call asks.
- Why it matters: MVA launch gates — claim identity, real-route packet recovery, QA evidence, privileged writes — plus the Nevada retainers the desk needs on live calls.
- Definition of done: every confirmed finding fixed or bounded with test evidence; DB repairs applied and probe-verified; build gate green; zip verified as an overlay on a clean copy of merged main; disposition table delivered for Astra.

## Current state

- Status: Round-6 zip (claimreach_round6.zip) built on top of merged main cc1b06a (PR #37): Astra's consolidated round-5 review triaged and repaired (claim identity, real-route packet recovery, QA evidence, privileged writes, contact state, notify retry, honest metrics) PLUS Brett's Sep 28 live-call asks (Nevada tiered/non-tiered retainers with approval-reason gate, passenger-as-own-PNC with own cell + linked files, PNC wording sweep, console contact card, MMS auto-filing, Simple form view, clickable missing items, quick case-type filters, pain notes carried from round 5)
- Working branch: round6 (local to Claude's cloud session; delivery is by zip upload, session cannot push)
- Latest commit: round6 branch on top of origin/main cc1b06a
- Deployment or preview: awaiting Brett's zip upload; DB migrations 0103-0107 ALL APPLIED live and probe-verified (0107 = move_leads_to_firm whole-graph transaction, service_role only); LawRuler MVA hook still posting 401 (bad/missing x-lr-secret in LawRuler — Brett fixing; replay route recovers the rejected posts)
- Last verified result: tsc clean; engine 46 pass; lead-ingest 10 pass; SsnDob 3 pass; browser shots (Simple form, passenger card, NV chooser blocking send without reason); next-on-pages Build completed; overlay on clean main verified

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
