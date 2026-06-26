# ClaimReach

In-house intake + case-management CRM. Phase 1: Motel trafficking referral
intake for TMP (Turnbull Moak \& Pendergrass), with property identification,
firm portal, and JustCall texting/calling.

Stack: Next.js 15 (App Router) on Cloudflare Pages, Supabase (Postgres + Auth),
Google Places + Street View, JustCall.

## 1\. Database

Run the migration against the Claim Reach Supabase project
(`gvtafevoisfxcfkugvoj`):

```
supabase/migrations/0001\_foundation.sql
```

It creates all tables, RLS policies (locked, no USING(true)), the firm-stage-only
guard trigger, the lead-number minter, and seeds two firms: Innovative Intake
(operator) and TMP (firm #1).

## 2\. Environment

Copy `.env.example` to `.env.local` and fill in:

* `NEXT\_PUBLIC\_SUPABASE\_URL` / `NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY` — Claim Reach project
* `SUPABASE\_SERVICE\_ROLE\_KEY` — server only, never shipped to the browser
* `GOOGLE\_MAPS\_API\_KEY` — Places API (New) + Street View Static enabled
* `JUSTCALL\_API\_KEY` / `JUSTCALL\_API\_SECRET` / `JUSTCALL\_DEFAULT\_FROM`

On Cloudflare Pages, set these as project environment variables (the
NEXT\_PUBLIC\_ ones as plaintext, the rest as secrets).

## 3\. Users

Auth users are created in Supabase Auth, then mapped to a firm + role in
`app\_users`. After creating a user in the Supabase dashboard (or via invite):

```sql
-- Internal staff (you, Alicia, agents): firm = Innovative Intake, role agent/admin/owner
insert into app\_users (id, firm\_id, role, full\_name, email)
select '<auth-user-uuid>', f.id, 'agent', 'Agent Name', 'agent@innovativeintake.com'
from firms f where f.slug = 'innovative-intake';

-- TMP attorney (firm portal, magic-link login): firm = TMP, role 'firm'
insert into app\_users (id, firm\_id, role, full\_name, email)
select '<auth-user-uuid>', f.id, 'firm', 'TMP Attorney', 'attorney@tmp.com'
from firms f where f.slug = 'tmp';
```

Internal staff sign in at `/login` (email + password). TMP signs in at
`/firm-login` (passwordless magic link).

## 4\. Run / deploy

```
npm install
npm run dev                 # local
npm run preview             # build + wrangler local preview
npm run deploy              # build + deploy to Cloudflare Pages
```

## Architecture notes

* **Multi-tenant-ready, single-tenant-seeded.** Every table carries `firm\_id`.
Internal staff (Innovative Intake) operate across all firms' intake; firm
users are scoped to their own `firm\_id` by RLS. Adding a firm = one row.
* **RLS is the security boundary.** The browser only ever holds the anon key.
The service-role key lives in `supabase-server.ts` (`supabaseAdmin`) and is
used only in Node route handlers for system-owned writes (canonical counters).
* **Firm portal is stage-only.** Firm users can change the pipeline stage and
nothing else — enforced both by RLS and a database trigger
(`firm\_stage\_only\_guard`), so victim PII can never be altered from the portal.
* **Brand-on-date.** Each property captures the brand the claimant *remembers*
and the *current* flag separately; mismatches auto-flag (`brand\_mismatch`) for
the attorney rather than disqualifying the lead.
* **Property clustering.** Every identified property resolves to one canonical
record by Google `place\_id`; `claimant\_count` gives the firm a pattern-strength
ranking (how many claimants independently named each property).
* **Comms safety.** Monitored-contact leads block texts/calls on unsafe channels,
enforced server-side in the JustCall route, not just in the UI.

## Deferred (fast-follow)

* JustCall recording stitch onto the lead (webhook fires before recording
finishes processing — handle with a delayed re-fetch).
* Inbound SMS webhook to log `text\_in` activity.
* Document upload/exchange in the firm portal.  NEXT

