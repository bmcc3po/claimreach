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

- Outcome: finish a safe, exact-matter firm portal without weakening the now-live INNO, NETFLY, signed-delivery, navigation, archive, reporting, and firm-decision workflows; keep the separate app-wide call-alert build visible.
- Definition of done: firm reviewers see and act only on the exact released matter through reviewed production RLS and bounded APIs, packet downloads work, actual firm-role acceptance passes, and authorized reviewer accounts are provisioned only after that evidence is recorded.

## Current state

- Main: `ec322b0a59e6fc68b7e65189245905c00ef72d86`.
- Eleven PRs merged in the last 24 hours: #133 and #145-#154. Main now includes simplified navigation, explicit signed/invoice reporting, unified signed-and-sent status, archive filtering and test-file recovery, agent-guide updates, firm decisions, clearer file navigation, owner NETFLY resume, and correct intake entry for new or reopened MVA/NETFLY files.
- Cloudflare reports main `ec322b0a` deployed successfully on October 5 at 22:30 UTC. Its Cloudflare check, drain, crissi-health, and all three scheduled heartbeat runs in the review window completed successfully.
- Draft PR #136 now has five commits of exact-matter firm document protections and a green Netlify/Cloudflare preview. It is mergeable, 5 commits ahead and 10 behind main. TypeScript, 16 document-route tests, 9 firm-page tests, 3 actual workbench component checks, both engine suites, synthetic browser isolation/retry checks, and 26 isolated PostgreSQL policy/projection checks are recorded as passing.
- PR #136 is still a security hold, not a release candidate. Production RLS still grants same-firm unreleased or aggregate rows; portal and Motel 6 consumers need safe projections; old API/write/storage paths need complete boundaries; the released document list still needs signed-original and generated-intake packets; no actual firm-role packet-download acceptance has passed.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 92 behind main. Hosted checks are green, but it is not release-ready against the current canonical queue and cadence implementation.
- This documentation-only correction remains in draft PR #118. Main's AI_HANDOFF.md is still obsolete; Git evidence and this correction are authoritative for current state.

## Work completed

- Merged and deployed the owner/agent workflow improvements listed above through main `ec322b0a`.
- Added a restricted campaign firm inbox and matter-bound review decisions without provisioning reviewer accounts.
- Strengthened draft firm isolation by denying claim-null legacy documents to firm users, removing broad workbench actions and raw call/audit payloads, making firm document access read-only, and adding visible failure recovery.
- Updated this handoff to current Git evidence without changing application code, deployment, schema, permissions, accounts, or secrets.

## Files and systems changed

- See merged PR #133 and PRs #145-#154 for current-main change sets.
- See draft PR #136 for firm matter scoping, document authorization, security inventory, and test-only projection/RLS prototype.
- See draft PR #80 for the isolated app-wide alert implementation.

## Verification performed

- Reviewed all 13 connected repositories, 190 branch names covering 189 unique tips, 126 recent PR records, all 19 open PR heads, and repository workflow runs.
- Only ClaimReach had branch-tip or main activity in the review window.
- Every reported check on open PR heads was complete with success, neutral, or skipped conclusion; several older untouched PRs have no CI status rather than a failing run.
- Main `ec322b0a` has successful Cloudflare deployment, drain, crissi-health, and heartbeat evidence.
- Actual firm-role acceptance, production RLS enforcement for the proposed boundary, packet downloads, reviewer provisioning, and live owner-session coverage remain unverified.

## Active blockers or open questions

- PR #136 must finish the production RLS/API/storage boundary, replace raw-lead portal and Motel 6 consumers with safe projections, add exact released packet paths, reconcile 10 newer main commits, and pass controlled firm-login denial and download acceptance before rollout.
- No firm reviewer account should be provisioned until that gate passes. Exact Carol/team reviewer emails are still required afterward.
- PR #80 is 92 commits behind and must be re-applied to the current queue/cadence behavior before release.
- Smithers PR #14 is unchanged, green, mergeable, 25 commits ahead and 1 behind InnoDash main; protected preview and security setup still require separate approval.

## Next safe action

- Finish PR #136's bounded projection/RLS design and signed/intake packet path, reconcile it onto current main, rerun its full application/database/build gates, and perform controlled actual firm-role acceptance. Keep reviewer provisioning and portal links held until that evidence is recorded.

## Session log

- 2026-10-05 19:05 PT — Codex — reconciled the handoff after eleven merges and verified main deployed/healthy; firm RLS and packet boundaries remain the highest-severity release gate; next: finish and acceptance-test PR #136 before provisioning.
- 2026-10-04 19:54 PT — Codex — reconciled the handoff after fourteen merges; firm matter isolation became the highest-severity release gate; next: reconcile and verify PR #136 under an actual firm role.
- 2026-10-03 19:55 PT — Codex — reconciled the handoff after eleven additional merges; two intake drafts and the alert build remained gated; next: reconcile PR #127 with current main.
- 2026-10-02 20:10 PT — Codex — reconciled the handoff to current Git evidence; opened a documentation-only correction; next: hosted synthetic verification of PR #117.
