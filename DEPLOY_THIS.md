# ClaimReach deploy: LawRuler Test passes, other case types turned away

No database changes. Upload, wait for the check, merge.

LawRuler's Test button sends placeholders instead of a real lead. ClaimReach now answers those with OK and saves nothing, so Test shows success on both the MVA hook and the Motel 6 hook when the URL and key are right.

A LawRuler post that is not INNO MVA (or another campaign ClaimReach runs) and does not name its campaign is refused and logged, and nothing is saved. The Motel 6 hook names its campaign (motel6) and keeps working as before. This stops a hook set to all case types from turning other campaigns' leads into TMP Motel 6 files.

## Files

    src/app/api/webhooks/lawruler/route.ts
