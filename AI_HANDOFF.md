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

- Outcome: keep released ClaimReach intake, payroll, delivery, decline, and partner-report workflows stable while finishing exact-matter firm security and reconciling the separate app-wide call-alert build.
- Definition of done: released payroll receives controlled owner acceptance without a real close; PR Digital access is activated only for Brett's approved audience and exact source scope; firm reviewers see only the exact released matter through reviewed production RLS and bounded APIs; alert behavior is re-applied to the current canonical queue.

## Current state

- Main: `4dc86c9f42c816810be461ac54be850401494869`.
- Twenty-seven PRs merged in the review window: #171-#196 plus #162. Main gained broad mobile/presentation and failure-recovery work, confirmed-save behavior across legacy forms and communications, touch/pen PDF editing, saved intake-agent attribution across delivery artifacts, and decline confirmation that does not claim success before persistence.
- Payroll PR #162 is released. Migration 0128 was explicitly approved, applied, and verified with owner-only RLS, no anonymous table/function access, an invoker close transaction, and empty history before release. Production deployment completed successfully with 236 Edge Function Routes.
- Payroll is count-only: no dollar amounts in the UI; prior-period chargebacks are separate and stay with the originally paid agent. No real payroll period, invoice, payment, credit, chargeback, or client decision was processed. Physical Safari and actual owner acceptance remain unverified.
- Current main has successful Cloudflare deployment, drain, crissi-health, and heartbeat evidence.
- PR Digital migration 0129 remains applied and RLS-verified. No later Git evidence activates partner access; keep it inactive pending Brett's final audience and source-scope decision.
- Draft PR #136 remains the exact-matter firm security hold, 5 commits ahead and 91 behind main, with conflicts. Production RLS, bounded old API/write/storage paths, released packet paths, and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 173 behind main. Its historical hosted checks do not prove compatibility with the current queue and cadence.
- This documentation-only correction remains in draft PR #118. Main's AI_HANDOFF.md is stale because it still describes PR #195 as pending even though #195 and #196 are merged; Git evidence and this correction are authoritative for current state.
- Smithers draft PR #14 has no runtime movement. It remains mergeable, one commit behind InnoDash main, and green at its exact head. Protected authenticated acceptance, live Supabase setup, and security reconciliation remain unapproved or unverified.

## Work completed

- Merged and deployed ClaimReach PRs #171-#196 plus payroll PR #162.
- Released count-only weekly payroll with separate prior-period chargebacks after applying and verifying migration 0128.
- Added broad mobile/readiness and honest-failure feedback so forms, file actions, communications, PDF editing, archive/admin tools, and questionnaire workflows preserve drafts and report success only after confirmed writes.
- Kept saved intake-agent attribution visible across file views, queues, dashboard, firm delivery, email, PDF, and CSV artifacts.
- Corrected continuity records only. This review did not merge, deploy, change permissions, activate partner access, process money, or alter client records.

## Files and systems changed

- See merged ClaimReach PRs #171-#196 and #162 for current-main change sets.
- See draft PR #136 for firm matter scoping and security boundaries.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all 13 connected repositories, 232 current branch names, all 26 open PR heads, recent commits, pull requests, and repository workflow runs.
- Only ClaimReach had commit or branch-tip activity in the review window.
- All 27 merged ClaimReach PR heads completed reported checks without failure. No open PR head has a failed or stalled reported check; several older untouched PRs have no CI status rather than a failing run.
- ClaimReach main `4dc86c9f` has successful Cloudflare, drain, crissi-health, and heartbeat evidence.
- Actual owner payroll acceptance, a real payroll close, PR Digital partner activation, actual firm-role portal acceptance, alert behavior on current main, and live Smithers integration remain unverified or intentionally held.

## Active blockers or open questions

- Payroll requires an actual owner-session visual acceptance on the released page. Do not close a real period or process money during acceptance.
- PR Digital access must remain inactive until Brett approves the final audience and exact source scope.
- PR #136 must reconcile 91 newer main commits, finish the production RLS/API/storage and packet boundary, and pass controlled firm-login denial/download acceptance before reviewer provisioning.
- PR #80 must be re-applied to the current queue/cadence behavior before release verification.
- Smithers still requires separate protected authenticated preview and security approval before live configuration.

## Next safe action

- Use an actual owner session to inspect the released payroll counts, filters, mobile layout, and CSV with synthetic or empty history only, without closing a real period. Keep PR Digital inactive until Brett approves its exact audience/scope; then separately reconcile PR #136, PR #80, and Smithers behind their existing gates.

## Session log

- 2026-10-09 19:48 PT — Codex — reconciled continuity after 27 ClaimReach merges; payroll and migration 0128 are released with green production evidence but no real owner acceptance, while PR Digital remains inactive pending scope approval; next: controlled owner payroll inspection without a real close.
- 2026-10-08 19:18 PT — Codex — reconciled continuity after four ClaimReach merges; PR Digital is deployed but intentionally inactive pending audience approval, while payroll was held for reconciliation; next: approve exact report scope, then reconcile and reverify payroll.
- 2026-10-07 19:38 PT — Codex — reconciled continuity after four ClaimReach merges and replaced PR #162's stale handoff; payroll conflicted with newer decline/status behavior and migration 0128 remained held; next: reconcile/reverify before explicit migration approval.
- 2026-10-06 19:14 PT — Codex — reconciled the handoff after seven ClaimReach merges and verified main deployed/healthy; firm RLS and packet boundaries remained the highest-severity release gate; next: reconcile and acceptance-test PR #136 before provisioning.
- 2026-10-05 19:05 PT — Codex — reconciled the handoff after eleven merges and verified main deployed/healthy; firm RLS and packet boundaries remained the highest-severity release gate; next: finish and acceptance-test PR #136 before provisioning.
