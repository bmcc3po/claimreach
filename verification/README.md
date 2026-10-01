# Offline verification

Run from the repository root after installing the existing project dependencies. These checks use synthetic records and fake providers. They do not validate deployed services or contact real clients.

Install test-only tooling in a separate directory (no project package changes):

```powershell
npm install --prefix ../claimreach-test-tools --no-save tsx@4.20.6 @electric-sql/pglite@0.3.14
$env:NODE_PATH=(Resolve-Path ../claimreach-test-tools/node_modules).Path
node verification/run-tests.cjs
node node_modules/typescript/bin/tsc --noEmit
```

The runner discovers all source/root `*.test.ts` and `*.test.tsx` suites and runs the additional route/PostgreSQL checks. It blocks external fetch/HTTP by default; test fixtures provide their own fake transport. Results go to a temporary directory, or set `CLAIMREACH_TEST_OUTPUT` to an explicit output directory. `NODE_PATH` is only used to locate test tooling, not by the application.

For a Cloudflare packaging check on Linux, use the existing `pages:build` script. The Windows verification machine additionally used Git Bash on PATH and the local adapter below for npm/npx process spawning and Vercel directory symlinks:

```powershell
$env:PATH='C:/Program Files/Git/bin;'+$env:PATH
$crAdapter=(Resolve-Path verification/windows-build-spawn.cjs).Path.Replace('\','/')
$env:NODE_OPTIONS='--require "'+$crAdapter+'"'
$env:NEXT_PUBLIC_SUPABASE_URL='https://example.invalid'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='offline-build-placeholder'
$env:SUPABASE_SERVICE_ROLE_KEY='offline-build-placeholder'
$env:NEXT_TELEMETRY_DISABLED='1'
node node_modules/@cloudflare/next-on-pages/bin/index.js --no-color
```

The adapter is verification tooling only. It maps Windows npm shims to their installed Node entrypoints and directory symlinks to junctions. Do not preload it in the application or production deployment. Placeholder configuration is sufficient for packaging, not deployment.

SQL suites execute migrations 0110, 0111, and 0115 against isolated in-memory PostgreSQL with synthetic tables. Migration 0115 is tested with owner and agent JWTs, restrictive row policies, pilot and nonpilot files, cross-firm/claim write attempts, configuration writes, and privileged RPC calls. These checks do not emulate multi-session concurrency or the complete deployed Supabase environment.


## App-wide call alert browser checks

Use test-only tooling, without changing application dependencies:

```bash
npm install --prefix ../claimreach-test-tools --no-save tsx@4.20.6 @electric-sql/pglite@0.3.14 @playwright/test@1.56.1 esbuild@0.25.10
node ../claimreach-test-tools/node_modules/playwright/cli.js install chromium
NODE_PATH=../claimreach-test-tools/node_modules node verification/call-alert-browser-test.cjs
```

The browser check bundles the actual alert component and styles against synthetic,
intercepted queue responses. It verifies gesture-unlocked audio, phone/tablet/desktop
layout, preservation of the open file and notes, one sound across two tabs, due callback
timing, reduced motion, and suppression on public signing pages. Screenshots are
written to a temporary directory. It never reads or changes live client records.

In hosts that block the tsx CLI's IPC socket, run TypeScript suites with Node's
`--import` pointing to `require.resolve('tsx')` instead of invoking `tsx/cli`.
The existing Lexamica date suite assumes UTC for its non-ISO input fixture; run that
suite with `TZ=UTC` when comparing results across hosts.
