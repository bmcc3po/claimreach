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

- Outcome: keep deployed ClaimReach intake, delivery, decline, and partner-report workflows stable while finishing the held payroll/billing release and exact-matter firm portal; preserve the separate app-wide call-alert build for reconciliation.
- Definition of done: PR Digital access is activated only for Brett's approved audience and exact source scope; payroll/billing is reconciled with current decline/status and signature-report behavior and released only after explicit migration approval; firm reviewers see only the exact released matter through reviewed production RLS and bounded APIs; alert behavior is re-applied to the current canonical queue.

## Current state

- Main: `768a9a8ae1074d71bf8f1b1dd31cc9ee7dd7fe8f`.
- Four PRs merged in the last 24 hours: #167-#170. Main now uses one shared collapsible file-action header, includes a password-protected PR Digital report, keeps exact PR Digital source bindings current, and opens the report on a live summary.
- PR #168's standalone migration 0129 is recorded as applied with RLS verified. The access record remains inactive pending Brett's final audience and source-scope decision; no partner access should be activated before that approval.
- PRs #169-#170 report 72 explicitly reconciled PR Digital leads and a summary/detail view sharing the same matter scope. Main and all four PR heads have successful Cloudflare evidence; current-main Cloudflare completed successfully after #170.
- PR #162 is the active owner-only weekly payroll and billing build. Its original application head passed TypeScript, focused application/engine/database checks, synthetic desktop/mobile acceptance, and a 233-route Cloudflare preview. Its branch handoff is current.
- PR #162 is held: it is now 3 commits ahead and 8 behind main, remains conflicted, and must reconcile both the decline/status changes and newer signature-report/source-binding changes before eligibility or clawbacks can be trusted. Migration 0128 has not been applied and requires Brett's explicit approval after full re-verification. No real payroll period, invoice, payment, credit, clawback, or Wave correction was processed.
- Draft PR #136 remains the exact-matter firm security hold, 5 commits ahead and 25 behind main. Production RLS, bounded old API/write/storage paths, released packet paths, and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 107 behind main. Its historical hosted checks do not prove compatibility with the current queue and cadence.
- This documentation-only correction remains in draft PR #118. Main's AI_HANDOFF.md is obsolete; Git evidence, the corrected PR #162 branch handoff, and this correction are authoritative for current state.
- Smithers draft PR #14 is unchanged, green and mergeable, 25 commits ahead and 1 behind InnoDash main. Protected preview and live security setup remain unapproved and unverified.

## Work completed

- Merged and deployed ClaimReach PRs #167-#170 on main.
- Consolidated file actions into a shared collapsible header across owner and call views without changing schema, recipients, status model, or permissions.
- Added the scoped PR Digital report, exact source binding, automatic source synchronization, and a live summary. Access remains inactive pending Brett's approval.
- Refreshed both continuity records to reflect current main, the expanded payroll conflict surface, and the report activation gate.
- No runtime code, production permissions, partner access, payroll schema, invoices, funds, or client records were changed by this continuity update.

## Files and systems changed

- See merged ClaimReach PRs #167-#170 for current-main change sets.
- See held PR #162 for payroll/billing application code and migration 0128.
- See draft PR #136 for firm matter scoping and security boundaries.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all 13 connected repositories, 206 current branch names, all 27 open PR heads, recent commits, and repository workflow runs.
- Only ClaimReach had commit or branch-tip activity in the review window: four merged PRs and four main commits.
- No open PR head has a failed or stalled reported check. Reported checks are complete with success, neutral, or skipped conclusions; several older untouched PRs have no CI status rather than a failing run.
- ClaimReach main `768a9a8a` has successful Cloudflare deployment evidence. The latest automation heartbeat in the window also completed successfully.
- Production migration 0128, current-main payroll regression coverage, real payroll close, actual firm-role portal acceptance, alert behavior on current main, PR Digital partner activation, and live Smithers setup remain unverified or intentionally held.

## Active blockers or open questions

- PR Digital access must remain inactive until Brett approves the final audience and exact source scope.
- PR #162 must reconcile eight newer main commits and repeat its full application, database, build, and synthetic gates. Brett must then explicitly approve migration 0128 and the migration-before-code release order.
- PR #136 must finish the production RLS/API/storage and packet boundary, reconcile 25 newer main commits, and pass controlled firm-login denial/download acceptance before reviewer provisioning.
- PR #80 must be re-applied to the current queue/cadence behavior before release verification; Smithers still requires separate protected-preview and security approval.

## Next safe action

- Keep PR Digital access inactive and present Brett the exact audience and source scope for approval. After that decision, reconcile PR #162 onto current main and re-verify the decline/status plus signature-report/source-binding intersections without processing real money.

## Session log

- 2026-10-08 19:18 PT — Codex — reconciled continuity after four ClaimReach merges; PR Digital is deployed but intentionally inactive pending audience approval, while payroll is now 8 commits behind and still held; next: approve exact report scope, then reconcile and reverify payroll.
- 2026-10-07 19:38 PT — Codex — reconciled continuity after four ClaimReach merges and replaced PR #162's stale handoff; payroll conflicts with newer decline/status behavior and migration 0128 remains held; next: reconcile/reverify before explicit migration approval.
- 2026-10-06 19:14 PT — Codex — reconciled the handoff after seven ClaimReach merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: reconcile and acceptance-test PR #136 before provisioning.
- 2026-10-05 19:05 PT — Codex — reconciled the handoff after eleven merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: finish and acceptance-test PR #136 before provisioning.
- 2026-10-04 19:54 PT — Codex — reconciled the handoff after fourteen merges; firm matter isolation became the highest-severity release gate; next: reconcile and verify PR #136 under an actual firm role.
