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

- Outcome: keep the deployed ClaimReach intake and firm-delivery workflow stable while finishing a safe, exact-matter firm portal; preserve the separate app-wide call-alert build for reconciliation.
- Definition of done: firm reviewers see and act only on the exact released matter through reviewed production RLS and bounded APIs, signed-original and generated-intake packet downloads work, actual firm-role acceptance passes, and authorized reviewer accounts are provisioned only after that evidence is recorded.

## Current state

- Main: `8e37ef0fe5c75ef44e213fca25b8a0d269bef195`.
- Seven PRs merged in the last 24 hours: #155-#161. Main now includes matter-scoped advisory file checks, callback file/contact scope checks, audited post-callback corrections, signed-only existing firm access, preserved delivery-recipient history, property-damage and treatment coaching, and a fix that takes signed INNO MVA files to office completion instead of looping to Retainer.
- Cloudflare reports main `8e37ef0f` deployed successfully on October 6 at 22:14 UTC with 231 Edge Function Routes. The latest Cloudflare check, drain, crissi-health, and scheduled heartbeat completed successfully.
- Draft PR #136 remains the active exact-matter firm security build. It is mergeable, 5 commits ahead and 17 behind main, with its recorded application, browser, preview, and isolated database checks green.
- PR #136 is still a security hold, not a release candidate. Production RLS still grants same-firm unreleased or aggregate rows; portal and Motel 6 consumers need safe projections; old API/write/storage paths need complete boundaries; released packet paths and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 99 behind main and now conflicts with main. Its historical hosted checks do not prove compatibility with the current canonical queue and cadence.
- This documentation-only correction remains in draft PR #118. Before this update it was 4 commits ahead and 43 behind main. Main's AI_HANDOFF.md is obsolete; Git evidence and this correction are authoritative for current state.
- Smithers draft PR #14 is unchanged, green and mergeable, 25 commits ahead and 1 behind InnoDash main. Protected preview and live security setup remain unapproved and unverified.

## Work completed

- Merged and deployed PRs #155-#161 on ClaimReach main.
- Closed the signed-INNO completion loop across the five call layouts without changing client data, signatures, delivery receipts, permissions, or server completion checks.
- Added safer file-review guidance, callback correction and scope checks, signed-only firm access, delivery-history preservation, and agent coaching on current main.
- Refreshed this documentation-only handoff without changing application code, deployment, schema, permissions, accounts, secrets, or client data.

## Files and systems changed

- See merged ClaimReach PRs #155-#161 for the current-main change sets.
- See draft PR #136 for firm matter scoping, document authorization, security inventory, and the test-only projection/RLS prototype.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all 13 connected repositories, current branch lists, all 26 open PR heads, recent commits, and repository workflow runs.
- Only ClaimReach had commit or branch-tip activity in the review window.
- No open PR head has a failed or stalled reported check. Reported checks are complete with success, neutral, or skipped conclusions; several older untouched PRs have no CI status rather than a failing run.
- Main `8e37ef0f` has successful Cloudflare deployment, drain, crissi-health, and heartbeat evidence.
- Actual firm-role acceptance, production RLS enforcement for the proposed boundary, released packet downloads, reviewer provisioning, alert behavior on current main, and live Smithers setup remain unverified.

## Active blockers or open questions

- PR #136 must finish the production RLS/API/storage boundary, replace raw-lead portal and Motel 6 consumers with safe projections, add exact released packet paths, reconcile 17 newer main commits, and pass controlled firm-login denial and download acceptance before rollout.
- No firm reviewer account should be provisioned until that gate passes. Exact reviewer emails are needed only after the gate succeeds.
- PR #80 is 99 commits behind and conflicted; it must be re-applied to the current queue/cadence behavior before release verification.
- Smithers PR #14 still requires Brett's approval for a separate protected preview before any live Supabase or hosting configuration.

## Next safe action

- Reconcile PR #136 onto current main, complete the bounded projection/RLS and packet-download path, rerun the full application/database/build gates, and perform controlled actual firm-role acceptance. Keep reviewer provisioning and portal links held until that evidence is recorded.

## Session log

- 2026-10-06 19:14 PT — Codex — reconciled the handoff after seven ClaimReach merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: reconcile and acceptance-test PR #136 before provisioning.
- 2026-10-05 19:05 PT — Codex — reconciled the handoff after eleven merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: finish and acceptance-test PR #136 before provisioning.
- 2026-10-04 19:54 PT — Codex — reconciled the handoff after fourteen merges; firm matter isolation became the highest-severity release gate; next: reconcile and verify PR #136 under an actual firm role.
- 2026-10-03 19:55 PT — Codex — reconciled the handoff after eleven additional merges; two intake drafts and the alert build remained gated; next: reconcile PR #127 with current main.
- 2026-10-02 20:10 PT — Codex — reconciled the handoff to current Git evidence; opened a documentation-only correction; next: hosted synthetic verification of PR #117.
