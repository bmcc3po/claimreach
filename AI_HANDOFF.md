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

- Outcome: Astra round-3 findings verified, fixed, gated and delivered as claimreach_astra_round3.zip on top of PR #33 (deaf575).
- Why it matters: launch gates — access protection, data loss, false completion, packet integrity, and a transparent-button regression.
- Definition of done: every confirmed finding fixed with the build gate green; DB repairs applied and probe-verified; zip verified on a clean copy of origin/main.

## Current state

- Status: Rounds 3+4+5 zip (claimreach_round5.zip) cut and delivered, then refreshed Sep 28 with pain notes on the call console (Brett's ask: checking an injury box opens a Pain notes box; saved with the call, in the summary and firm report); answers the round-3 review handback (PR #35 should be updated with these files); supersedes every earlier zip
- Working branch: astra-round3 (local to Claude's cloud session; delivery is by zip upload, session cannot push)
- Latest commit: astra-round3 branch on top of origin/main a887ce6 (rounds 3, 4, 5 + speed to lead + pain notes)
- Deployment or preview: awaiting Brett's zip upload; DB migrations 0103, 0104, 0105 AND 0106 (locked property replace, doc_count manifest, effective-privilege repair) ALREADY APPLIED live and probe-verified (canonical storage keys, atomic property replace, credentials tables owner/admin-only, drip enrollment server-only); pain notes need NO migration (rides in the saved answers JSON)
- Last verified result: tsc clean; engine 45 pass; SsnDob pass; next-on-pages Build completed (192 function routes incl. the standing 2 non-page); browser shots: notes box opens under checked injury boxes on iPad and phone, fine-only opens nothing

## Work completed

-

## Files and systems changed

-

## Verification performed

- Commands or checks:
- Result:

## Active blockers or open questions

- Exact issue:
- Exact error:
- What was tried:
- Best hypothesis:
- Decision or input needed:

## Next safe action

-

## Session log

Add the newest entry first. Use: `YYYY-MM-DD HH:MM TZ — agent — outcome / blocker / next action`.
