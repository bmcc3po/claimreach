AGENTS.md — ClaimReach
Rules for any AI agent working in this repo. Read this whole file before changing anything.
What this is
ClaimReach is a white-label legal intake / case management SaaS for plaintiff PI firms.
Multi-tenant: TMP, TMT, and others are FIRMS in config — never separate code paths.
Stack: Next.js 15 App Router · Cloudflare Pages via @cloudflare/next-on-pages · Supabase (Postgres).
Repo: bmcc3po/claimreach. Production domain: claimreach.com.
This system handles claimant PII, signed retainers, and medical detail. Treat every change
as if a mistake exposes a client's file to the wrong law firm — because it can.
Workflow (non-negotiable)
PLAN FIRST. Present a plan and wait for approval before writing code.
One branch per task. Never commit directly to main.
Read all code relevant to a change before editing any of it.
Real diffs. Small, reviewable changes.
Never mark a task done without running the build gate below.
Build gate — every change must pass
`tsc` — zero errors
`npx @cloudflare/next-on-pages` — must print "Build Completed" and the Edge Function Routes count
Engine tests must pass
Migrations go in `RUN_THESE_MIGRATIONS.sql`, numbered sequentially, append-only
THE RECURRING BUG — check this list on every change
The dominant bug class in this codebase, confirmed repeatedly, is always the same shape:
one concept defined in more than one place with nothing forcing agreement.
Questions lived in three files. Retainer in three places. Case type had three vocabularies.
Before finishing any change, verify:
Every field id you write is a real column in the DB schema. Postgres rejects an ENTIRE
update if one field names a nonexistent column — a single phantom field silently discards
every other change on the form.
Booleans are stored as real booleans, never "yes"/"no" strings.
Form resolution goes through `resolveFormKey()` in `src/lib/forms.ts`. Nothing resolves
a form its own way.
Questions are defined once (spine / intake_forms). Retainer selection is defined once.
File state is defined once. If your change creates a second definition of an existing
concept, stop and consolidate instead.
Never swallow write errors. Never show "Saved" after a failed write.
Locked invariants — do not change without Brett's explicit approval
Stage model is LOCKED (display-only): NEW DEAL · WIP/FLAG (This Week vs Carried Over)
· RE-QA (= Pending Review) · READY TO SEND · DELIVERED + DEAD (terminal) · LIMBO.
Stages are MAPPED from `current_status`. Never migrate or write the `current_stage` column.
Persistence rule: a signed deal stays visible and carries week-to-week until
Dead/Delivered or manually archived. A deal disappearing from a weekly view is a bug.
Delete means archive (migration 0066): sets `archived_at`, recoverable 90 days.
Permanent deletion is OWNER ONLY and must refuse on a non-archived file. Never write
a hard DELETE against lead data.
Question verbiage in any intake script is never changed without Brett's approval.
Retainers are campaign-scoped. Only retainers tagged to the campaign populate the picker.
Money lines are never read aloud and never surfaced to agents in-script:
auto retainer line $10k, general PI line $50k.
Campaign inherits case-type template by reference and FORKS a private copy on
customization. Editing a master template must never rewrite a live signed campaign.
Tenant isolation — highest-severity rule in the repo
Every query, route, and view is firm-scoped. No cross-firm reads, ever.
One firm's case types, campaigns, forms, or files must NEVER be visible inside another
firm's account. (Real incident: a cross join created Motel 6 campaigns under every firm.
Motel work belongs to TMP only. `beta_motel` is a FORM key, not a case type.)
m6 firm landing: `retention_alert_recipients` where campaign = 'motel6' and
active. Adding an m6 firm user means adding their lowercase email there
(plus `firm_access` to provision the account). Do not send every TMP firm
login to /m6 — other TMP users stay on /portal.
Firm provisioning happens in the auth callback (`provision_self_from_firm_access`
when `app_users` is missing). Never via triggers on `auth.users` — postgres
is not the table owner on this platform (0088 failed 42501; 0009 never
existed for the same reason).
No Supabase `service_role` key in any client-side file. Server-side only.
Any change touching auth, RLS, roles, or permissions (`gate.ts`) gets flagged to Brett
in the plan before implementation — always.
Design rules
North star: Steve-Jobs-clean, zero learning curve, usable by a non-technical person
with no training. If a screen needs explaining, it's wrong.
Dropdowns over free text everywhere. Free text produces unreportable mess.
Guided one-question-at-a-time for criteria questions. Multi-field screens allowed ONLY
for capture blocks (address, insurance, vehicle) via the `group` marker.
Modern styling. Never dated.
Agent safety boundaries
Never run destructive SQL against production. Migrations are written, not executed.
Never delete or rewrite config files (.env*, wrangler/deploy config, package.json)
without explicit confirmation.
Never commit secrets. Known env vars live in Cloudflare: RESEND_API_KEY, EMAIL_FROM,
CRON_SECRET, GOOGLE_MAPS_API_KEY, PROPERTY_TOOL_KEY.
If you find a security problem (exposed key, RLS gap, cross-tenant leak), STOP and
report it before doing anything else.
If a file path referenced in this document doesn't match the repo, say so — do not
guess at an equivalent.