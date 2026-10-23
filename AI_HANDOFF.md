# AI Handoff

## Current objective

Let authorized call-center users find an existing NETFLY client by name, phone or lead number and open the exact NETFLY workspace, without exposing archived, ambiguous or foreign-tenant records.

## Current state

- Branch: `fix/call-search-netfly`, runtime head `ecf1311267a52bbf16a4dbe2357e6b13323348ea`; the later handoff-only commit does not change runtime behavior.
- Runtime source is one commit ahead and zero behind main `247e78d2`; PR #203 is open as a draft.
- The acquisition search remains RLS-backed and continues to exclude NETFLY records. A separate NETFLY read uses the existing access gate, `leads.view`, exact firm/campaign, active-MVA and single-matter rules.
- Authorized results open the existing NETFLY workspace. Archived, foreign-tenant, wrong-campaign and ambiguous records are excluded. NETFLY read failures return an explicit retry error rather than an empty result.
- No claimant creation, message, schema, role, RLS or permission-definition change is included.
- Release is explicitly held for Brett's production approval. PR #202 remains independent.

## Verification

- TypeScript, focused route, archive-visibility and rendered-navigation tests passed.
- Cloudflare packaging completed with 237 Edge Function Routes; exact runtime-head hosted status/checks report success or neutral.
- Intake and MVA engine suites passed.
- Full suite was 186/203; all 17 failures matched the reproduced untouched-main baseline and are not claimed as fixed.
- No controlled authenticated production acceptance is recorded.

## Remaining limitations

- Draft status and explicit production hold remain.
- Hosted checks do not prove live role/tenant behavior.
- Do not test with a real claimant or alter any record.

## Next safe action

Run synthetic authenticated acceptance for authorized results plus archived, foreign-tenant, wrong-campaign and ambiguous denials, then obtain Brett's explicit production approval before merge or deploy.

## Session log

- 2026-10-22 PT - Codex - replaced the stale inherited handoff with PR #203's exact scope, privacy boundaries and explicit production-approval hold.
