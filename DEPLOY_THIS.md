# ClaimReach deploy: rounds 3, 4 and 5 in one zip

On top of merged main (a887ce6). Round 5 answers Astra's review of the round-3 file; rounds 3 and 4 ride along unchanged. This zip replaces every earlier one, and PR #35 should be updated with these files.

## Round 5: Astra's round-3 review, verified and fixed

- **Its P1 on the crash date was right, and it was my regression.** The pin-at-pick fix patched one handler while the guided rows use another, so switching a picked calendar date to "Today" could keep the OLD date and send it into the agreement. Every handler that touches the when-answer now runs the same date rule (Today/Yesterday pin the real calendar date at that moment; clearing the answer clears the date), and a new engine test drives the exact reproduction. 44 engine tests pass.
- **Property replacement is now serialized per claim**, not just transactional: a per-claim advisory lock means two overlapping saves queue instead of both inserting into an empty set, and the function refuses a claim the caller cannot see. Applied live and probed (0106).
- **The packet has a real manifest.** doc_count is stamped when a signing completes; recovery retries until every expected PDF and the certificate are stored (missing secondaries included, each with its own guarded write); delivery refuses a packet that is shorter than its manifest or a completed signing with no stored primary.
- **The anon EXECUTE revokes were ineffective — Astra verified it and was right.** PUBLIC's implicit grant survived the earlier per-role revokes, and 0103's create-or-replace had re-applied default grants. 0106 revokes PUBLIC and grants back exactly what each function needs; verified with has_function_privilege: anon has NO effective EXECUTE on any guard or helper, authenticated keeps the RLS helpers, and an active agent's access is unchanged.
- **The contact cache follows server refreshes** and the Overview reads the same live copy, so panels agree; editors still keep their own state while mounted, so typing is never reset.
- **SSN mode pins on the first keystroke**, so four typed digits of a full SSN can never remount as Last 4.
- **One signed definition for staff AND firm reports**: signedStatusKeys now seeds Delivered/Retained/signed constants and builds on isSignedStatus, so the firm report (which has no status catalog) counts the same files as yours.
- **Archive-failure honesty**: if the half-made lead cannot be archived, the response says so and names the lead, instead of claiming it was archived.
- **"medical..pdf" style names** no longer produce a storage key the guard refuses after upload (dots collapse in the safe name).
- **Pain notes on the call (Brett, Sep 28).** The moment an injury box is checked on the Pain question, a "Pain notes" box opens right under it — in Guided, Collapsible, All questions and the one-question views — so the agent writes what she says about the pain while she is saying it. "Says she's fine" alone opens nothing (the soreness rebuttal owns that moment). The note saves with the call like every other answer, shows in the injury section summary, and rides into the printed case summary and the firm report. 45 engine tests pass.

## Round 4 (also in this zip)

QA routing restricted to QA roles with a records-verified e-sign gate; claim-scoped status changes; credentials tables locked to owner/admin at the database (0104); Lexamica send gated; case email requires the export permission; deactivated accounts locked out of the e-sign route; bulk move-firm owner/admin and moves claims; the legacy property save rerouted off a nonexistent table; authorization columns stripped from generic saves; My Work scoped to you; truthful signing-email marker; failed full Grievous review clears stale approval; honest Delivery Board refresh; SLA firm-without-mapping sees nothing. Plus speed to lead: first-dial (JustCall webhook) and first-open clocks per lead, reported per campaign in Reports (0105).

## Round 3 (also in this zip)

Canonical storage keys (0103), guided final answer, dispo save gating, certificate-only recovery, cert-required delivery refusal, inactive user managers, phantom archive column, Reports signed definition, Grievous response contract, explicit SSN mode, campaign re-spine, the transparent-button token fix.

## SQL: nothing for you to run

0103, 0104, 0105, 0106 all applied and probe-verified. RUN_THESE_MIGRATIONS.sql is the record.

## Still open by design (the continuing backlog, from Astra's full audit)

Automations/drips stay dormant until their runner and STOP gates are rebuilt; the in-house signer's full emergency hardening (frozen evidence, replay guards, linked re-sign) is the next block; inbound phone attribution; per-claim campaign-change atomicity; the unified design concept is post-launch; internal case visibility across firms is your access-matrix decision; Motel DocuSeal awaits your PDFs.

## Your steps after the upload deploys

Unchanged: Cloudflare Retry deployment for the live DOCUSEAL_API_KEY, one fresh test agreement, the Supabase leaked-password toggle.

---

# ClaimReach deploy: Astra rounds 3 + 4

One zip, on top of merged main (a887ce6, PR #33 + your continuity files). It carries BOTH repair rounds: round 3 (Astra's review of the one-product zip) and round 4 (Astra's full-site admin audit). Upload this one; it replaces the round-3 zip.

## Round 4: confirmed from the full-site audit and fixed

- **QA routing is QA's job now.** The approval endpoint took any internal login, including an agent approving their own file, and trusted the reviewer's own checkboxes. Now: owner/admin/manager/qa only, deactivated accounts refused, and on the signed track an approval requires a real completed signing in the records, not a green checkbox.
- **A claim-specific status change touches THAT claim only.** The one status setter now takes a claim scope; the file screen and QA pass the active claim. An MVA dispo can no longer flip the Motel claim on the same person. Lead-level operations stay lead-wide on purpose.
- **Credentials are locked at the database** (migration 0104, applied live and probe-verified): the four integration tables (API keys, webhook endpoints, JustCall accounts, e-sign accounts) now answer only to owner/admin. Any agent could previously read and rewrite provider secrets through the data API. Your admin screens are unaffected. The drip enrollment function also refuses ordinary sessions now.
- **Sending a case to Lexamica had no role gate at all** — any logged-in session could push a case out of the building. Now active internal staff only.
- **Emailing a whole case out requires the Export leads permission**, same as the CSV and PDF exports.
- **Deactivated accounts can no longer send retainers** (the e-sign route checked role but not active).
- **Bulk move-firm** is owner/admin only and moves the claims with the leads instead of leaving them half-owned.
- **The legacy property save wrote to a table that does not exist** (lead_properties) and had been failing with a 500 since it was written; live-confirmed. It now writes to the one real store through the same atomic replace the intake uses.
- **A generic form save can no longer smuggle authorization facts** (grievous approval, firm-sent markers, firm/campaign moves, signed dates are stripped server-side; they have their own commands).
- **My Queue's "My Work" now means files assigned to you**, not the whole floor sorted by recency.
- **A failed signing email releases its claim marker** so the next sync retries, instead of staying marked sent forever.
- **A failed full Grievous review clears a stale approval**; the newest review is the one that counts.
- **The Delivery Board never says All clear over a failed refresh**; it says plainly the numbers are the last good ones.
- **A firm login with no firm mapping gets zero SLA rows**, never the whole floor.

## Speed to lead (also in this zip)

Every campaign now tracks the two clocks you asked for, both starting the moment the lead drops in, whatever the source: **first dial** (stamped by the JustCall webhook on the first outbound call or voicemail attempt to the lead's number, at the call's own time) and **first open** (stamped the first time staff open the file in ClaimReach, call screen or classic page, with who opened it). Both are write-once, and a call that predates the lead never counts, so a speed can never be negative. Reports has a Speed to lead panel per campaign: median time to first dial, percent dialed under 5 minutes (green at 80 percent and up), median time to first open, and how many were never dialed. The numbers ride along in the CSV export. Columns are live (migration 0105, applied); the clocks start counting on the next lead in.

## Round 3 (also in this zip; database side already applied)

Canonical storage-key authorization, atomic property replace, guided final-answer fix, dispo blocked on failed saves, certificate recovery that actually lands, delivery refusing incomplete packets, inactive managers locked out of user management, the phantom archived_for column, one Signed definition, the Grievous button contract, Today/Yesterday pinned at pick, explicit SSN mode, campaign re-spine, and the transparent-button token collision.

## Held deliberately, not forgotten

- Automations/drips stay dormant: the runner and pause/STOP gates get fixed BEFORE anything is enabled, per Astra's release order. Nothing in this zip turns sending on.
- The in-house signer stays as the emergency path; its full hardening (frozen packet evidence, replay guards, linked re-sign) is the next block and is not required for MVA launch since DocuSeal is primary.
- Inbound phone attribution (newest-lead guess) and the unified design concept are separate blocks; the design is post-launch per Astra's own brief.
- Internal roles seeing all firms remains your access-matrix decision.

## SQL: nothing for you to run

0103 and 0104 are applied and probe-verified. RUN_THESE_MIGRATIONS.sql is the record.

## Your steps after the upload deploys

Unchanged: Cloudflare Retry deployment for the live DOCUSEAL_API_KEY, one fresh test agreement, the Supabase leaked-password toggle, and Motel retainer PDFs when ready.

---

# ClaimReach deploy: Astra round-3 repairs

One zip, on top of PR #33 (deaf575). Astra's third review was verified finding by finding against the code and the live database; everything real is fixed here, and the database-side repairs are already applied and probe-verified.

## Confirmed and fixed in this zip

- **Primary buttons were transparent** (browser-confirmed by Astra): the new green action color collided with the pre-existing --cl-pop popover-shadow token. Renamed to --cl-act; a browser check now asserts the computed background is green.
- **Storage keys are authorized on their canonical form.** The document guard (applied live, migration 0103) refuses traversal, doubled or leading slashes, backslashes, percent-encoding and control characters; the documents API refuses to sign any non-canonical key and derives upload paths from the LEAD's firm, not the operator's, cleaning up orphan bytes if the metadata insert is refused. Probe-verified live: traversal and percent keys refused, clean keys accepted.
- **Property saves are one database transaction** (replace_claim_properties, applied live). Two overlapping saves can no longer interleave into zero properties; probe-verified that the later full set survives.
- **Guided intake's final answer no longer vanishes**: finishing saves the freshest pending snapshot, not the render's stale copy.
- **A call cannot end over unsaved answers**: the dispo save now requires the answers save to succeed and says plainly when it hasn't.
- **Certificate-only recovery actually lands**: each missing file gets its own guarded write, and the audit line only claims what really recovered.
- **A packet configured to carry the signing certificate does not send without it**; the refusal is logged like the retainer refusal, with a plain recovery hint.
- **Inactive managers are locked out of user management** (the route had its own gate that ignored active), and Deactivate/Reactivate in the UI no longer report success on a failed write.
- **The half-created-lead cleanup wrote to a column that does not exist** (archived_for) — the recurring phantom-column bug, live-confirmed. It now archives with real columns and returns the archived id.
- **Signed has ONE definition** (statuses.ts signedStatusKeys): table flags plus Delivered and Retained plus the signed_* family. Reports uses it.
- **Grievous button in the Retainer tab read a field the API never returns**; it now reads the real response.
- **Today/Yesterday pin the calendar date at the moment of the tap**, so a tab open across midnight cannot drift the crash date.
- **SSN keeps an explicit stored mode** (full vs last-4) instead of guessing from digit count.
- **Campaign changes re-spine claims completely** (campaign_id included).
- **Intake save retries re-check the fresh status**, so a retry can no longer reset an advanced file to Contacting.
- Remaining anon EXECUTE grants stripped (trigger guards, norm_phone) — measured three functions, not ten, but all revoked.

## Disputed or accepted as designed

- Per-field last-writer-wins on merged answers stands (the revision check prevents whole-record loss; a per-field CRDT is out of scope pre-launch).
- The SSN full-requirement is enforced fail-closed server-side at completion; the screen hint defaulting off during a config blip does not bypass it.
- Internal roles seeing all firms remains Brett's pending access-matrix decision, not a defect.
- Motel-on-DocuSeal still needs Brett's retainer PDFs; packetsFor stays TMP-MVA-only until then.

## SQL: nothing for you to run

Migration 0103 is applied and probe-verified. RUN_THESE_MIGRATIONS.sql is the record.

## Your steps after the upload deploys

Unchanged from last round: retry the Cloudflare deployment so the live DOCUSEAL_API_KEY serves (the 8:24 PM signing was still on the test account), send one fresh test agreement for me to confirm from the database, and flip leaked-password protection in Supabase Auth. The webhook you fixed is confirmed working.

---

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
