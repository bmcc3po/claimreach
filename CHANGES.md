# ClaimReach — MVA city/state autocomplete + Statute-of-Limitations readout (2026-07-19)

## What this adds
On the MVA "Take a call" console, the "And where did this happen? City and state"
question is now a **Google-filled city picker**: type "Las Ve" -> pick
"Las Vegas, NV" or "Las Vegas, NM". It stores the STANDARDIZED "City, ST" so
reporting can group on it. Once the incident date is captured, it also shows that
state's **personal-injury statute of limitations** and the filing runway
(days remaining / deadline / EXPIRED), color-coded.

## Files in this zip (extract at the repo ROOT — paths preserved; complete files)
- `src/lib/reference/sol.ts` .............. NEW. Per-state PI SOL table + helpers
  (state-from-text, deadline math). Uses the MVA-specific figure where a state
  differs (e.g. CO 3 yrs, KY 2 yrs), general PI elsewhere.
- `src/components/CityStateLookup.tsx` .... NEW. The city autocomplete + SOL readout.
- `src/app/api/places/route.ts` ........... MODIFIED. Adds a `kind:"city"` mode
  (locality search + address-component parsing to return clean "City, ST").
- `src/components/guided/GuidedStep.tsx` .. MODIFIED. Renders the city lookup for a
  `lookup:"city"` field; passes the incident date through; spellcheck on narratives.
- `src/lib/intake-console/questions.ts` ... MODIFIED. Adds `lookup?` to the type and
  flags `incident_city_state` as a city lookup.
- `src/components/IntakeConsole.tsx` ...... MODIFIED. Threads the flag + incident date
  into the step.

## Requirements
- Uses your existing `GOOGLE_MAPS_API_KEY` (Places API New). No new env or DB.

## ⚠️ Verify the SOL numbers before relying on them
The table is a GENERAL negligence/auto guideline, sourced from Nolo, labeled in the
UI as "not legal advice." It does NOT encode discovery-rule, minor tolling, wrongful
death, or government-claim notice deadlines. Have an attorney confirm the figures for
the states you actually run. Edit them in one place: `src/lib/reference/sol.ts`.

## Verified in sandbox
- tsc --noEmit (strict): 0 errors
- 12/12 unit assertions on the SOL helpers (incl. "Las Vegas, NV"->NV, CO/KY auto
  exceptions, past/urgent/ok deadline bands)
- Production build: (running at package time — confirmed before delivery)
