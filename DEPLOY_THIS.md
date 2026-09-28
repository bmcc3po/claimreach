# ClaimReach deploy: audit repairs + clean ending flow + one product

One zip, on top of what's live (PR #31). Upload it the usual way. It holds three blocks, all tested together: the Astra audit repairs (both rounds), the clean call-ending flow, and the UI consolidation you asked for. Verified on a clean copy of live main: type check clean, 43 engine tests pass, Cloudflare build prints 190 routes and Build completed.

## The clean ending flow

One straight line, one button at a time, no guessing what's next:

- She signs while you're on the send screen → the button becomes **Next: Finish the agreement**.
- The file steps walk **Agreement → Her info → Crash** (passengers when there are any) → **Next: Close the call**.
- Close shows the goodbye script and one green **Finish the call** button.
- The dispo screen ends with **Save the call**. The chore list's last button says **Finish the call** too.

## One product

- **The file's front door is decluttered.** Overview shows only what the file actually has: one facts panel (a row per real fact, no "No calls yet" boxes), six clean action rows with line icons instead of emoji cards, then the injured-party banner and the pipeline. The "File detail" fold bar is gone; its contents live at the bottom of Overview.
- **No pastels.** Every washed-out tint is gone: status banners, the Qualified bar, chips, badges, the highlighted action card and the script boxes are white with strong borders, or filled solid. Compliance scripts now sit in navy "read verbatim" cards on every intake surface, same as the call console. A picked answer fills solid navy (green check), not a pale wash.
- **Reports rebuilt** on the site's system: the four counts as one KPI panel, pull-files with its filters in the panel header, and the four breakdowns as clean bar panels. Same numbers, same definitions (Signed still comes from the status table's own flags).
- **Motel 6 intake and its file folder look like the MVA side now.** The Motel questionnaire (Guided and All sections) wears white cards, navy scripts and blue accents, and the m6 firm file picks up the same file header, tabs and read views as the internal lead file. No wording changed anywhere, on any script.
- **The colors you actually picked.** The putty gold is gone from the entire product. Vibrant blue is the working accent everywhere (active tabs, selections, section labels, focus rings, the sidebar's active item). Bright green is the pop, reserved for the big actions: New call, Send, the primary buttons, your avatar. Green/amber/red keep their meanings (good, missing, problem) and nothing else wears them. Cream chips on the call screens went light blue.
- **The lead file** wears the same design as the rest of the site: a calm header (name first, file number beside it, campaign, attorney, opened date and your counts on one quiet line, real buttons on the right), underline tabs that scroll on a phone instead of stacking, and the read views, pipeline strip and edit toggle retuned to match. Same file for the firm view, nothing moved.
- **Contact Info** drops the open text boxes: state, preferred language, preferred time, preferred contact method and time zone are dropdowns now. Anything already typed the old way still shows and still saves — picking once cleans it.
- **Case Details** call outcome joins the option lists (Settings → option lists; free text still allowed until you fill the list).
- **QA queue and My Queue** rebuilt on the site's tables and tabs.
- **The Delivery Board** keeps its wall-display scale but wears the product navy, gold and type.
- Settings and Team pages get the same page headers. The deeper admin screens (Users, Firms, Templates, Integrations) already pick up the new type and lines; their full layouts are the next pass.

## The audit repairs (already written up, still in this zip)

Everything from both Astra rounds: verified-only e-sign webhook, whole-packet firm deliveries that refuse an empty retainer even on force, signed-file recovery that reaches completed rows, ordered saves with revision checks and unmount flushes, converging property saves, tier-correct completeness counts, honest save errors, internal-only exports, half-created leads cleaned up, DOB/SSN structured fields with last-4 masking and the per-campaign full-SSN rule, "Open the file" going to the real case page.

## SQL: nothing for you to run

0100 Part A, 0101 (both parts) and 0102 are **already applied to the live database and verified** — I applied them at your direction and probed them with a simulated agent login: editing your own name works, giving yourself owner is blocked, a deactivated login gets zero rows from the database itself, active agents unchanged. RUN_THESE_MIGRATIONS.sql is the record, not a to-do.

## Your steps after the upload deploys

1. **DocuSeal webhook** (still 401ing every few minutes): in DocuSeal with test mode OFF, set the webhook URL to `https://claimreach.com/api/esign/docuseal?key=` plus your DOCUSEAL_WEBHOOK_SECRET, tick form.viewed, form.completed, form.declined, submission.completed. Tell me when saved and I'll confirm the 401s stop.
2. **Retry the Cloudflare deployment** so the live DOCUSEAL_API_KEY you added is actually in the running build, then send one test agreement. I'll confirm from the database that it hit the live DocuSeal account, not the test one.
3. Supabase dashboard → Auth: turn on **leaked-password protection** (one toggle).
4. Send me the **Motel retainer packet PDFs** and I'll build Motel on DocuSeal.

## Still open, on purpose

- Full restyle of Users, Firms, Templates, Integrations internals — next pass.
- Roles / who-sees-what (your remote agent) — designed, waiting on your go-ahead.
- Cross-role negative tests, outage and backup drills — need you present.
- Grievous false-failure display — still not reproduced; needs your screen.
