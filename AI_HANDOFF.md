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

- Outcome: v8 checkpoint saved at Brett's request (stop and save). See HANDOFF.md for the full completed / open list.
- Definition of done for the next session: one MVA question spine across all four views, remaining matter binding, signing lifecycle, classic Retainer tab, cadence phase 1.

## Current state

- Status: checkpoint. Not deployed. Live = PR #40 (round 7b).
- Working branch: round8 (local; zip delivery; push is 403 from this session). Base main 822338f.
- Last verified result: tsc zero errors; next-on-pages Build completed, Edge Function Routes (193); offline suites all passing (matter 5, standard-fields 24, us-address 10, lead-ingest 12, server 13, engine 51, SSN/DOB 3, docuseal 12, firm-delivery 20, bulk-move-firm 13, qa-evidence 18, contact-saves 23, notify-signed 23, statuses 8, drip-dispatch 11, comms 11, inbound-media 19, signed-docs 17, file-fence 41, drip-rules 17).
- No new migrations in this checkpoint (0108, 0109, 0109b already applied live).

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
