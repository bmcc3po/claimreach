# ClaimReach deploy: agreements fill every blank, Send says why it failed, clean Story and Body, the 30-day calculator

No database changes. Upload, wait for the check, merge. This zip replaces claimreach_send_fix.zip and the earlier claimreach_funnel.zip (everything in them is in here), so upload only this one.

## The agreements

Page 1 now fills "injuries suffered by" with the injured person's name and "on/around" with the date of the wreck, on all three agreements (Texas, Florida, AL/GA and every other state). Step 2 (DOB and SSN) now also puts the date under Turnbull, Moak & Pendergrass's signature. Checked on the rendered pages of all three.

The date of the wreck is now needed to send. If it's missing, Send says so and shows the date pick right there.

The first send after this goes live builds the new agreement templates in DocuSeal on its own, so it takes a few seconds longer once. Nobody has to tap Set up again.

## When a send fails

The send you tried died with a bare "(502)". A failed send now says why on screen, in plain words, and writes what DocuSeal answered into the file's history, so the next failure can be read and fixed instead of guessed at.

## The site menu

The left menu on the full site could slide partly off the left edge (icons gone, section names cut). The page can no longer scroll sideways, so it stays put.

## The look

White rows and one font (Geist, same as the site), regular weights. Color only where it means something: a green check when a fact is in, an amber ring when one got skipped, red for a problem, navy for the row that is open and the answer picked. No tinted boxes, no colored bars, no shouting.

## Story is one list

"Tell me what happened." stays on top. Under it, one list: Where, When, She was, Fault, Police. Each row shows what's captured on the right, or Not yet. One row is open at a time. It's the next thing still missing, with "If she didn't say it, ask:" and the existing line. Tap an answer and that row closes and the next missing one opens. Tap any row to jump to it. Where comes first because it picks the agreement and the deadline. Under Where it shows the agreement. Under When it shows the 30-day rule for that date.

The lead is one line ("From the lead: Not at fault, Alabama, ...") and a tap shows the whole description. Common ground and rambling lines moved to two quiet links at the bottom.

## Body is the same list

Every question is a row with its answer on the right. The question being asked opens in place. Tap any row to go back to it. The separate strip of question tabs is gone.

## The 30-day calculator

It works from the crash date and needs no math from the agent.

- Not seen yet: "Has to be seen by Oct 14, 17 days left."
- Seen, wreck over 30 days ago: "Wreck was 120 days ago. With no gap she has been seen at least 3 times, never more than 30 days apart." Then it asks her first visit, her last visit, and whether there was a month with no visit (only when the dates leave room for one).
- Any gap it finds is red and says where: "Last visit was 45 days ago. That is a gap."
- Otherwise: "Next visit due by Oct 7, 20 days left."
- The 30-day check is a row like the others: "3 days left" or "Gap" on the right, the why under it.
- Under 5 days left, and only then, the willing question becomes "Can you get in today or tomorrow?" A no there flags the lights instead of turning Treat red, since she isn't refusing treatment.

Visit dates are one tap (Same day, Today, Yesterday, Not sure) or a date pick. A date before the wreck or in the future is refused, and the screen says why. The Gap light and the dispo's 30+ day gap reason read the same calculator. The case summary prints First seen, Last seen and Month with no visit.

## Send (from the earlier zip)

Send agreement is never a dead grey button. Tap it while something is missing and it says exactly what, right above the button. By default it texts her cell on file, and "Another number" takes a spouse's. Where has its own State pick. On a computer the App is white like the Leads page: the line to say reads like a page heading, the lists have thin lines, and the divider gives real width to whichever side you widen.

## Files

    src/app/api/calls/esign/route.ts, esign/preview/route.ts, esign/complete/route.ts, esign-setup/route.ts
    src/lib/esign-packets/tmp-mva.ts, src/lib/mva-call/esign.ts, preview.ts, engine.ts, engine.test.ts, server.ts
    src/components/calls/CallView.tsx, WhereField.tsx (new), PlaceField.tsx, CallConsole.tsx, calls.css
    src/app/clean.css
