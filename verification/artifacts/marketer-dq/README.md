# Marketer DQ recovery verification

Rebuilt from `947c9a9deed75de6fc23226b2e4ebfdc3f669c6f` on 2026-10-19. The old local commits `1296a48` and `9a3f8a8` were absent from this executor and the old branch was not on origin.

## Behavior

- PR Digital remains confined to its configured firm, INNO MVA campaign and source approval scope. No new user role or access grant.
- Receipt filters use `leads.created_at`; Last 14 days means today and the preceding 13 Pacific calendar days. Test files remain excluded and the screen says so.
- Current intake DQ, historical DQ, and firm turn-down have separate reason counts and drilldowns. Missing catalog reasons and dedicated explanations are explicit review requirements.
- The reporting loader no longer queries notes or activity narratives, or selects call-log note bodies. Only `claims.dq_explanation`, explicitly entered as marketer-facing text, can populate the explanation column. Historical internal narratives are not copied.
- Manual file, claim, bulk and QA status commands require a selected reason and a meaningful 10–2000-character explanation. Call DQ/NI/DNC uses the same validation. Drafts remain on failures. The legacy computed-disposition console directs DQ to the file's dedicated status control rather than treating a generated routing reason as a human explanation.
- DQ call status, explanation and call close use one server-only PostgreSQL transaction. DNC contact permissions are included. Existing post-save audit/automation and queue behavior remains in the central status setter.
- Existing signed-decline/firm narratives remain private; they are not automatically approved for marketer reporting.

## Checks

- TypeScript: `npx --no-install tsc --noEmit --incremental false`.
- Cloudflare: `npx @cloudflare/next-on-pages`, with synthetic Supabase variables and writable XDG/npm caches under `/tmp`; Build Completed, 237 Edge Function Routes.
- 33 focused checks passed, including both engine tests, disposition API, manual status API bypass, report authorization, privacy, imports, date boundaries and QA regression.
- PostgreSQL: `NODE_PATH=/tmp/claimreach-tools/node_modules node verification/dq-transaction-test.cjs`. In-memory PGlite only. Verified invalid reasons, whitespace, stale writes, wrong tenant/matter/call, browser-role denial, and rollback after failures in either claim or call persistence.
- Browser: `NODE_PATH=/tmp/claimreach-tools/node_modules node verification/dq-browser-test.cjs`. Chromium with iPhone 13 viewport, actual React components and synthetic responses. Verified counts, 14-day cohort, reason drilldown, no horizontal overflow, blank explanation disabled, and reason/text retained after a failed save.
- Full runner: 187/203 suites passed. Unchanged main: 185/202. No new failures; the existing disposition route test's obsolete notification expectations/import harness were corrected. The 16 remaining failures are listed in `checks.json`; several are React runtime test-harness failures, and the rest are existing assertion failures. They were not altered as part of this task.

Test tools (`tsx`, Playwright, PGlite) were installed in `/tmp/claimreach-tools`; package manifests and lockfiles were not changed. Screenshots contain fictional people only.

## Release boundary

Migration `0130_marketer_dq_explanations.sql` is appended to `RUN_THESE_MIGRATIONS.sql`. It does not depend on held payroll migration 0128. It adds a nullable dedicated column and an invoker function callable only by the existing server service role; it grants no browser/user role access and changes no RLS policies.

**Migration was not applied. No production data mutation, deployment or merge was performed.** Deploying this branch requires separately approved application of 0130 first. Without it, report reads and manual DQ saves fail closed. The screenshots are a local synthetic preview, not evidence of a live database rollout.
