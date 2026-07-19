# ClaimReach — Motel 6 property-save fix (2026-07-19)

## What was broken
Saving a property in the Motel 6 intake threw
`invalid input syntax for type integer: "10/1977"` and then SILENTLY LOST the
property answers.

Root cause: the "Approximate month & year of stay" field (`stay_month`) sends a
string like `"10/1977"`, but the DB column `claim_properties.stay_month` is an
INTEGER. The save route (`/api/claim-intake`) did a non-transactional
`delete()`-then-`insert()`, so when the insert failed on that cast, the delete had
already wiped the property rows — that is why answers went missing on the way back,
and why the month/year field showed a bare int on reload.

## Files in this zip (extract at the repo ROOT — paths are preserved)
- `src/lib/claim-properties.ts`  ...... NEW. One place that converts each property
  value to its real DB type. Splits "10/1977" -> stay_month=10 + stay_year=1977,
  turns empties into NULL, and recombines month/year for display.
- `src/app/api/claim-intake/route.ts`  MODIFIED. Coerces every column before write,
  and now INSERTS the new rows first and DELETES the old ones only after that
  succeeds — a failed save can never wipe existing answers again.
- `src/components/ClaimIntake.tsx`  .... MODIFIED. Uses the shared hydration so the
  "all sections" view shows 10/1977 (not 10) on reload.
- `src/components/GuidedIntake.tsx`  ... MODIFIED. Hydrates DB rows into the shape
  the guided runner expects (it previously read them wrong, so properties rendered
  blank / could be blanked on save), and preserves an existing canonical_id.

## How to use
1. Unzip at the root of your `claimreach` repo (it overwrites exactly the 4 files
   above; `CHANGES.md` is just this note — don't commit it unless you want to).
2. `git add -A && git commit -m "Fix Motel 6 property save: type coercion + safe replace"`
3. Push; let Cloudflare deploy.

## Verified in sandbox
- `tsc --noEmit` (strict): 0 errors
- `@cloudflare/next-on-pages` build: succeeds
- 16/16 unit assertions on the coercion helpers (incl. "10/1977", "1", empties,
  round-trip). NOT yet tested end-to-end against the live DB — that is your deploy.

## Still to confirm (guided "not asking property questions")
The shape fix above should resolve it. If it does not, check Settings -> Campaigns:
what is the Motel 6 campaign's INTAKE TEMPLATE set to? If it is a custom builder
form saved without the property section, that is the remaining gap and it is a
quick form fix.
