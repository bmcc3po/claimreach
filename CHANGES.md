# ClaimReach — Search-first entry for "Take a Call" (2026-07-19)

## What this adds
After the caller-ID step, the console now searches for the caller BEFORE opening
anything. The number is prefilled from the caller ID and searched automatically
(you can also type a name).
- **Match found** -> click it and their EXISTING file opens straight into the
  questionnaire, resuming from where it left off. This call is logged against that
  file. No duplicate lead.
- **No match** -> "Not in the system - new caller" continues to the existing
  new-lead flow (call type -> details -> case type -> open), exactly as before.

New flow: greeting -> caller ID -> **search** -> (open existing file) OR (new caller -> case type ...).

## Files in this zip (complete files; unzip at the repo ROOT)
- `src/app/api/console/route.ts` ...... MODIFIED. Adds `op:"open_existing"`: loads
  (or creates) the caller's active claim, logs this call against the lead, and
  returns the saved answers so the console resumes the questionnaire.
- `src/components/IntakeConsole.tsx` .. MODIFIED. New "search" stage + logic; reuses
  your existing `/api/person-search` (phone or name). Back-navigation updated.

## No migration
Reuses `/api/person-search`, the `intake_calls` and `claims` tables, and the
indexed `phone_norm` column — all already exist. Zero DDL.

## Notes / one small decision
- If a matched file is a case type the console doesn't run (e.g. a trafficking
  file), it opens the FULL file at `/leads/<id>` instead of the guided questions.
- `/api/person-search` is RLS-scoped, so internal staff see matches across firms
  (good for duplicate-catching). If you'd rather scope matches to the console's
  selected firm only, that's a one-line filter — say the word.

## Verified in sandbox
- tsc --noEmit (strict): 0 errors
- Production build: confirmed before delivery
