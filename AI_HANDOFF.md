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

- Outcome: keep deployed ClaimReach intake, delivery, and decline workflows stable while finishing the held payroll/billing release and the exact-matter firm portal; preserve the separate app-wide call-alert build for reconciliation.
- Definition of done: payroll/billing is reconciled with current decline/status behavior and released only after explicit migration approval; firm reviewers see only the exact released matter through reviewed production RLS and bounded APIs; alert behavior is re-applied to the current canonical queue; no protected rollout occurs before its evidence gate.

## Current state

- Main: `681a192e5563c09ada88cdbc852c01a9134cce2e`.
- Four PRs merged in the last 24 hours: #163-#166. Main now accepts the authorized NETFLY forwarding mailbox with preserved authentication checks, supports evidence-checked signed-file declines and drop-letter requests, synchronizes BMC/firm decline outcomes with terminal status, and exposes Signed and declined directly in the owner file-status menu.
- Current main has successful Cloudflare, drain, crissi-health, and heartbeat evidence. Live business-flow behavior beyond recorded synthetic checks remains unverified in this review.
- PR #162 is the active owner-only weekly payroll and billing build. Its original head passed TypeScript, focused application/engine/database checks, synthetic desktop/mobile acceptance, and a 233-route Cloudflare preview. Its branch handoff is now current.
- PR #162 is held: it is now 3 commits ahead and 4 behind main after the documentation correction, and conflicts with the newer decline/status changes that affect eligibility and prior-paid clawbacks. Migration 0128 has not been applied and requires Brett's explicit approval after reconciliation and full re-verification. No real payroll period, invoice, payment, credit, clawback, or Wave correction was processed.
- Draft PR #136 remains the exact-matter firm security hold, 5 commits ahead and 21 behind main. Production RLS, safe portal/Motel 6 projections, bounded old API/write/storage paths, released packet paths, and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 103 behind main. Its historical hosted checks do not prove compatibility with the current queue and cadence.
- This documentation-only correction remains in draft PR #118. Main's AI_HANDOFF.md is obsolete; Git evidence, the corrected PR #162 branch handoff, and this correction are authoritative for current state.
- Smithers draft PR #14 is unchanged, green and mergeable, 25 commits ahead and 1 behind InnoDash main. Protected preview and live security setup remain unapproved and unverified.

## Work completed

- Merged and deployed ClaimReach PRs #163-#166 on main.
- Added authenticated NETFLY-forward handling and corrected forwarded-field mapping.
- Added a durable, evidence-checked signed-decline and drop-letter workflow with synchronized terminal status and a direct owner file-status action.
- Replaced PR #162's obsolete handoff with its actual payroll/billing scope, verification, conflicts, migration gate, and next action.
- Refreshed this documentation-only continuity record without changing runtime code, production schema, permissions, accounts, secrets, funds, or client data.

## Files and systems changed

- See merged ClaimReach PRs #163-#166 for current-main change sets.
- See held PR #162 for payroll/billing application code and migration 0128.
- See draft PR #136 for firm matter scoping and security boundaries.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all 13 connected repositories, 202 current branch names, all 27 open PR heads, recent commits, and repository workflow runs.
- Only ClaimReach had commit or branch-tip activity in the review window.
- No open PR head has a failed or stalled reported check. Reported checks are complete with success, neutral, or skipped conclusions; several older untouched PRs have no CI status rather than a failing run.
- Main `681a192e` has successful Cloudflare deployment, drain, crissi-health, and heartbeat evidence.
- Production migration 0128, current-main payroll regression coverage, real payroll close, actual firm-role portal acceptance, alert behavior on current main, and live Smithers setup remain unverified.

## Active blockers or open questions

- PR #162 must reconcile four newer decline/status commits and repeat its full application/database/build/synthetic gates. Brett must then explicitly approve migration 0128 and the migration-before-code release order.
- PR #136 must finish the production RLS/API/storage and packet boundary, reconcile 21 newer main commits, and pass controlled firm-login denial/download acceptance before reviewer provisioning.
- PR #80 is 103 commits behind and must be re-applied to the current queue/cadence behavior before release verification.
- Smithers PR #14 still requires Brett's approval for a separate protected preview before live Supabase or hosting configuration.

## Next safe action

- First reconcile PR #162 onto current main and verify the decline/status and prior-paid clawback intersection without processing real money. Present the verified migration-before-code rollout for Brett's explicit approval. Keep PR #136, PR #80, reviewer provisioning, and Smithers live setup held behind their separate gates.

## Session log

- 2026-10-07 19:38 PT — Codex — reconciled continuity after four ClaimReach merges and replaced PR #162's stale handoff; payroll now conflicts with newer decline/status behavior and migration 0128 remains held; next: reconcile/reverify before explicit migration approval.
- 2026-10-06 19:14 PT — Codex — reconciled the handoff after seven ClaimReach merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: reconcile and acceptance-test PR #136 before provisioning.
- 2026-10-05 19:05 PT — Codex — reconciled the handoff after eleven merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: finish and acceptance-test PR #136 before provisioning.
- 2026-10-04 19:54 PT — Codex — reconciled the handoff after fourteen merges; firm matter isolation became the highest-severity release gate; next: reconcile and verify PR #136 under an actual firm role.
- 2026-10-03 19:55 PT — Codex — reconciled the handoff after eleven additional merges; two intake drafts and the alert build remained gated; next: reconcile PR #127 with current main.
