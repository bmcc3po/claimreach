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

- Outcome: protect the firm-side matter boundary while preserving the now-merged INNO, NETFLY, signing, passenger, and delivery work; keep the separate navigation and app-wide alert builds visible.
- Definition of done: firm users can see and act on documents only for the exact released matter under reviewed production RLS, actual firm-role acceptance passes, and any UI-only branches are reconciled with current main before release.

## Current state

- Main: `9fb7010cfda5dd96da5ee45e4f9e56ca4a21f26f`.
- Material movement in the last 24 hours: fourteen PRs merged (#126, #127, #131, #132, #134, #135, #137-#144). The prior INNO story-fill and simplified NETFLY drafts are now on main, together with address suggestions, caller-first and passenger signing fixes, firm-delivery guidance, file-link recovery, and in-page delivery confirmation.
- Draft PR #136 narrows firm file views, lists, uploads, calls, and activity to the released matter. Its recorded TypeScript, route, firm-page, engine, and browser checks passed; Netlify and Cloudflare previews are green. It is 1 commit ahead and 11 behind main. Production RLS review and actual firm-role acceptance are explicitly incomplete, so Carol/team rollout remains held.
- PR #133 simplifies navigation. Its recorded TypeScript, engine, component, and responsive-browser checks passed and hosted previews are green, but it is 2 commits ahead and 11 behind main with merge conflicts.
- Draft PR #80, the app-wide call-ready sound and green pulse, is 2 commits ahead and 81 behind main. Hosted checks are green, but it is not release-ready against the current queue and cadence implementation.
- This documentation-only correction remains in draft PR #118. Git evidence does not establish the current production deployment or live data behavior.

## Work completed

- Merged the reviewed INNO story-fill and simplified NETFLY five-step welcome-call work that was unfinished in the prior handoff.
- Hardened the caller/passenger signing sequence, passenger-owned packet visibility, reopened-file links, final firm-send guidance, and INNO organization/contact saves.
- Added and validated a separate draft that narrows firm document access to the exact released matter.
- Updated this handoff to current Git evidence without changing application code, deployment, schema, permissions, or secrets.

## Files and systems changed

- See merged PRs #126, #127, #131, #132, #134, #135, and #137-#144 for current-main change sets.
- See draft PR #136 for firm matter-scoping and document actions.
- See PR #133 for the separate navigation simplification.
- See draft PR #80 for the isolated app-wide alert implementation.

## Verification performed

- Six ClaimReach automation heartbeat runs in the review window completed successfully.
- All 27 open pull requests reviewed had no failed or pending reported check.
- PR #136 has successful Netlify and Cloudflare previews plus the local validation recorded in its PR description.
- PR #133 has successful hosted previews plus the local validation recorded in its PR description.
- Actual firm-role acceptance, production RLS behavior, current production deployment, and live app data behavior were not verified in this handoff update.

## Active blockers or open questions

- PR #136 must be reconciled with 11 newer main commits, then production RLS and exact-matter access must be reviewed under an actual firm role before rollout.
- PR #133 conflicts with current main and must not be released as-is.
- PR #80 is 81 commits behind and must be re-applied to the current canonical queue and cadence behavior before release.
- Smithers protected preview approval remains a separate Brett decision; it is not established by this repository evidence.

## Next safe action

- Reconcile draft PR #136 onto current main, preserve exact-matter authorization and stale-list hiding, rerun its TypeScript, route, firm-page, engine, browser, and hosted preview gates, then perform actual firm-role acceptance against reviewed production RLS. Keep Carol/team rollout held until that evidence is recorded.

## Session log

- 2026-10-04 19:54 PT — Codex — reconciled the handoff after fourteen merges; firm matter isolation is now the highest-severity release gate; next: reconcile and verify PR #136 under an actual firm role.
- 2026-10-03 19:55 PT — Codex — reconciled the handoff after eleven additional merges; two intake drafts and the alert build remained gated; next: reconcile PR #127 with current main.
- 2026-10-02 20:10 PT — Codex — reconciled the handoff to current Git evidence; opened a documentation-only correction; next: hosted synthetic verification of PR #117.
