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

- Main: `947c9a9deed75de6fc23226b2e4ebfdc3f669c6f`.
- PR #198 merged and deployed October 15 with PR Digital receipt-date cohorts, revised progress/loss and conversion metrics, filtered client detail/CSV, and an owner-only exact-scope report toggle. The release changes no partner grants, RLS, schema, records, messages, or delivery clocks. Actual signed-in desktop/mobile acceptance remains pending.
- The earlier PR #197 owner-decline fix is released; actual authorized owner-session submission/acceptance still lacks recorded confirmation.
- Payroll PR #162 is released. Migration 0128 was explicitly approved, applied, and verified with owner-only RLS, no anonymous table/function access, an invoker close transaction, and empty history before release. Production deployment completed successfully with 236 Edge Function Routes.
- Payroll is count-only: no dollar amounts in the UI; prior-period chargebacks are separate and stay with the originally paid agent. No real payroll period, invoice, payment, credit, chargeback, or client decision was processed. Physical Safari and actual owner acceptance remain unverified.
- Current main remains deployed, but Crissi's previously recovered health failure has recurred. The four latest October 17/18 UTC heartbeats failed crissi-health at 18:46, 21:03, 23:05 and 01:00: HTTP 200, both direct/proxy answers empty, direct.error=relay_525. All four drain jobs succeeded. Earlier runs passed; no later recovery is recorded. Do not describe the AI service as currently verified healthy or infer that PR #198 caused or fixed the failure.
- PR Digital migration 0129 remains previously recorded as applied/RLS-verified. PR #198 adds reporting and owner preview, not new access grants. Production report assets loaded and unauthenticated APIs denied access; approved audience/source scope and authenticated partner behavior must be verified rather than inferred from the deployment. Preview APIs returned 503 in the recorded rehearsal, while production unauthenticated APIs returned 401.
- Draft PR #136 remains the exact-matter firm security hold, 5 commits ahead and 96 behind main, with conflicts. Production RLS, bounded old API/write/storage paths, released packet paths, and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 178 behind main. Its historical hosted checks do not prove compatibility with the current queue and cadence.
- This documentation-only correction remains in draft PR #118, now 122 commits behind main and conflicted. Main's AI_HANDOFF.md is stale because it still describes earlier saved-agent work as pending even though PRs #195-#198 are merged; Git evidence and this correction are authoritative for current state.
- Smithers draft PR #14 has no runtime movement. It remains two commits behind InnoDash main; its exact-head reported checks have no failure, but a canceled preview status is not proof of a working protected deployment. Protected authenticated acceptance, live Supabase setup, and security reconciliation remain unapproved or unverified.

## Work completed

- PR #198 was merged and deployed with 237 Edge Function Routes after separately recorded release approval. This review did not perform that release.
- Released count-only weekly payroll with separate prior-period chargebacks after applying and verifying migration 0128.
- Added broad mobile/readiness and honest-failure feedback so forms, file actions, communications, PDF editing, archive/admin tools, and questionnaire workflows preserve drafts and report success only after confirmed writes.
- Kept saved intake-agent attribution visible across file views, queues, dashboard, firm delivery, email, PDF, and CSV artifacts.
- Corrected continuity records only. This review did not merge, deploy, change permissions, activate partner access, submit a real decline, process money, or alter client records.

## Files and systems changed

- See merged ClaimReach PR #198 for the latest report/owner-preview change set and earlier PRs for intake, delivery, decline and payroll releases.
- See draft PR #136 for firm matter scoping and security boundaries.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all connected repositories, current branch tips and open PR heads, recent commits, workflow runs, and the four latest failed Crissi job logs.
- ClaimPoint has new isolated hosting/login/navigation work on claimpoint/hosting-adapters. ClaimReach has no new runtime code; the current material issue is its recurring Crissi health failure.
- PR #198 records clean TypeScript, 19 reporting/filter/preview regressions, signature-report 17, partner isolation, MVA engine 71 and intake engine 78, synthetic rendering checks, and successful Cloudflare packaging/production deployment. These source tests were not rerun by this documentation review. No open PR head has a failed or stalled reported check; older untouched heads without CI status are not failed runs.
- Main `947c9a9d` had four successful heartbeats earlier in the window followed by four failures limited to crissi-health. Open PR heads have no failed or stalled reported check. These facts are separate from the main workflow failures.
- Actual owner decline submission, owner payroll acceptance, a real payroll close, PR Digital partner activation, actual firm-role portal acceptance, alert behavior on current main, and live Smithers integration remain unverified or intentionally held.

## Active blockers or open questions

- Crissi's four latest health checks return empty answers with relay_525, despite a responding HTTP endpoint and successful drain jobs. Relay/upstream cause and recovery remain unverified; do not replay queues or rotate credentials without approval.
- The released owner-decline fix still requires submission and confirmation through the actual authorized owner session. Do not impersonate an owner or submit a real decision during automated verification.
- Payroll requires an actual owner-session visual acceptance on the released page. Do not close a real period or process money during acceptance.
- PR Digital needs actual owner and authorized-partner desktop/mobile acceptance of identical date/list/CSV scope, toggle return behavior, and denied non-owner access. This report release does not itself approve or widen audience/source scope.
- PR #136 must reconcile 96 newer main commits, finish the production RLS/API/storage and packet boundary, and pass controlled firm-login denial/download acceptance before reviewer provisioning.
- PR #80 must be re-applied to the current queue/cadence behavior before release verification.
- Smithers still requires separate protected authenticated preview and security approval before live configuration.

## Next safe action

- First inspect the Crissi relay/upstream connectivity and deployment logs read-only from an approved environment, using the four failed workflow references; establish a successful answer before declaring recovery. No queue replay, live client prompt, permissions or configuration change is authorized by this review. PR Digital's synthetic authenticated desktop/mobile acceptance remains the separate next product gate; retain owner decline/payroll and firm-security/call-alert/Smithers holds.

## Session log

- 2026-10-17 19:53 PT - Codex - recorded four consecutive recurring relay_525 Crissi failures with drain unaffected; corrected the stale recovered-health state; next: read-only relay/upstream diagnostics before claiming recovery.
- 2026-10-15 19:22 PT - Codex - reconciled the PR Digital #198 release and exact owner preview; recorded two earlier relay_525 failures followed by four successful heartbeats without inferring a causal fix; next: secure authenticated desktop/mobile report acceptance.
- 2026-10-10 19:24 PT - Codex - reconciled continuity after PR #197 restored authorized owner-decline persistence without weakening the private dispatch-table boundary; main is deployed and healthy, but actual owner submission remains pending; next: verify the decline through the real owner session.
- 2026-10-09 19:48 PT — Codex — reconciled continuity after 27 ClaimReach merges; payroll and migration 0128 are released with green production evidence but no real owner acceptance, while PR Digital remains inactive pending scope approval; next: controlled owner payroll inspection without a real close.
- 2026-10-08 19:18 PT — Codex — reconciled continuity after four ClaimReach merges; PR Digital is deployed but intentionally inactive pending audience approval, while payroll was held for reconciliation; next: approve exact report scope, then reconcile and reverify payroll.
