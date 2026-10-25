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

- Keep the October 24 NETFLY review guidance and authorized existing-client search release stable.
- Complete the remaining hosted authorization/ACL gates for draft PR #204 without applying migrations, merging or deploying.
- Treat InnoDash's deployed browser-visible PIN gates as a security hold until server-side authorization and post-fix rotation are approved.

## Current state

- ClaimReach main is `aeb72d79ade80214a7dd22706e53d6b967c5916c`. PR #202 and PR #203 merged on October 24, and Cloudflare production deployment of that exact revision reports success.
- PR #202 adds actionable saved client-details and signed-PDF review guidance before NETFLY firm delivery. PR #203 adds authorized existing-NETFLY search while preserving firm/campaign scope and exclusions for archived, wrong-campaign, foreign-tenant and ambiguous results.
- No migration, claimant creation, message or production case-data write was part of PR #202/#203. Authenticated production acceptance remains pending and must not send a packet or mutate a claimant record.
- Draft PR #204 is five commits ahead and zero behind main at runtime head `a737fa58`. It unifies current status/history, reporting evidence, authorized global file search and NETFLY numbering/aliases, while preserving the deployed #202/#203 fixes.
- PR #204 has successful Cloudflare and Netlify previews, clean TypeScript, 240-route Cloudflare packaging and 187/192 test files passing; its five remaining failures reproduce on unchanged production main.
- Draft migrations 0130 and 0131 are NOT applied. No production backfill, renumbering, migration, merge or deployment occurred. Remaining gates are real hosted browser tests using Auth-issued sessions and exact staging helper-function ACL reconstruction.
- Crissi completed seven more successful health and drain runs on October 24, bringing recovery to 28 consecutive successful heartbeats after the 18-run interruption. Latest success is run 40145907631 at 5:14 PM Pacific on current main. Relay/upstream cause remains unconfirmed.
- PR #199 remains held for current-main reconciliation/re-verification and separate migration 0130 approval in its own scope. Historical private notes must not be copied into marketer explanations.
- PR #198 reporting/owner-preview, PR #197 owner decline and payroll PR #162 are released; authenticated owner/partner or owner visual acceptance remains pending as previously recorded. No real decline, payroll close or money movement is authorized for testing.
- PR #136 firm security and PR #80 app-wide call alerts remain unreconciled with current main and unapproved for release.
- InnoDash main `71a6c33b` still ships literal PIN maps in browser-delivered ops/pay HTML, and the Netlify project has no site password or team-login requirement. Treat every committed/deployed PIN as exposed. Do not rely on the current client-side gates to protect payroll or operations.
- Smithers PR #14, Casework PR #15, InnoDash signed-deal sync, NETFLY alert receipt/provenance, ClaimPoint live owner acceptance and claimreach-tmp authenticated QA retain their recorded holds.

## Work completed

- PR #202 and PR #203 merged and the resulting main revision deployed successfully to Cloudflare production.
- Draft PR #204 integrated the production release and opened with successful hosted previews while keeping migrations 0130/0131 unapplied.
- This review verified the release, all active branch/check evidence and seven additional Crissi cycles, then corrected documentation only. It did not merge, deploy, apply migrations, change permissions, send messages, process money or alter client records.

## Verification performed

- Reviewed 13 repositories, 257 branch tips, 30 open PR heads and workflows for the past 24 hours. No open PR head had a failed or stalled reported check. ClaimPoint PRs #1-#5 still have no reported checks and are not labeled as failures.
- Exact ClaimReach main `aeb72d7` has a successful Cloudflare Pages production check.
- PR #204 is five commits ahead/zero behind main and its exact head has successful Cloudflare and Netlify preview evidence. TypeScript and 240-route packaging passed; 187/192 test files passed and the five remaining failures match production main.
- All seven October 24 Crissi health jobs and all seven matching drain jobs passed; recovery is now 28 consecutive successful heartbeats.

## Active blockers or open questions

- Security decision: approve server-side InnoDash authorization and rotation of all exposed PIN values only after browser literals are removed and the fix is deployed.
- PR #202/#203 need authenticated production acceptance using non-mutating, no-send paths.
- PR #204 needs Auth-issued hosted browser tests and exact staging helper ACL reconstruction. After those gates, Brett must separately approve migrations 0130/0131, merge and production deployment.
- PR #199, PR Digital, owner decline/payroll, firm security, app-wide alerts, Smithers, Casework, signed-deal sync, ClaimPoint and claimreach-tmp retain their recorded gates.

## Next safe action

- Verify PR #202/#203 in an authenticated production session without sending a packet or altering a claimant record.
- Reconstruct the exact staging helper ACLs and run PR #204 with synthetic Auth-issued owner/non-owner sessions; keep it draft and leave migrations unapplied until Brett's separate release approval.
- For InnoDash, prepare the server-side authorization design and synthetic acceptance plan; rotate exposed values only after the fix is deployed.
- Continue read-only Crissi monitoring and reopen relay diagnostics only if a failure recurs.

## Session log

- 2026-10-24 PT - Codex - verified PRs #202/#203 merged and deployed, PR #204 opened preview-green with migrations held, and seven more Crissi cycles brought recovery to 28; next: authenticated no-send QA and exact staging ACL reconstruction before separate release approval.
- 2026-10-23 PT - Codex - found no runtime or branch-tip movement, verified six more Crissi health/drain cycles for 21 consecutive successes and confirmed the InnoDash browser-credential hold remains; next: approve server-side auth/rotation and isolated staging.
- 2026-10-22 PT - Codex - found deployed browser-visible InnoDash PIN literals, documented the security hold, reconciled PRs #202/#203 and unified-status decisions, and verified Crissi reached 15 consecutive successes; next: approve server-side auth/rotation and isolated staging.
- 2026-10-21 PT - Codex - verified six more Crissi health and drain runs passed, bringing recovery to nine consecutive successful heartbeats; next: keep read-only watch.
- 2026-10-20 PT - Codex - recorded Crissi recovery after two additional failures and three consecutive successful health runs; cause remains unconfirmed.
