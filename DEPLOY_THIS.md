# ClaimReach deploy: Conversation, Quick Capture, Full Intake on phone, iPad and desktop, Simple Chorelist, and an email when a client signs

One new database step for the signing email: migration 0099. The views need nothing.

## One intake, four ways to look at it

Guided, Conversation, Quick Capture, Full Intake, Simple Chorelist and Q&A are presentations of the same call engine. The questions, answers, branching, qualification rules, lights, the 30-day math and the saved call are the same in every one. None of that changed in this zip. Switching views, turning the iPad, or resizing the window lands on the same section with every answer in place, and the section she was in now saves with the call, so opening the same call on another device lands there too.

## Email the case

"Email the case" (Print or email the case, in the view menu) now sends the whole case, not just contact info:

- **Case summary:** an automatic write-up in plain sentences at the top. Where and when, who was at fault, police and the report number, where it hurts, where she was seen, the 30-day check, work, both insurances, any injury payment, another attorney, passengers, the car, and where the agreement stands. Red flags are called out.
- **The six qualifiers:** Good, Problem, Check or Not yet.
- **Every question:** worded the way the agent asks it, with her answer, section by section. Anything not answered says so.
- **Her details:** from after she signed (DOB, address, license, emergency contact). Never the SSN.
- **The signed agreement:** attached when it is complete. The box to turn it off sits right above the button, because the PDF has her DOB and SSN on it.

The print page shows the same report. The dispo "Email the case to" and the automatic signing email send the same report too, with the agreement attached when DocuSeal has it complete.

## Conversation and Quick Capture

Built from your renderings. One question at a time, in call order.

- **Conversation:** the last answer stays in view above the question. The question sits in a navy card, written the way the agent says it. Answers are big white cards with a picture on each. Add a note sits under the answers, and Previous, Help and Skip are at the bottom.
- **Quick Capture:** Where, Wreck date and Fault across the top (tap one to go back to it), then "Question 5 of 14", the percent and a green bar. Same navy card, with full-width one-tap answers under it.
- **Moving on:** tapping an answer goes straight to the next open question. Anything that takes more than one tap (every place it hurts, a passenger, "Other", an attorney) waits for Done. When every question is answered, the button says Next: How we work.
- **Switching:** these two, Full Intake and Simple Chorelist all share one spot. Jump from one to another and you land on the same question.
- **On an iPad or a computer:** they get the same three areas as Full Intake, with the question in the middle.

## Highlights are boxes

Anything highlighted is boxed all the way around now. No more colored bar down the left side: the script lines in Simple Chorelist, the Full Intake "Next" question, the lead card, warnings, the Ask CaseCure answer, the active step on the computer and the active icon in the navy rail.

## iPad in landscape

Full Intake gets three areas. Left: her name, number, email, file number and campaign, the call clock and save status, Call or text and End call, where the lead came from and what she told the marketer, the six qualifiers in words (Good, Problem, Check, Not yet), and quick notes with the time on each. Middle: the intake, the same page as the phone, with the section bookmarks pinned at the top. Right: the next best action with the line to ask, everything still missing (tap one to jump to it), the live summary of every section, and rebuttals for the part of the call you're in.

## Desktop

Full Intake is a working screen, not a big phone. Progress across the top. Left and middle are the same as the iPad, with Call, Text and End call on the caller card. The right side opens on Summary (next best action, missing, live summary, rebuttals), and CarCure, Texts, Phone, Retainer, File and Tools are one click away in the same panel. Guided and Q&A on a computer look exactly like they do today.

## Simple Chorelist

A new view for anyone who would rather fill out a paper form. Pick it from the view control.

- **One numbered form:** 1. Incident, 2. Injury, 3. Treatment, 4. Insurance, 5. Vehicle / Property, 6. Notes, 7. Retainer. Every question is showing with its answers. Nothing folds up, nothing is hidden.
- **Status in words:** DONE, DO THIS NOW, NOT STARTED, NEEDS AN ANSWER. It never depends on a color or an icon.
- **The top:** Intake Progress, then "3 sections finished, 4 sections left", a plain bar, and "Next section: Insurance". It is information only.
- **Answers:** boxes you tick. Anything with a blank shows the line to ask.
- **Buttons, in words:** SAVE PROGRESS and GO TO NEXT SECTION at the end of every section, FINISH INTAKE at the end of 7. SAVE PROGRESS says "Saved at 2:14 PM" only after the save lands. FINISH INTAKE with sections unfinished names them first; press it again to end the call.
- **Retainer:** how we work, the send line, signer, injured person, text or email, SEND THE AGREEMENT, then walking her through it. Once she signs: date of birth, SSN, COMPLETE THE AGREEMENT, her info, passengers' agreements, and the close.
- **Every screen:** one long form on a phone, two fields across on an iPad, three on a computer.

## Full Intake

A view on the call screen, picked from the view control. It replaces Freestyle. It is the same call engine as Guided: same questions, answers, branching, lights and saved state. Switching views changes nothing and lands on the same part of the intake.

- **One page:** Incident, Injury, Treatment, Insurance, Vehicle, Notes, top to bottom. No tabs, no finishing one before the next.
- **Bookmarks:** the row at the top jumps down the same page and stays put while scrolling.
- **Each section:** its status (done, partly done, left with blanks, untouched), a one-line summary of what's captured, and opens in place to answer or change anything.
- **One tap:** answers are big buttons. The crash date has a week strip ("last Thursday" is one tap). Treatment takes the hospital or clinic names. The other driver's insurance is a search. The 30-day check sits at the top of Treatment.
- **Quick note:** the Note button saves a line to the call notes with the time, for "capture now, sort it later".
- **Next:** the button at the bottom jumps to the next unanswered question in call order and highlights it.
- **Lights:** the six lights sit in one line under her name. They turn red only when one is a real problem.
- **Remembered:** each agent's view is kept on their device for the next call.

## Also fixed

Typing a city like "Las Vegas" no longer reads "La" as Louisiana on the way.

## When a client signs

- **The email:** it goes out with the case summary and a link to the file.
- **Who gets it:** set in Settings under "When a client signs". One distro per case type (like mva@), plus CCs per campaign (like tmpmva@).
- **Needs migration 0099:** additive, staff only.

## Files

    src/lib/mva-call/intake.ts (new), engine.ts, engine.test.ts, server.ts, esign.ts
    src/components/calls/FullIntake.tsx (new), IntakeWorkspace.tsx (new), ChoreList.tsx (new), OneQuestion.tsx (new), scripts.ts (new)
    src/components/calls/CallView.tsx, CallConsole.tsx, DeskPanel.tsx, WhereField.tsx, PrintActions.tsx, DuoIcon.tsx (new), calls.css
    src/lib/mva-call/report.ts (new), report.test.ts (new), src/lib/signed-docs.ts
    src/app/api/calls/email/route.ts, src/app/api/calls/dispo/route.ts, src/app/(calls)/app/[id]/print/page.tsx
    src/app/(calls)/app/[id]/page.tsx
    src/lib/notify-signed.ts (new), notify-signed.test.ts (new), email.ts
    src/app/api/notify-routes/route.ts (new), src/app/(internal)/settings/notify/page.tsx (new), settings/page.tsx
    src/components/SignedNotifyManager.tsx (new)
    src/app/api/calls/esign/route.ts, esign/complete/route.ts, src/app/api/esign/docuseal/route.ts
    RUN_THESE_MIGRATIONS.sql, supabase/migrations/0099_signed_notify.sql
