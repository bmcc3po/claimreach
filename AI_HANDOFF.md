# AI Handoff

## Current objective
Restore the M6 Today queue (claimreach.com/m6), which showed "Could not load the queue: canceling statement due to statement timeout" with every gauge at 0 (Nov 2 2026).

## Current state
- Branch `fix/m6-queue-timeout` (from main `20e0115`). Files: `supabase/migrations/0130_m6_contact_health_lateral.sql` (new) and the same SQL appended to `RUN_THESE_MIGRATIONS.sql` as 0130.
- Cause: `lead_contact_health` built `last_touch` (DISTINCT ON) and `inbound_waiting` by scanning all of `communications` (about 420k rows, about 418k unmatched July call logs with `lead_id` null) before joining to the ~99 Motel 6 files. The view is `security_invoker`, so the RLS policies on `communications` (`cr_inno_mva_staff_wall`, `cr_pilot_password_wall`, `comm_internal`, `comm_firm`) ran on every row and blew the 8s `authenticated` statement_timeout.
- Fix: same 24 columns, names, types and meaning; each per-file lookup is a LATERAL subquery keyed on `l.id` (uses `idx_comm_lead`, `idx_comm_twoway`, `idx_comm_failed`). `security_invoker = true` is restated because CREATE OR REPLACE VIEW resets view options.
- APPLIED to production by Brett on Nov 2 2026 via the Supabase SQL editor (project gvtafevoisfxcfkugvoj). This branch only records it; merging changes no runtime code.
- No TypeScript, route, RLS policy, role or permission change.

## Verification
- Before applying: new query and old view compared on production data with EXCEPT ALL: 99 rows each, 0 differing rows.
- After applying: view definition contains the LATERAL rewrite; `lead_contact_health` and `lead_contact_status` both still `security_invoker=true`.
- The exact `/m6` page query, run as the owner account under `authenticated` with an 8s timeout: 99 rows, 36.7 ms execution (previously timed out even at 120s).
- `tsc` and `next-on-pages` were not run: SQL-only change, no TypeScript touched.

## Open items (not started)
- M6 letter of representation does not match Josh Bauer's Oct 28 Motel 6 SOP: single recipient (G6 Hospitality Property LLC, Plano) vs the SOP's six G6 entities at Carrollton plus per-era franchisee, deed owner and later buyer; ready-flag fires on LawRuler status instead of after verified dates (plus/minus 30 days) and attorney approval; preservation list lacks the SOP's hotel-specific items and the Georgia O.C.G.A. 33-3-28 demand. As of Nov 2: 4 files `ready`, 3 `not_sent`, none sent. Recommended to Brett: hold the send button until rebuilt. Josh must confirm the correct G6 address.
- SOP scope SET by Brett (Nov 2): Neos stays the system of record for SOP case work (steps, documents, deadlines). M6 is a dashboard that links out to Neos, covering the drip, client update notes, and an audit view for Josh. The earlier workflow-engine / limitations-calculator / property-workbench plan is dropped.
- Proposed M6 audit build, awaiting Brett's approval (PLAN FIRST): Josh audit board (per-file contact recency, drip position, updates sent, SOP flags such as 60 days no contact and 90-day status email overdue, Open in Neos), per-file message audit trail with reviewed/flag stamps, Josh template approval and drip pause, outbound guard for SOP rule 3. Blockers: Neos matter link format, source of each file's Neos number (no column on `leads` today), whether paralegals see the board, and whether LOR sending leaves M6.
- The `bmcc3po/claimreach` GitHub repo is public. Flagged to Brett; not changed.

## Carried over (prior objective, status not re-verified here)
- NETFLY saved-review guidance (PR #202, merged as `2a0e1cc`) and call-center search (PR #203). Prior next safe action: complete combined checks, merge PR #203 through repository protections, then verify the production deployment for the resulting main revision. Never send a real packet as a smoke test.

## Next safe action
Brett reviews and merges `fix/m6-queue-timeout` (records only; the database change is already live). Then confirm /m6 loads in the browser.
