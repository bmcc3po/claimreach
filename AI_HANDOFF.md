# AI Handoff

This file is the shared continuity record for Claude Code and ChatGPT/Codex. It is live operational state, not general documentation.

## Required agent behavior

- Read this file before changing code.
- Keep one concise current snapshot. Replace stale status instead of stacking conflicting sections.
- Update it before stopping, handing off, asking for help or saying work is complete.
- Record exact verification and leave one concrete next safe action.
- Keep only the five newest session-log entries.
- Never put secrets, credentials, payment data or client/claimant PII in this file.

## Current objective

- Keep released ClaimReach intake, payroll, delivery, decline and partner-report workflows stable.
- Review NETFLY review-blocker PR #202 and search PR #203 without sending, merging or widening access.
- Hold the unified-current-status/NETFLY-numbering branch until taxonomy, numbering, isolated staging and migrations receive explicit approval.
- Treat InnoDash's deployed browser-visible PIN gates as a security hold until server-side authorization and post-fix rotation are approved.

## Current state

- ClaimReach main remains `247e78d2a1c4d7eff62a4896bb566a3ae4945189`; no main runtime commit appeared in the past 24 hours.
- PR #202 makes missing saved client-details and signed-PDF reviews actionable before NETFLY firm delivery. Runtime source `78e57477` was one ahead/zero behind main; exact-head preview/checks passed. Server gates remain unchanged; no migration, production write or send is included. The branch handoff is corrected. Controlled authenticated no-send acceptance remains pending.
- Draft PR #203 adds authorized existing-NETFLY search by name, phone and lead number while excluding archived, foreign-tenant, wrong-campaign and ambiguous records. Runtime source `ecf13112` was one ahead/zero behind main; exact-head preview/checks passed. No claimant creation, message, schema, role, RLS or permission-definition change is included. It has an explicit Brett production-approval hold. The branch handoff is corrected.
- Branch `codex/unified-current-status` is four runtime/documentation commits ahead and zero behind main with no PR. It centralizes exact-matter current-status editing/history, authorized global file search and NETFLY numbering/alias work. Draft migrations 0130 and 0131 are NOT applied; no deployment, backfill, renumbering or production write occurred.
- Unified-status decisions remain open: complete descriptor/legacy taxonomy, whether archived NETFLY records receive new public numbers, identification or approval of an isolated app/database staging target and synthetic accounts, then separate migration/deployment approvals. Current recommendation is active-only numbering; the draft preview logic still models all records.
- Crissi completed six more successful health and drain runs on October 22, bringing recovery to 15 consecutive successful heartbeats after the 18-run interruption. Latest success is run 39881538185 at 6:01 PM Pacific on unchanged main. Relay/upstream cause remains unconfirmed.
- PR #199 remains held for current-main reconciliation/re-verification and separate migration 0130 approval in its own scope. Historical private notes must not be copied into marketer explanations.
- PR #198 reporting/owner-preview, PR #197 owner decline and payroll PR #162 are released; authenticated owner/partner or owner visual acceptance remains pending as previously recorded. No real decline, payroll close or money movement is authorized for testing.
- PR #136 firm security and PR #80 app-wide call alerts remain unreconciled with current main and unapproved for release.
- InnoDash main `71a6c33b` deployed an agent/pay access-list and PIN rotation change. Published static ops/pay pages contain literal PIN maps in browser-delivered HTML, and the Netlify project has no site password or team-login requirement. Treat every committed/deployed PIN as exposed. Departed-agent pages still accept administrative PINs. Do not rely on the current client-side gates to protect payroll or operations.
- Smithers PR #14, Casework PR #15, InnoDash signed-deal sync, NETFLY alert receipt/provenance, ClaimPoint live owner acceptance and claimreach-tmp authenticated QA retain their recorded holds.

## Work completed

- New PRs #202/#203 and the unified-current-status branch were built by other agents and remained unmerged/unreleased.
- InnoDash published the access-list/PIN change before this review.
- This review corrected InnoDash main and both new ClaimReach branch handoffs, then reconciled this shared record. It did not merge, deploy, run migrations, change permissions, rotate credentials, send messages, process money or alter client records.

## Verification performed

- Reviewed all connected default-branch commits, 255 branch tips, 31 open PR heads and workflows. Before the documentation-only corrections, no open PR head had a failed or stalled reported check; older heads with no status are not failed runs.
- PR #202 recorded clean TypeScript, 237-route Cloudflare packaging, focused interaction suites and both engines. Full suite was 185/203; all 18 failures reproduced on untouched main.
- PR #203 recorded clean TypeScript, 237-route Cloudflare packaging, focused route/privacy/navigation tests and both engines. Full suite was 186/203; all 17 failures matched the reproduced untouched-main baseline.
- Unified-current-status records TypeScript, focused status/search/UI/PGlite tests, both engines and local 83-table schema reconstruction. Six full-suite failures reproduce on main. Hosted authentication, grants and notifications remain unverified; no isolated hosted target was identified.
- Read-only Netlify evidence confirms InnoDash production is ready from exact runtime commit `71a6c33b`. Repository inspection confirms literal PIN values are shipped in client HTML; values are intentionally omitted here.
- All six October 22 Crissi health jobs and all six matching drain jobs passed.

## Active blockers or open questions

- Security decision: approve server-side InnoDash authorization and rotation of all exposed PIN values only after browser literals are removed and the fix is deployed.
- Unified status: Brett must confirm descriptor/legacy taxonomy, archived-record numbering policy and an isolated staging target; migrations 0130/0131 and application deployment need separate approval after hosted synthetic verification.
- PR #202 needs authenticated synthetic no-send acceptance.
- PR #203 needs authenticated privacy acceptance and Brett's explicit production approval.
- PR #199, PR Digital, owner decline/payroll, firm security, app-wide alerts, Smithers, Casework, signed-deal sync, ClaimPoint and claimreach-tmp retain their recorded gates.

## Next safe action

- First, prepare the InnoDash server-side authorization design and synthetic acceptance plan; after approval, remove credentials from browser assets, deploy, rotate all exposed values and verify current/departed/admin access without real payroll changes.
- For ClaimReach, identify or approve an isolated staging app/database with synthetic accounts, then verify unified status and numbering without applying production migrations or rewriting records.
- Keep PR #202 no-send and PR #203 no-merge/no-deploy until their separate acceptance and approval gates are met.
- Continue read-only Crissi monitoring and reopen relay diagnostics only if a failure recurs.

## Session log

- 2026-10-22 PT - Codex - found deployed browser-visible InnoDash PIN literals, documented the security hold, reconciled PRs #202/#203 and unified-status decisions, and verified Crissi reached 15 consecutive successes; next: approve server-side auth/rotation and isolated staging.
- 2026-10-21 PT - Codex - verified six more Crissi health and drain runs passed, bringing recovery to nine consecutive successful heartbeats; next: keep read-only watch.
- 2026-10-20 PT - Codex - recorded Crissi recovery after two additional failures and three consecutive successful health runs; cause remains unconfirmed.
- 2026-10-19 PT - Codex - reconciled NETFLY/received-date releases #200/#201 and held marketer DQ #199; recorded four further Crissi failures with drain unaffected.
- 2026-10-18 PT - Codex - recorded eight more Crissi failures, all relay_530, bringing the streak to 12 while drains passed.
