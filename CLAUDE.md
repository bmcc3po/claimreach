# Claude Code Instructions

Before doing any work:

1. Read `AGENTS.md` completely. It is authoritative for repository architecture, conventions, safety, and verification.
2. Read `AI_HANDOFF.md`. It is authoritative for the current objective, state, blockers, and next safe action.
3. Check the actual Git branch and working tree before trusting recorded state.

## Cross-Agent Continuity (Required)

- Keep `AI_HANDOFF.md` current during material work.
- Update it before stopping, handing off, asking the user for help, or declaring completion.
- Record the branch and latest commit, files changed, commands or tests run, verification result, and exact error text for any blocker.
- If the user says the build is stalled or asks you to get it moving, resume from `AI_HANDOFF.md` plus the actual Git state, take the next safe reversible action, and verify the result.
- If recorded state disagrees with Git or runtime evidence, trust the evidence and correct the handoff.
- Never store secrets, credentials, payment data, or client/claimant PII in the handoff.
- Do not mark work complete without verification.
