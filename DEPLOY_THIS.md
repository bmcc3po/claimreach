# ClaimReach deploy: the agreement sends, and one clean frame for all three call views

This zip includes the agreement fix. If the agreement zip already went up, this one goes right on top of it. No database steps.

## The agreement sends

ClaimReach was sending DocuSeal the signing boxes in the wrong place in the request. DocuSeal made the agreement with no boxes, then refused to send it. The boxes now go where DocuSeal reads them. The agreements are renamed v3, so the first send after this upload rebuilds them with every box on them, by itself.

Tested against DocuSeal before this zip was made:

- Texas, Florida and the all-other-states agreement each came back with all 8 boxes and both signers.
- A text send (cell number only) came back with a working signing link, with her name already on the agreement.
- An email send came back sent.
- She signed, then Intake added DOB and SSN. It came back complete, with the signed PDF and the audit trail.
- The webhook on claimreach.com accepted the secret.

If DocuSeal ever says no, the agent sees what went wrong and what to do, in plain words, and it goes in the file's history. If an agreement in DocuSeal is gone or has no boxes, ClaimReach rebuilds it and sends again by itself.

## Three views, one frame

The views are now Guided, Collapsible and All questions. They are the same intake, the same questions and the same answers underneath. Nothing about the intake logic changed.

- **Guided** is the easiest one. It shows one step at a time, with the words to say in a big navy card and one big button for the next step.
- **Collapsible** is built from your renderings. Every section is a card with its progress ring, and you open one at a time.
- **All questions** is the whole intake open on one page, numbered, with boxes you tick.

Every view now has the same frame:

- **The top:** her name, the call clock, Text and End call.
- **The progress bar:** the intake progress, with the view switch under it. The switch sits in exactly the same spot in all three views, on every device.
- **The bottom:** Help, Note, and one big button for the next step.
- **On an iPad turned sideways or a computer:** the caller and the qualifiers are on the left in every view. The helper is on the right in every view, always open. It shows what to say now, reminders, what's still missing (tap one to jump to it), rebuttals for this part of the call, and Ask CaseCure.
- **On a computer:** the right side also has tabs for Scripts, Texts, Phone, Agreement, File and Tools.
- **On a phone:** Help opens on Now, which shows the same helper.

## Cleaned up

- Every view starts with the real opening script.
- No beige or gold boxes anywhere on the call screens. The palette is white hairline boxes, navy for what to say and the next step, blue for what's picked, green for done, and red only for a problem.
- The bottom of All questions no longer has the footer of USE buttons or the Save Progress buttons. It saves on its own and says Saved at the top and under the section she's in. Finish intake is still at the end of 7. Retainer. The agreement send is one clean box, with any warning right above the button.
- Conversation, Quick Capture and Q&A are out of the menu.

## Tested

The tests clicked every button in every view at every step of the call, on a phone, an iPad upright and sideways, and a computer. That was 2,391 clicks with no errors. A small iPad, a small phone, a narrow computer window and a big monitor were checked for layout. They also ran each view start to finish, a send that fails, switching views mid-call (you land on the same section with every answer in place), and a scan of every screen for beige.
