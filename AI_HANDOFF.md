# AI Handoff

This is the shared live continuity record for Claude Code and ChatGPT/Codex.
Read it before changing code. Replace stale state, verify before declaring completion,
keep one next safe action and at most five newest log entries. Never record secrets,
credentials, payment details or client/claimant PII.

## Current objective

Brett approved app-wide call-ready alerts and asked to push a separate branch for
morning testing: a short cha-ching, a green screen pulse, new leads first and due
callbacks second, available while working another page or file.

## Current state

- Branch: `codex/app-wide-call-alerts`, based on main `acd97a07170dd9eff4a320f19231bc2a25e894db`.
- Implementation and offline/browser verification finished; production is unchanged.
- Root-mounted alerts use `/api/calls/alerts`, the existing capability gate, the session/RLS
  client, and exactly the same queue loader/classifier as the Desk. No service-role feed.
- Staff see only eligible INNO MVA Desk new-lead and scheduled-callback work. Firm users,
  denied capabilities and public signing/auth pages receive no staff alerts.
- No auto-call, provider send, assignment, status write, cadence activation, migration,
  permission change, merge or deployment performed. No drips were enabled.

## Work completed

- Short locally synthesized cha-ching after a browser user gesture; Enable sound,
  mute and Test alert controls. No external audio dependency.
- One 1.2-second translucent full-screen green pulse, a dismissible/auto-expiring
  queue banner and a compact global live/due indicator. Pointer-transparent pulse
  does not steal focus, navigate, reload the page or change unsaved case notes.
- New lead priority ahead of callback priority. Future callbacks are checked locally
  each second while recent server data exists; queue reads refresh approximately
  every 10 seconds, shared across tabs in a browser.
- Per-account/event deduplication, rescheduled-callback identity, cross-tab sound
  locking and shared snapshots. The team alerts separately on each logged-in device.
- Reduced-motion treatment, responsive phone/tablet/desktop presentation, print
  suppression and generic notices without claimant names/numbers/intake information.
- Failed reads return 503 and show reconnecting; they do not overwrite the event ledger
  with an empty queue or ring from stale data. Closed, held, signed and archived work
  remains excluded by the existing canonical queue rules.

## Verification performed

- TypeScript `--noEmit --incremental false`: zero errors.
- `npm run build` with placeholder configuration and Next telemetry disabled: exit 0.
- Offline test runner through Node's tsx loader (the host blocks tsx CLI IPC): 112/113
  suites passed in the host timezone, including engine, acquisition-page, queue, alert
  timing/dedupe and actual alert-route tests. Existing `lex.test.ts` passed 39/39 checks
  when rerun under its expected `TZ=UTC`; its non-ISO date fixture differs in this host TZ.
- Real Chromium synthetic browser checks: audio gesture unlock, test alert, phone
  390x844/tablet 1024x768/desktop 1440x900 bounds, navigation with unsaved notes,
  one cha-ching across two armed tabs, due callback timing, reduced motion and no
  staff controls on public signing pages. Reproducible harness:
  `verification/call-alert-browser-test.cjs`; test-only dependencies in README.
- Cloudflare packaging gate is NOT certified. Automatic approval review rejected the
  Vercel-backed packaging step because it may send build data to untrusted Sentry.
  A local `--skip-build` inspection found no Vercel functions and therefore does NOT
  satisfy the required Edge Function Routes count, despite that command exiting 0.

## Active blockers and limits

- Complete the Cloudflare packaging gate before merge/deployment. The exact review
  reason: build authorization does not establish what source maps, build data or
  metadata may be sent to Sentry. Do not bypass this rejection.
- Browsers require a real gesture for audio. Use Enable sound once per browser session
  or interact with the app; suspended/closed browsers and locked phones cannot promise
  background alerts. This is an app-wide foreground/open-browser alert, not OS push.
- No minute-based INNO call cadence was invented. This alert uses existing scheduled
  callbacks. Wire any future approved cadence into the same canonical queue feed.
- Live provider/schema/deployment state remains unverified in this session. Older
  HANDOFF.md and V9_RELEASE.json candidate statements are historical evidence, not
  proof of the current production commit or migration state.

## Next safe action

Review the task branch and complete the blocked Cloudflare packaging gate; then use
an approved preview for morning acceptance. Enable sound and Test alert, then test a
synthetic new lead and a scheduled callback while another file is open, with two tabs.
Do not use real client records or trigger calls/messages to test the notification.

## Session log

- 2026-09-30 PT — Codex — implemented approved global call-ready alerts; offline and
  synthetic browser checks passed; packaging gate blocked by automatic approval review;
  branch prepared for push and morning acceptance.
