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

- Main: `247e78d2a1c4d7eff62a4896bb566a3ae4945189`.
- PRs #200 and #201 merged October 19. Lead list/board and all Call Desk queues/search show received dates; NETFLY source intake attachments or preserved original email notes remain separate from the signed retainer and join the final packet. Existing-file save is scoped/idempotent, and adding intake refreshes packet preview. Main Cloudflare check completed successfully at 23:52 UTC. Live existing-file backfill and actual owner acceptance remain unverified; do not test with real sends.
- PR #199 adds dedicated marketer-facing DQ explanations, reason drilldown and atomic call/status closure. Preview checks pass, but migration 0130 is written, NOT applied. Runtime source is 1 ahead/5 behind main. Reconcile and repeat focused synthetic gates before separately approved migration-before-code release. Payroll 0128 is already released, not a dependency hold.
- PR #198 merged and deployed October 15 with PR Digital receipt-date cohorts, revised progress/loss and conversion metrics, filtered client detail/CSV, and an owner-only exact-scope report toggle. The release changes no partner grants, RLS, schema, records, messages, or delivery clocks. Actual signed-in desktop/mobile acceptance remains pending.
- The earlier PR #197 owner-decline fix is released; actual authorized owner-session submission/acceptance still lacks recorded confirmation.
- Payroll PR #162 is released. Migration 0128 was explicitly approved, applied, and verified with owner-only RLS, no anonymous table/function access, an invoker close transaction, and empty history before release. Production deployment completed successfully with 236 Edge Function Routes.
- Payroll is count-only: no dollar amounts in the UI; prior-period chargebacks are separate and stay with the originally paid agent. No real payroll period, invoice, payment, credit, chargeback, or client decision was processed. Physical Safari and actual owner acceptance remain unverified.
- Crissi's 16-run failure streak extended by two more failures on October 20, then recovered and has now completed nine consecutive successful main heartbeats through October 21 at 5:44 PM Pacific. The latest run is 39701518510 on main 247e78d2. All six new drain jobs passed. Recovery is sustained, but the relay/upstream cause remains unconfirmed; do not infer that PRs #200/#201 caused or fixed it.
- PR Digital migration 0129 remains previously recorded as applied/RLS-verified. PR #198 adds reporting and owner preview, not new access grants. Production report assets loaded and unauthenticated APIs denied access; approved audience/source scope and authenticated partner behavior must be verified rather than inferred from the deployment. Preview APIs returned 503 in the recorded rehearsal, while production unauthenticated APIs returned 401.
- Draft PR #136 remains the exact-matter firm security hold, 5 commits ahead and 101 behind main, with conflicts. Production RLS, bounded old API/write/storage paths, released packet paths, and controlled actual firm-role denial/download acceptance remain incomplete.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 183 behind main. Its historical hosted checks do not prove compatibility with the current queue and cadence.
- This documentation-only correction remains in draft PR #118, now 127 commits behind main and conflicted. Main's AI_HANDOFF.md is stale because it still describes earlier saved-agent work as pending even though PRs #195-#198 are merged; Git evidence and this correction are authoritative for current state.
- Smithers draft PR #14 has no runtime movement. It remains two commits behind InnoDash main; its exact-head reported checks have no failure, but a canceled preview status is not proof of a working protected deployment. Protected authenticated acceptance, live Supabase setup, and security reconciliation remain unapproved or unverified.

## Work completed

- PRs #200/#201 merged; exact-head previews and main 247e78d2 Cloudflare deployment succeeded. PR #200 records 237 routes. PR #201 still requires live backfill acceptance; preview/build success is not permission to save or send real files. This review did not perform either release.
- Released count-only weekly payroll with separate prior-period chargebacks after applying and verifying migration 0128.
- Added broad mobile/readiness and honest-failure feedback so forms, file actions, communications, PDF editing, archive/admin tools, and questionnaire workflows preserve drafts and report success only after confirmed writes.
- Kept saved intake-agent attribution visible across file views, queues, dashboard, firm delivery, email, PDF, and CSV artifacts.
- Corrected continuity records only. This review did not merge, deploy, change permissions, activate partner access, submit a real decline, process money, or alter client records.

## Files and systems changed

- See merged PRs #200/#201 for received dates and NETFLY original-source packets; open PR #199 for marketer-safe DQ explanation work. PR #198 remains the released report/owner-preview baseline.
- See draft PR #136 for firm matter scoping and security boundaries.
- See draft PR #80 for the isolated app-wide alert implementation.
- See InnoDash draft PR #14 for the Smithers continuity control plane.

## Verification performed

- Reviewed all connected default-branch commits, 252 branch tips, 29 open PR heads and workflows. No branch tip changed in the past 24 hours, no open PR head has a failed or stalled reported check, and all six new Crissi health plus drain jobs passed. No runtime source tests were rerun during this docs-only review.
- Read src/lib/ai-relay.ts: relay_<status> is returned when the direct relay HTTP response is not successful. This localizes relay_530 to that upstream hop; it does not establish its root cause, current configured URL, or recovery.
- PR #198 records clean TypeScript, 19 reporting/filter/preview regressions, signature-report 17, partner isolation, MVA engine 71 and intake engine 78, synthetic rendering checks, and successful Cloudflare packaging/production deployment. These source tests were not rerun by this documentation review. No open PR head has a failed or stalled reported check; older untouched heads without CI status are not failed runs.
- PR #199's recorded TypeScript, Cloudflare 237-route build, 33 focused checks, PGlite transaction and iPhone synthetic browser gates passed. Full runner was 187/203 versus baseline 185/202, with 16 documented pre-existing failures, not an all-green suite. Exact-head hosted checks have no failure. Crissi and drain workflows are now passing; the earlier relay failures remain cause-unconfirmed.
- Actual owner decline submission, owner payroll acceptance, a real payroll close, PR Digital partner activation, actual firm-role portal acceptance, alert behavior on current main, and live Smithers integration remain unverified or intentionally held.

## Active blockers or open questions

- Crissi has nine consecutive successful health checks after 18 consecutive failures. Treat service health as recovered but cause-unconfirmed; preserve the failure references and resume read-only diagnostics only if failures recur. No queue replay, client prompts, credentials or configuration changes.
- PR #199 requires current-main reconciliation and re-verification, then Brett's separate approval for migration 0130 before runtime release. Historical private notes must not be copied into marketer explanations.
- The released owner-decline fix still requires submission and confirmation through the actual authorized owner session. Do not impersonate an owner or submit a real decision during automated verification.
- Payroll requires an actual owner-session visual acceptance on the released page. Do not close a real period or process money during acceptance.
- PR Digital needs actual owner and authorized-partner desktop/mobile acceptance of identical date/list/CSV scope, toggle return behavior, and denied non-owner access. This report release does not itself approve or widen audience/source scope.
- PR #136 must reconcile 101 newer main commits, finish the production RLS/API/storage and packet boundary, and pass controlled firm-login denial/download acceptance before reviewer provisioning.
- PR #80 must be re-applied to the current queue/cadence behavior before release verification.
- Smithers still requires separate protected authenticated preview and security approval before live configuration.

## Next safe action

- Crissi now has nine verified successful answers; preserve https://github.com/bmcc3po/claimreach/actions/runs/39427010651 as the last pre-recovery failure reference and investigate read-only only if failures recur. No queue replay, live client prompt, permissions or configuration change is authorized by this review. PR Digital's synthetic authenticated desktop/mobile acceptance remains the separate next product gate; retain owner decline/payroll and firm-security/call-alert/Smithers holds.

## Session log

- 2026-10-21 PT - Codex - verified six more Crissi health and drain runs passed, bringing recovery to nine consecutive successful heartbeats; no new runtime or branch-tip activity; next: keep read-only watch and reopen diagnostics only on recurrence.
- 2026-10-20 PT - Codex - recorded Crissi recovery after two additional failures and three consecutive successful health runs; cause remains unconfirmed; next: keep failure evidence and reopen read-only diagnostics only on recurrence.
- 2026-10-19 PT - Codex - reconciled NETFLY/received-date releases #200/#201 and held marketer DQ #199; recorded four further Crissi failures with drain unaffected; next: read-only relay diagnostics, while DQ needs current-main re-verification before migration approval.
- 2026-10-18 PT - Codex - recorded eight more Crissi failures, all relay_530, bringing the streak to 12 while drains pass; read relay status mapping without invoking it; next: approved read-only upstream diagnostics and verified successful answer.
- 2026-10-17 19:53 PT - Codex - recorded four consecutive recurring relay_525 Crissi failures with drain unaffected; corrected the stale recovered-health state; next: read-only relay/upstream diagnostics before claiming recovery.
