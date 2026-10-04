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

- Outcome: finish and verify the current INNO story-fill and NETFLY step-by-step intake drafts without losing the separate app-wide call-alert work.
- Definition of done: both intake drafts are reconciled with current main, guarded behavior is verified under a live agent role, final delivery remains correct, and the alert work is re-applied to the current canonical queue before release.

## Current state

- Main: `e7ceefb85ef95e48d828311badda82ad499b2961`.
- Material movement in the last 24 hours: eleven PRs merged (#117, #119-#125, and #128-#130), completing paste-first NETFLY file creation, email-to-file import, replay safety, firm-delivery settings, PDF access, agent packet delivery, lower note latency, and more compact evidence-bounded extraction.
- Draft PR #126, INNO story fill, is 4 commits ahead and 3 behind main, cleanly mergeable, and has a successful Cloudflare Pages check. Its local TypeScript, engine, route, helper, regression, and mocked browser checks passed.
- Draft PR #127, simplified NETFLY step-by-step intake, is 5 commits ahead and 3 behind main with merge conflicts. Its Cloudflare Pages check and local TypeScript, engine, regression, and mocked responsive UI checks passed.
- Draft PR #80, app-wide call-ready sound and green pulse, is 2 commits ahead and 67 behind main with merge conflicts. Hosted checks are green, but the implementation is not release-ready against the current queue.
- This documentation-only correction remains in draft PR #118. Git evidence does not establish the current production deployment or live data behavior.

## Work completed

- Completed the NETFLY email-to-file path from pasted handoff through review and agent firm delivery.
- Hardened forwarded contact parsing, repeated-email handling, visible firm-delivery settings, PDF access, evidence-bounded extraction, save deduplication, and extraction latency.
- Added clean, reviewable drafts for INNO story-to-field suggestions and the simplified five-step NETFLY intake form.
- Updated this handoff to current Git evidence without changing application code, deployment, schema, permissions, or secrets.

## Files and systems changed

- See merged PRs #117, #119-#125, and #128-#130 for the exact current-main change sets.
- See draft PR #126 for INNO story suggestion, review, and conflict-aware save changes.
- See draft PR #127 for the simplified NETFLY intake presentation.
- See draft PR #80 for the isolated app-wide alert implementation.

## Verification performed

- Current main Cloudflare Pages check completed successfully.
- Six ClaimReach automation heartbeat runs in the review window completed successfully.
- All 27 open pull requests reviewed had no failed or pending reported check.
- PR #126 and PR #127 include successful Cloudflare Pages checks plus the local validation recorded in their PR descriptions.
- Live agent-role acceptance, three separate nonbinding-signature paths, final delivery behavior, and production deployment state were not verified in this handoff update.

## Active blockers or open questions

- PR #127 conflicts with the three newer main changes from PRs #128-#130 and must be reconciled before review.
- PR #126 still needs live agent-role verification across its guarded signature and final-delivery paths.
- PR #80 must be re-applied or rebased onto the current queue and cadence implementation. Do not merge the conflicted branch as-is.
- A live test-account credential handoff is still required for the remaining agent-role acceptance checks; do not put credentials in this file.

## Next safe action

- Reconcile draft PR #127 onto current main while preserving the merged packet-delivery and notes changes, then rerun TypeScript, both engine suites, the NETFLY regression, and the hosted preview check. Keep it draft until live agent-role acceptance is recorded.

## Session log

- 2026-10-03 19:55 PT — Codex — reconciled the handoff after eleven additional merges; two intake drafts and the alert build remain gated; next: reconcile PR #127 with current main.
- 2026-10-02 20:10 PT — Codex — reconciled the handoff to current Git evidence; opened a documentation-only correction; next: hosted synthetic verification of PR #117.
