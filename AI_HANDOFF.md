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

- Outcome: finish and verify the current INNO and NETFLY intake-to-firm handoff flow without losing the separate app-wide call-alert work.
- Definition of done: the current NETFLY import change has passed a synthetic preview test and owner review, merged work is represented here, and the call-alert branch is reconciled with current main before release.

## Current state

- Main: `68cb1068a133cc94fd3bb25c55e3aede57edd13c`.
- Material movement in the last 24 hours: PRs #99 through #116 merged, covering document collection, post-sign guidance, focused intake, MVA answer review, signed-packet handoff, first-call guidance, NETFLY signed-file import, outside-firm delivery, and receiving-firm checks.
- Current review candidate: PR #117, `8d6d5f35664a9565f9563a5b84eba92cedc6dcbc`, is open, non-draft, cleanly mergeable, and has successful Cloudflare Pages and Netlify preview checks.
- Separate unfinished build: draft PR #80, app-wide call-ready sound and green pulse, is 56 commits behind main and 2 commits ahead with merge conflicts. Its hosted build checks are green, but it is not ready to merge or deploy.
- Git evidence does not establish the current production deployment or live data behavior.

## Work completed

- Added bounded document collection and post-sign guidance.
- Simplified the focused intake work area and MVA answer review.
- Built reviewed signed-packet handoff, owner downloads, LawRuler signed-file handoff, and outside-firm delivery recording.
- Added INNO and NETFLY first-call guidance, NETFLY email and signed-PDF import, final file review, and receiving-firm validation.
- PR #117 adds NETFLY forwarded contact-block parsing and approved agreement-viewer links while preserving ambiguity warnings and agent-entered answers.

## Files and systems changed

- See merged PRs #99 through #116 for the exact current-main change sets.
- See PR #117 for the active NETFLY parser, import, route, and UI changes.
- See draft PR #80 for the isolated app-wide alert implementation.

## Verification performed

- PR #117 reports TypeScript, component, parser, import, route, MVA engine, and intake-console suites passing with synthetic fixtures.
- PR #117 Cloudflare Pages check completed successfully on 2026-10-02; its Netlify deploy preview is also successful.
- Five ClaimReach workflow runs in the review window completed successfully; no open ClaimReach PR has a failed or pending reported check.
- Live synthetic UI behavior and production deployment state were not verified in this handoff update.

## Active blockers or open questions

- PR #117 still needs a no-PII synthetic pass in the hosted preview for contact extraction, agreement-link display, ambiguity handling, and the "no attorney retained" conflict.
- Draft PR #80 must be rebased or its alert changes selectively reapplied onto current main before release. Do not merge the conflicted branch as-is.
- Older open intake PRs may be superseded by the merged #99-#116 sequence; treat current main and this handoff as authoritative before resuming them.

## Next safe action

- Run a synthetic, no-PII hosted-preview walkthrough on PR #117. If its four guarded behaviors pass, record the evidence on the PR and hand it to the owner for merge review. Do not merge or deploy automatically.

## Session log

- 2026-10-02 20:10 PT — Codex — reconciled the handoff to current Git evidence; opened a documentation-only correction; next: hosted synthetic verification of PR #117.
