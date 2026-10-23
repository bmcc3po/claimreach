# AI Handoff

## Current objective

Unify the exact-matter Current Status editor/history across File, Call and NETFLY; add authorized global file search; and prepare collision-safe NETFLY public numbering without changing production data.

## Current state

- Branch: `codex/unified-current-status`, runtime/documentation head before this handoff `035b58cebebcf9fbf874afd949d845baed45274a`.
- Four commits ahead and zero behind main `247e78d2`; no pull request is open.
- Draft migration 0130 adds nullable status detail/history and service-only transactional saves. Draft 0131 adds NETFLY number allocation and alias support. Neither migration is applied.
- No deployment, backfill, renumbering, notification replay or production record write occurred.
- Exact-matter status saves use expected-version locking and history. Browser refresh events carry IDs only; authorization remains server-side.
- Existing PRs #202 and #203 are independent and are not replaced by this branch.

## Verification

- TypeScript, focused status/search/UI/PGlite tests and both intake engines passed.
- Local schema reconstruction covered 83 public tables, 1,222 columns, 338 constraints, 46 policies and eight existing triggers.
- Full suite had six failures that reproduce on unchanged main; they are not claimed as fixed.
- Hosted authentication, grants and notification integration remain unverified.
- No authorized isolated hosted staging app/database or synthetic account set was identified.

## Decisions and limitations

- Brett must confirm the complete descriptor and legacy-status taxonomy.
- Brett must choose NETFLY numbering policy: recommended active-only numbering leaves archived public numbers unchanged; the draft preview currently models all records.
- An isolated app/database staging target and synthetic accounts must be identified or approved before hosted acceptance.
- Migrations 0130 and 0131, any backfill/renumbering and application deployment require separate approvals.
- Do not bulk-normalize ambiguous history, deduplicate files by shared contact details, or expose internal notes/evidence to vendor views.

## Next safe action

Identify or approve an isolated staging app/database and synthetic accounts, then run the prepared hosted auth/grant/notification and exact-matter acceptance sequence. Do not apply production migrations or rewrite records.

## Session log

- 2026-10-22 PT - Codex - replaced the stale inherited handoff with the unified-status/numbering branch's exact verification, decisions and isolated-staging gate.
