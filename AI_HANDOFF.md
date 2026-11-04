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
- Draft PR #204 is ten commits ahead and zero behind main at `ee21685f96ed2ce6ee62d3455272a60329932a69`; runtime head `deff9e901db1407ab1882e568b289179dabd3693` is followed by one documentation-only handoff commit. It includes current production, repairs the pilot middleware exception for `/api/current-status` and handles non-JSON failures safely.
- PR #204's exact head `ee21685f96ed2ce6ee62d3455272a60329932a69` has successful Cloudflare Pages and Netlify preview evidence; runtime head `deff9e9` passed `status-tests`. Its isolated backend was reconstructed to the intended schema, ownership, ACL, RLS and default-privilege baseline. Migrations 0130/0131 were applied only there. Synthetic database-role/JWT tests passed.
- No production migration, backfill, renumbering, merge or deployment occurred for PR #204. It still needs a real Auth-issued hosted browser retest and dashboard direct-link fallback review.
- M6 Today queue recovery is live: Brett applied the LATERAL `lead_contact_health` rewrite in production on November 2. The owner-scoped page query returned 99 rows in 36.7 ms after the prior 8-second timeout. Branch `fix/m6-queue-timeout` records the already-live SQL and verification but remains unmerged.
- Forty consecutive Crissi health and drain cycles passed on October 26-November 3 after the two October 25 `relay_525` failures. Recovery is holding, but the earlier relay/upstream cause remains unconfirmed.
- PR #199 remains held for current-main reconciliation/re-verification and separate migration 0130 approval. PR #136 firm security and PR #80 app-wide call alerts remain unreconciled with current main and unapproved for release.
- InnoDash main `71a6c33b` still ships literal PIN maps in browser-delivered ops/pay HTML, and the Netlify project has no site password or team-login requirement. Treat every committed/deployed PIN as exposed.
- The private `ii-bee` connector is security-hardened with per-app access scopes, explicit sharing, encrypted Bee login, passphrase lockout and a shared notebook/review log. PR #1 added bounded, stateless long-transcript pagination with verified continuation, merged as `45934e347f97aee3830f8c961c0b8ba454bbc210`, and was verified live on Worker version `d19f8f29-f2ea-41c5-8628-5803c28e0fd7`. The repository still has no `AI_HANDOFF.md`; because every push redeploys, do not make a standalone handoff-only push.

## Work completed

- PR #205 merged and the resulting main revision deployed successfully to Cloudflare production.
- PR #204 integrated current production, recovered its isolated backend, passed its current hosted checks and fixed the agent current-status route/access error path.
- M6 queue timeout was fixed in production and verified equivalent on 99 rows. No route, TypeScript, RLS, role or permission change was involved.
- Crissi returned four more clean health/drain cycles, bringing the post-interruption streak to forty.
- `ii-bee` PR #1 merged and deployed bounded transcript pagination. Synthetic tests reconstructed 208,006 Unicode code units exactly, and the live read-only smoke covered one long conversation across ten contiguous pages without logging or saving transcript content.
- The November 3 review covered 14 repositories, 261 branch tips and 30 open PR heads. No runtime or branch-tip movement occurred, and no open PR head had a failed or stalled reported check. ClaimPoint PRs #1-#5 still have no reported checks and are not labeled as failures.
- This continuity update is documentation-only. It did not merge, deploy, replay queues, alter credentials, apply production migrations, change permissions, send messages, process money or alter client records.

## Verification performed

- Exact ClaimReach main `20e0115` has a successful Cloudflare Pages production deployment.
- PR #204 is ten commits ahead and zero behind main. Exact head `ee21685` passed Cloudflare Pages and Netlify previews; runtime head `deff9e9` passed the status/auth/intake regression workflow.
- The isolated PR #204 database matched the intended schema, function ownership, ACL, policy and default-privilege baseline. Hosted synthetic status, permissions, tenant, history, archive, numbering and stale-save tests passed.
- M6 `lead_contact_health` before/after results matched exactly on 99 rows; both health views retain `security_invoker=true`, and the exact owner query completed in 36.7 ms.
- Four November 3 Crissi health jobs and all matching drain jobs passed; combined with October 26-November 2, the current post-interruption streak is forty.

## Active blockers or open questions

- PR #205 needs authenticated production acceptance through non-mutating, no-send paths.
- PR #204 needs a real Auth-issued hosted browser retest and dashboard direct-link fallback review. After those gates, Brett must separately approve production migrations 0130/0131, merge and deployment.
- M6 migration-number conflict: the record branch uses 0130 for the already-live queue fix, while PR #204 reserves 0130/0131. Do not merge either branch as-is or rerun the M6 SQL until numbering is reconciled.
- M6 LOR sending should remain held: the recipient/address, verified-date gate, attorney approval and preservation list do not yet match Josh Bauer's October 28 SOP; Josh must confirm the correct G6 address.
- Security decision: approve server-side InnoDash authorization and rotation of exposed PIN values only after browser literals are removed and the fix is deployed.
- The `ii-bee` connector now has live deployment verification, but still lacks a durable `AI_HANDOFF.md`. Its README says every GitHub push redeploys, so add the handoff only with the next approved release rather than causing a documentation-only deployment. Do not inspect or copy Bee transcript content for continuity reporting.

## Next safe action

- Reconcile the M6/PR #204 migration-number collision without rerunning production SQL, then confirm the restored `/m6` page in the browser. Keep LOR sending held pending Josh's address and SOP-gate confirmation.
- Run the authenticated no-send production acceptance for PR #205.
- Use synthetic real Auth-issued owner and non-owner sessions against the successful isolated PR #204 deployment, then review the dashboard direct-link fallback. Keep the PR draft and production migrations unapplied.
- Continue read-only Crissi health/drain watch.
- For `ii-bee`, add a durable `AI_HANDOFF.md` with the next approved code release, not as a standalone push; preserve transient transcript handling and the existing redacted smoke evidence.

## Session log

- 2026-11-03 PT - Codex - found no runtime or branch-tip movement, confirmed four more clean Crissi health/drain cycles for a forty-success recovery streak and no failed or stalled reported open-PR checks; next: reconcile M6/PR #204 migration numbering, browser-confirm /m6 and keep LOR sending held.
- 2026-11-02 PT - Codex - verified the M6 queue SQL fix was applied and restored the 99-row owner query, found a 0130 migration-number collision with PR #204, confirmed three more clean Crissi health/drain cycles for a thirty-six-success streak and no failed or stalled reported open-PR checks; next: reconcile migration numbering, browser-confirm /m6 and keep LOR sending held.
- 2026-11-01 PT - Codex - found no runtime or branch-tip movement, confirmed five more clean Crissi health/drain cycles for a thirty-three-success recovery streak and no failed or stalled reported open-PR checks; next: real-Auth PR #204 retest and server-side InnoDash authorization decision.
- 2026-10-31 PT - Codex - found no runtime or branch-tip movement, confirmed five more clean Crissi health/drain cycles for a twenty-eight-success recovery streak and no failed or stalled reported open-PR checks; next: real-Auth PR #204 retest and server-side InnoDash authorization decision.
- 2026-10-30 PT - Codex - found no runtime or branch-tip code movement, confirmed four more clean Crissi health/drain cycles for a twenty-three-success recovery streak and no failed or stalled reported open-PR checks; next: real-Auth PR #204 retest and server-side InnoDash authorization decision.
