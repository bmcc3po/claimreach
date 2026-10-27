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

- Verify the October 26 NETFLY retainer-exception release through authenticated, no-send production paths.
- Complete the final real-Auth and dashboard-link gates for draft PR #204 without applying production migrations, merging or deploying.
- Keep Crissi under read-only watch after recovery from two `relay_525` interruptions.
- Treat InnoDash's deployed browser-visible PIN gates as a security hold until server-side authorization and post-fix rotation are approved.

## Current state

- ClaimReach main is `20e011555baa2b7418f874821886b5cf2f4ddcaf`. PR #205 merged on October 26 and the exact revision has a successful Cloudflare production deployment.
- PR #205 replaces separate saved handoff/retainer review barriers with one final attestation. Missing or unverified retainers require an explicit warning decision, an honest warning email and a mandatory attempt-scoped audit. Existing tenant, role, hold, integrity, stale-snapshot and idempotency gates remain.
- PR #205 passed TypeScript, 237-route Cloudflare packaging, both engine suites and 55 delivery tests. The full suite passed 188/205 with the same 17 documented baseline failures. Tests used synthetic data and a stubbed provider. Authenticated live no-send acceptance remains pending.
- Draft PR #204 is nine commits ahead and zero behind main at `deff9e901db1407ab1882e568b289179dabd3693`. It includes current production, repairs the pilot middleware exception for `/api/current-status` and handles non-JSON failures safely.
- PR #204's exact head has successful Cloudflare Pages, Netlify and `status-tests` evidence. Its isolated backend was reconstructed to the intended schema, ownership, ACL, RLS and default-privilege baseline. Migrations 0130/0131 were applied only there. Synthetic database-role/JWT tests passed.
- No production migration, backfill, renumbering, merge or deployment occurred for PR #204. It still needs a real Auth-issued hosted browser retest and dashboard direct-link fallback review.
- Five consecutive Crissi health and drain cycles passed on October 26 after the two October 25 `relay_525` failures. Recovery is holding, but the earlier relay/upstream cause remains unconfirmed.
- PR #199 remains held for current-main reconciliation/re-verification and separate migration 0130 approval. PR #136 firm security and PR #80 app-wide call alerts remain unreconciled with current main and unapproved for release.
- InnoDash main `71a6c33b` still ships literal PIN maps in browser-delivered ops/pay HTML, and the Netlify project has no site password or team-login requirement. Treat every committed/deployed PIN as exposed.
- A new private `ii-bee` connector repository was created and security-hardened with per-app access scopes, explicit sharing, encrypted Bee login, passphrase lockout and a shared notebook/review log. It has no `AI_HANDOFF.md` and no GitHub deployment/check evidence.

## Work completed

- PR #205 merged and the resulting main revision deployed successfully to Cloudflare production.
- PR #204 integrated current production, recovered its isolated backend, passed its current hosted checks and fixed the agent current-status route/access error path.
- Crissi returned five clean health/drain cycles.
- The October 26 review covered 14 repositories, 259 branch tips and 30 open PR heads. No open PR head had a failed or stalled reported check. ClaimPoint PRs #1-#5 still have no reported checks and are not labeled as failures.
- This continuity update is documentation-only. It did not merge, deploy, replay queues, alter credentials, apply production migrations, change permissions, send messages, process money or alter client records.

## Verification performed

- Exact ClaimReach main `20e0115` has a successful Cloudflare Pages production deployment.
- PR #204 is nine commits ahead and zero behind main. Its exact head passed Cloudflare Pages, Netlify and the status/auth/intake regression workflow.
- The isolated PR #204 database matched the intended schema, function ownership, ACL, policy and default-privilege baseline. Hosted synthetic status, permissions, tenant, history, archive, numbering and stale-save tests passed.
- Five October 26 Crissi health jobs and all matching drain jobs passed.

## Active blockers or open questions

- PR #205 needs authenticated production acceptance through non-mutating, no-send paths.
- PR #204 needs a real Auth-issued hosted browser retest and dashboard direct-link fallback review. After those gates, Brett must separately approve production migrations 0130/0131, merge and deployment.
- Security decision: approve server-side InnoDash authorization and rotation of exposed PIN values only after browser literals are removed and the fix is deployed.
- The `ii-bee` connector lacks a durable handoff and GitHub-visible deployment verification. Do not inspect or copy Bee transcript content for continuity reporting.

## Next safe action

- Run the authenticated no-send production acceptance for PR #205.
- Use synthetic real Auth-issued owner and non-owner sessions against the successful isolated PR #204 deployment, then review the dashboard direct-link fallback. Keep the PR draft and production migrations unapplied.
- Continue read-only Crissi health/drain watch.
- For `ii-bee`, perform a redacted metadata-only connector smoke test and add a durable handoff in a future approved change without reading or storing transcript content.

## Session log

- 2026-10-26 PT - Codex - verified PR #205 merged/deployed, PR #204's isolated recovery and green checks, five clean Crissi cycles and the new security-hardened `ii-bee` repository; next: authenticated no-send NETFLY acceptance and real-Auth synthetic PR #204 retest.
- 2026-10-25 PT - Codex - found no code movement, isolated two consecutive Crissi `relay_525` failures after a 33-success recovery streak and confirmed every drain job passed; next: read-only relay/upstream diagnostics with no queue replay or credential change.
- 2026-10-24 PT - Codex - verified PRs #202/#203 merged and deployed, PR #204 opened preview-green with migrations held, and seven more Crissi cycles brought recovery to 28; next: authenticated no-send QA and exact staging ACL reconstruction before separate release approval.
- 2026-10-23 PT - Codex - found no runtime or branch-tip movement, verified six more Crissi health/drain cycles for 21 consecutive successes and confirmed the InnoDash browser-credential hold remains; next: approve server-side auth/rotation and isolated staging.
- 2026-10-22 PT - Codex - found deployed browser-visible InnoDash PIN literals, documented the security hold, reconciled PRs #202/#203 and unified-status decisions, and verified Crissi reached 15 consecutive successes; next: approve server-side auth/rotation and isolated staging.
