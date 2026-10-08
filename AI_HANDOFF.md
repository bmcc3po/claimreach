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

- Working branch: `codex/pay-period-billing`, head `4a742785d99793ee3dd2005915231ddfcef99133`.
- Current production main: `681a192e5563c09ada88cdbc852c01a9134cce2e`.
- Draft implementation is 2 commits ahead and 4 behind main and currently conflicts. The newer main commits are PRs #163-#166, including signed-file decline, status synchronization, and drop-letter behavior that directly intersects payroll eligibility and prior-paid clawbacks.
- PR #162 has a successful Cloudflare preview with 233 Edge Function Routes. TypeScript, focused payroll/API/signature-report/delivery tests, both engine suites, isolated PostgreSQL RLS/transaction checks, and synthetic desktop/mobile review are recorded as passing on the current branch head.
- Migration 0128 adds three owner-only RLS tables and an invoker transaction for closing payroll. It has not been applied to production.
- No real payroll period, invoice, payment, credit, clawback, or Wave correction was created during development.

## Work completed

- Added an owner-only Payroll & billing page with five exclusive weekly groups and a separate older-newly-eligible review path.
- Added immutable close snapshots and separate billing/commission ledger entries.
- Added attorney hold/release handling, firm-rejection exclusion, processed-entry-only credits/clawbacks, duplicate prevention, CSV export, mobile layout, and append-only Wave correction audits.
- Kept unknown signature dates excluded and reviewable; import or review timestamps do not substitute for signature dates.
- Added migration 0128 and recorded isolated RLS, exact-matter, atomic rollback, and duplicate-entry checks.

## Files and systems changed

- `RUN_THESE_MIGRATIONS.sql` and `supabase/migrations/0128_pay_period_billing.sql`.
- Payroll page, API, server/domain logic, styles, tests, navigation, signature reporting, attorney-hold helper, packet worklist, delivery, and final-handoff integration.
- See PR #162 for the exact 21-file diff.

## Verification performed

- TypeScript: zero errors.
- Payroll: 12 tests plus API authorization, stale-preview, failure, signature-report, navigation, and delivery regressions.
- MVA engine: 71/71. Intake engine: 78/78. Delivery: 48/48.
- Isolated PostgreSQL checks covered owner-only RLS, exact-matter writes, atomic rollback, and duplicate billing/clawback prevention.
- Actual React screen was tested with synthetic data on desktop and 390x844 phone, including hold/release, exclusions acknowledgment, synthetic close, frozen readback, and CSV download.
- Cloudflare preview passed with Build Completed, 233 Edge Function Routes, and deployment success.
- Current-main reconciliation, post-reconciliation regression tests, production migration execution, and real owner acceptance remain unverified.

## Active blockers or open questions

- PR #162 conflicts with four newer main commits. Reconcile the signed-decline/status changes before treating payroll eligibility or clawbacks as release-ready.
- Brett must explicitly approve production migration 0128 and the migration-before-code release order after the reconciled branch passes its full gates.
- Do not process a real payroll period, invoice, payment, credit, clawback, or Wave correction during acceptance.

## Next safe action

- Reconcile PR #162 onto main `681a192e`, review the decline/status and prior-paid clawback intersection, rerun all application, database, build, and synthetic close/readback gates, then present the verified migration-before-code rollout for Brett's explicit approval.

## Session log

- 2026-10-07 19:38 PT — Codex — replaced the obsolete branch handoff with current PR #162 state; branch is green on its original head but conflicts with four newer decline/status commits; next: reconcile and reverify before migration approval.
