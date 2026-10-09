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

- Working branch: `codex/pay-period-billing`, current head `2f20dabe9f0a38a6ba53309f0467abaa0c59d22d`. The latest commit is documentation-only; application head remains `4a742785d99793ee3dd2005915231ddfcef99133`.
- Current production main: `768a9a8ae1074d71bf8f1b1dd31cc9ee7dd7fe8f`.
- The branch is 3 commits ahead and 8 behind main and currently conflicts.
- The eight newer main commits include signed-file decline and terminal-status synchronization plus shared file actions and PR Digital signature-report/source-binding work. Payroll eligibility, signature cohorts, and prior-paid clawbacks must be reconciled against all of them.
- PR #162 has successful Cloudflare and Netlify evidence at the documentation head. The original application head passed TypeScript, focused payroll/API/signature-report/delivery tests, both engine suites, isolated PostgreSQL RLS/transaction checks, and synthetic desktop/mobile review.
- Migration 0128 adds three owner-only RLS tables and an invoker transaction for closing payroll. It has not been applied to production.
- No real payroll period, invoice, payment, credit, clawback, or Wave correction was created during development.

## Work completed

- Added an owner-only Payroll & billing page with five exclusive weekly groups and a separate older-newly-eligible review path.
- Added immutable close snapshots and separate billing/commission ledger entries.
- Added attorney hold/release handling, firm-rejection exclusion, processed-entry-only credits/clawbacks, duplicate prevention, CSV export, mobile layout, and append-only Wave correction audits.
- Kept unknown signature dates excluded and reviewable; import or review timestamps do not substitute for signature dates.
- Added migration 0128 and recorded isolated RLS, exact-matter, atomic rollback, and duplicate-entry checks.
- Refreshed this branch handoff only; no runtime code, schema, permissions, funds, or client records changed.

## Files and systems changed

- `RUN_THESE_MIGRATIONS.sql` and `supabase/migrations/0128_pay_period_billing.sql`.
- Payroll page, API, server/domain logic, styles, tests, navigation, signature reporting, attorney-hold helper, packet worklist, delivery, and final-handoff integration.
- See PR #162 for the exact 22-file current diff, including this handoff.

## Verification performed

- Original application head: TypeScript zero errors; payroll 12 tests plus API authorization, stale-preview, failure, signature-report, navigation, and delivery regressions.
- Original application head: MVA engine 71/71, intake engine 78/78, delivery 48/48.
- Isolated PostgreSQL checks covered owner-only RLS, exact-matter writes, atomic rollback, and duplicate billing/clawback prevention.
- Actual React screen was tested with synthetic data on desktop and 390x844 phone, including hold/release, exclusions acknowledgment, synthetic close, frozen readback, and CSV download.
- Current documentation head has completed successful Cloudflare and Netlify checks.
- Current-main reconciliation, post-reconciliation regression tests, production migration execution, and real owner acceptance remain unverified.

## Active blockers or open questions

- PR #162 conflicts with eight newer main commits. Reconcile both the decline/status logic and the newer signature-report/source-binding behavior before treating payroll eligibility or clawbacks as release-ready.
- Brett must explicitly approve production migration 0128 and the migration-before-code release order after the reconciled branch passes its full gates.
- Do not process a real payroll period, invoice, payment, credit, clawback, or Wave correction during acceptance.

## Next safe action

- Reconcile PR #162 onto main `768a9a8a`, review the decline/status, signature cohort, source-binding, and prior-paid clawback intersections, rerun all application, database, build, and synthetic close/readback gates, then present the verified migration-before-code rollout for Brett's explicit approval.

## Session log

- 2026-10-08 19:18 PT — Codex — refreshed payroll continuity after four more main merges; branch is 3 ahead and 8 behind with new signature-report/source-binding conflict surface; next: reconcile and reverify before migration approval.
- 2026-10-07 19:38 PT — Codex — replaced the obsolete branch handoff with current PR #162 state; branch was green on its original head but conflicted with four newer decline/status commits; next: reconcile and reverify before migration approval.
