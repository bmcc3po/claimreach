# AI Handoff

## Current objective
Give PR Digital a scoped, useful portal view of call attempts, call histories and response-time coverage without widening tenant access or exposing raw provider data.

## Current state
- Runtime branch `feat/pr-digital-call-history`, source commit `4084b646ca3ea7f2de4823f91f856ef1cd7f2306`, PR #207.
- The PR Digital portal now shows outbound attempt counts, inbound calls, first/latest outbound calls and expandable dated call histories with provider results and durations.
- Dashboard and CSV output include response-time coverage and explain when original receipt timestamps are missing.
- Existing authentication and firm/campaign/source allowlists remain unchanged. Provider call identities are deduplicated; manual logs stay separate so calls are not double-counted.
- Raw provider identifiers, recordings, transcripts and activity metadata are excluded.
- No migration, production data write, claimant creation, message or permission change is included.
- Read-only production inspection found aggregate call inventory but no populated original LawRuler receipt timestamps; import dates are intentionally not substituted for accurate historical response times.

## Verification
- TypeScript passed.
- 41 focused report/access/signature tests passed.
- Intake engine: 78 passed. MVA engine: 71 passed.
- Cloudflare packaging completed with 237 Edge Function Routes.
- Synthetic desktop (1440 px) and mobile (390 px) browser checks passed for histories, filters, CSV export, failed-refresh messaging and overflow.
- Netlify and both Cloudflare hosted checks are green on the exact runtime head.

## Remaining limitations
- Authenticated live acceptance is not verified.
- Historical response-time values cannot be reconstructed where the original source receipt timestamp is absent.
- Hosted build success does not authorize merge or deployment.

## Next safe action
Use a synthetic authenticated PR Digital account on the PR #207 preview to verify tenant scope, one call-history expansion, attempt counts, CSV output and the missing-response-time explanation. Keep PR #207 unmerged and undeployed until that acceptance evidence is recorded and Brett separately approves release.
