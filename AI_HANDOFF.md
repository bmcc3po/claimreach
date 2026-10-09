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

- Outcome: add owner-only weekly payroll and billing for Monday-Sunday Pacific signature cohorts, with attorney holds, immutable period snapshots, prior-period credits/clawbacks, and auditable Wave corrections.
- Definition of done: the branch is reconciled with current main, migration 0128 and application behavior pass the full gates together, Brett explicitly approves the production migration and release order, the migration is applied before dependent code, and controlled synthetic acceptance passes without processing real invoices, funds, or payroll periods.

## Current state

- Working branch: `codex/pay-period-billing`, PR #162. Current work reconciles the branch with production main `1096589d04c973967ca581797e355061f244c9c0` (PR194).
- Merge conflicts are resolved while preserving current intake/header fixes, delivery wording, agent attribution and decline evidence.
- BMC and firm declines both stop new billing/commission. Prior-period adjustments require recorded processed payments and a valid decline date, retain the original paid agent, and cannot repeat.
- The reconciled preview at 59e03d1 passed Build Completed, 236 Edge Function Routes and deployment. Production migration/release approval remains pending.
- Latest user request: payroll is deal counts only. Added per-agent signature-period signed/payable counts, a separate original-agent prior-period chargeback column and net deals to pay; no dollar amounts. Older newly eligible deals remain separate. Current count-only update requires its new preview build.
- Migration 0128 adds three owner-only RLS tables and an invoker transaction for closing payroll. It has not been applied to production.
- No real payroll period, invoice, payment, credit, clawback, or Wave correction was created during development.

## Work completed

- Added an owner-only Payroll & billing page with five exclusive weekly groups and a separate older-newly-eligible review path.
- Added immutable close snapshots and separate billing/commission ledger entries.
- Added attorney hold/release handling, firm-rejection exclusion, processed-entry-only credits/clawbacks, duplicate prevention, CSV export, mobile layout, and append-only Wave correction audits.
- Kept unknown signature dates excluded and reviewable; import or review timestamps do not substitute for signature dates.
- Added migration 0128 and recorded isolated RLS, exact-matter, atomic rollback, and duplicate-entry checks.
- Added confirmed-save checks, pending-control locking and duplicate-submit protection to the payroll screen; failed saves retain the draft and show the error beside the action.

## Files and systems changed

- `RUN_THESE_MIGRATIONS.sql` and `supabase/migrations/0128_pay_period_billing.sql`.
- Payroll page, API, server/domain logic, styles, tests, navigation, signature reporting, attorney-hold helper, packet worklist, delivery, and final-handoff integration.
- See PR #162 for the exact current diff, including this handoff.

## Verification performed

- Reconciled code: TypeScript zero errors; payroll 15/15, signature-report 17/17, delivery 50/50, MVA engine 71/71 and intake engine 78/78.
- Payroll UI unknown/failed-save and duplicate-write checks, API owner/CSRF/matter/stale-preview/cutoff/transaction checks, and navigation regression passed.
- Isolated PostgreSQL checks covered owner-only RLS, exact-matter writes, atomic rollback, and duplicate billing/clawback prevention.
- Actual React screen tested with synthetic data at 375, 390, 768, 1024 and 1440 widths: no document overflow, five period filters, hold/release, required closing acknowledgments, synthetic close/readback and retained failed-save draft. Browser evidence is in the local work directory. Earlier original-head CSV download also passed.
- Production migration, production owner acceptance and physical Safari remain unverified. Local viewport tests do not claim physical iOS coverage.

## Active blockers or open questions

- Obtain Cloudflare Build Completed, Edge Function Routes and preview deployment success for the reconciled head.
- Brett must explicitly approve production migration 0128 and the migration-before-code release order after the reconciled branch passes its full gates.
- Do not process a real payroll period, invoice, payment, credit, clawback, or Wave correction during acceptance.

## Next safe action

- Push the reconciled tested head, verify preview build, and present the migration-before-code rollout for Brett's explicit approval. Never merge dependent production code before migration 0128 exists. The earlier automatic approval rejection remains in force until explicit approval.

## Session log

- 2026-10-09 05:15 PT — Codex — reconciled current production, added BMC decline and failed-save coverage, passed local code/SQL/browser gates; no production data or schema changes.
- 2026-10-08 19:18 PT — Codex — refreshed payroll continuity after four more main merges; branch is 3 ahead and 8 behind with new signature-report/source-binding conflict surface; next: reconcile and reverify before migration approval.
- 2026-10-07 19:38 PT — Codex — replaced the obsolete branch handoff with current PR #162 state; branch was green on its original head but conflicted with four newer decline/status commits; next: reconcile and reverify before migration approval.

