# ClaimReach Sandbox — setup runbook (Zach Peagler eval)

A **separate, isolated instance** of ClaimReach for Zach to play in — create,
delete, copy intakes, run the console, everything — with **realistic demo data
and zero real client data**.

## Why a separate instance (not a login on the live app)

Zach wants *full* access. In ClaimReach the roles that can freely create/delete/copy
across the app are the **internal** roles (owner/admin/agent/qa), and by design those
see **across every firm** (`is_internal()` in the RLS). So a full-access login on the
live app would show him TMP/TMT/Roth's **real** client leads. The only clean way to
give him full run of the product without exposing real files is a separate instance
with its own database. That's what this package sets up.

## What's in this package (all validated)

| File | What it is |
|---|---|
| `all_migrations_0001-0066.sql` | Every schema migration, concatenated in applied order. One paste. |
| `sandbox_seed.sql` | Demo data: 3 campaigns + retainers, 12 leads/claims across intake→prelit→lit→settle→DQ, sample calls. Plus the STEP 2 owner-link snippet. Idempotent. |
| `RUNBOOK.md` | This file. |

I validated the whole chain against a real Postgres 16: all 66 migrations apply clean,
the seed runs clean (12 demo leads across 7 pipeline stages), and the owner-link
correctly makes Zach an internal owner.

## What you do vs. what's done

**Done + validated by me:** the migrations, the demo seed, the owner-link SQL, and
the app code itself (this is the same bundle with all the console revisions).

**Only you can do (needs your accounts/billing):** spin up the new Supabase project
and the new deploy. Everything below is those steps.

---

## Steps

### 1. Create a new Supabase project
Supabase dashboard → **New project**. Name it something like `claimreach-sandbox`.
Pick any region/password. When it's ready, from **Project Settings → API** copy:
- Project URL (`https://<ref>.supabase.co`)
- `anon` public key
- `service_role` secret key

*(This is a brand-new database — it shares nothing with production.)*

### 2. Apply the schema
Two options, pick one:

**A. Supabase SQL editor (simplest):** open the SQL editor on the sandbox project,
paste the entire contents of `all_migrations_0001-0066.sql`, and run it. On a real
Supabase project the `auth` and `storage` schemas already exist, so it applies as-is.

**B. Supabase CLI:** from the repo root:
```
supabase link --project-ref <sandbox-ref>
supabase db push
```

### 3. Seed the demo data
In the SQL editor, paste and run `sandbox_seed.sql`. You should get 3 campaigns,
2 retainers, 12 leads, 12 claims, 5 calls. (Re-running it is harmless — it's guarded.)

### 4. Create Zach's login
Dashboard → **Authentication → Users → Add user**. Enter his email + a temporary
password and check **Auto Confirm User**.

### 5. Make Zach an owner
Open `sandbox_seed.sql`, scroll to the **STEP 2** block at the bottom, **uncomment
it**, change `zach@REPLACE-ME.com` to his real email, and run just that block in the
SQL editor. That links his auth user to an internal **owner** account (full access).

### 6. Deploy the app pointed at the sandbox DB
Create a **new Cloudflare Pages project** from this same repo/bundle (don't reuse the
production one). In its environment variables set — **using the sandbox project's
keys from step 1**:

| Variable | Needed for | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | required | sandbox project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | sandbox anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | required | sandbox service_role key |
| `GOOGLE_MAPS_API_KEY` | address / city / police-dept lookups | your Google key (a copy is fine) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | client-side maps | your browser Google key |
| `RELAY_URL` / `AI_RELAY_URL` / `MAVERICK_RELAY_SECRET` | optional — Crissi / AI | leave unset to disable AI in the sandbox |
| `JUSTCALL_*` | optional — dialer/SMS | leave unset |
| `CRON_SECRET`, `CR_AI_GATE` | optional | leave unset |

Build command `npm run pages:build`, output `.vercel/output/static` (same as prod).

### 7. Hand it to Zach
Give him the sandbox URL + his email/password. He logs in as owner and can do
everything: run "Take a call," open/edit/delete/copy the 12 demo files, move them
through stages, etc. Nothing he does touches production.

---

## What works out of the box vs. needs a key
- **Full app + console + all the new MVA questions + demo data:** works with just the
  three required Supabase vars.
- **Address / city / police-department pickers:** need `GOOGLE_MAPS_API_KEY`
  (server) — reuse your existing key or issue a sandbox-restricted one.
- **Actually sending an e-sign packet:** needs SignWell credentials in the sandbox's
  `esign_accounts` table (not env). Fine to skip for an eval — the console has a
  "skip signing, finish the file" path so the whole flow still demos.
- **AI (Crissi/Grievous):** off unless you set the relay vars. Recommend leaving off
  in the sandbox.

## Reset / refresh
- Re-run `sandbox_seed.sql` anytime — it only adds what's missing.
- To wipe the demo files and start clean:
  `delete from leads where lead_no like 'TMP-9%';` (claims/calls cascade or clear with
  them). Then re-run the seed.
- To tear the whole thing down, just delete the sandbox Supabase project and the
  sandbox Pages project. Production is untouched.

## The demo files (so you know what Zach sees)
12 fictional MVA/premises/referral files spread across the pipeline:
intake (2, one resume-able mid-questionnaire) · QA-verified/prelit (2) ·
sent-to-firm (2) · signed & retained (2) · in litigation (1) · settled/closed (1) ·
disqualified (2). Several carry rich answers that show off the new questions
(collision type, how-they-found-us, passenger tree, insurance-forms tree, follow-up
treatment, case-manager notes).
