# AI Handoff

## Current objective
M6 audit board for Josh Bauer (TMP): one place to audit the Motel 6 drip, client messages and update notes, with "Open in Neos". Neos stays the system of record for SOP case work (Brett, Nov 2 2026).

## Current state
- Branch `feat/m6-audit-board`, stacked on `fix/m6-queue-timeout` (which records migration 0130, already applied in production). Neither is merged to main (`20e0115`).
- Brett approved the build on Nov 4 ("build build build"). Defaults taken without his answer: every M6 user (staff and TMP firm) sees the board; Neos number is typed in per file; Neos link format comes from env `M6_NEOS_MATTER_URL` (must contain `{no}`, https only). Unset means no button, number still saved.
- New: `/m6/audit` (board: flag gauges, search, filters, Download for Excel, drip wording read-only) and `/m6/audit/[id]` (file audit: Mark reviewed / Flag for follow up, Neos number, at-a-glance, coming up, full timeline of texts, emails, calls, notes and audits). Nav link "Audit".
- Logic in `src/lib/m6-audit.ts` (pure, one flag vocabulary). Loaders in `src/lib/m6-audit-server.ts`. Flags: flagged, reply waiting, 60 days no contact (SOP dormant), send failed, never reached, no written update in 90 days (SOP status email), not audited in 30 days, opted out.
- Audit stamps are `lead_notes` rows with `source = 'audit'` (body "Audit: reviewed." / "Audit: flagged for follow up. <comment>"). No new table. Inserted with the user's client under existing `notes_firm_write` / `notes_internal` RLS.
- `/api/m6/neos` writes one column (`leads.neos_matter_no`) with admin after `assertM6Write`, same pattern as LOR facts. Firm UPDATE guard on leads unchanged.
- Drip wording read with admin (drip_rules is internal-only RLS), filtered `campaign = 'motel6'` AND `firm_id = TMP`. Read-only. All 13 Motel 6 drip steps are `approved_by_firm = false` in production, so nothing auto-sends; the cadence cron is a walker only.
- SOP rule 3 guard: `bodySaysNothingReportedToG6()` in `m6-cadence.ts`. New hard gate reason `g6_report_claim` (cannot send or log). Also enforced on `/api/m6/note` and `/api/m6/audit` (422 with a friendly message).
- Migration 0131 WRITTEN, NOT APPLIED: `alter table public.leads add column if not exists neos_matter_no text;` (in `supabase/migrations/0131_m6_neos_matter_no.sql` and `RUN_THESE_MIGRATIONS.sql`). Until applied, the board loads and says "Neos numbers are not switched on yet"; the save route returns a clear 503.

## Verification
- `tsc` clean. `npx @cloudflare/next-on-pages`: Build Completed, 241 Edge Function Routes (237 + /m6/audit, /m6/audit/[id], /api/m6/audit, /api/m6/neos).
- New `src/lib/m6-audit.test.ts`: 66 passed (flags, stamps, aggregation, Neos URL, CSV formula neutralizing, rule 3 positives and negatives, gate).
- Full test sweep (tsx per file): branch 129/140 files pass, unchanged main 128/139. The same 11 files fail on both; no regressions.
- Firm RLS check on production as a TMP firm user (counts only): 100 files, 75 comms, 11 lead_notes, 1 open call_schedule visible; drip_rules not visible to firm (hence admin read).
- Visual check with fake data rendered to static HTML and screenshotted at 1280 and 390 px: no horizontal overflow.
- Not done: authenticated click-through on a deployed preview.

## Open items
- Brett: apply 0131, set `M6_NEOS_MATTER_URL` in Cloudflare Pages once the Neos matter URL format is known, merge both branches.
- Not built yet (waiting on Brett): Josh approving drip wording from the board, pausing a file's drip from the board, LOR send hold.
- LOR does not match Josh's Oct 28 SOP (single recipient at Plano vs six G6 entities at Carrollton plus franchisee/owner/buyer; ready-flag on LawRuler status; generic preservation list; Georgia 33-3-28). Nothing sent as of Nov 2. Recommended hold.
- The `bmcc3po/claimreach` GitHub repo is public. Flagged to Brett; not changed.

## Carried over (prior objective, status not re-verified here)
- NETFLY PR #202 merged as `2a0e1cc`; PR #203 status not re-checked. Never send a real packet as a smoke test.

## Next safe action
Brett reviews the audit PR, applies 0131 in the Supabase SQL editor, merges, then opens claimreach.com/m6/audit signed in and marks one file reviewed to confirm the stamp shows on the file.
