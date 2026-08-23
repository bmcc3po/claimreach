SPEC — phases build only on Brett's GO, one phase per branch.

# M6 COMMAND CENTER — master spec v2
Supersedes docs/M6_COMMAND_CENTER_SPEC.md and docs/M6_COMMS_ENGINE_SPEC.md.

North star: m6 is the SOURCE OF ALL TRUTH for Motel 6 cases — every
Innovative agent call, TMP action, Josh message, Levy note, Neos status
change, outbound text/email, and LOR event lives on ONE per-case timeline.
Specialized for trafficking-survivor intake, not a generic CRM.

Standing rules: AGENTS.md applies. Plan first, one branch per phase,
migrations numbered after checking ledger AND open branches. Firm vs staff
fences everywhere. Quiet hours + opt-out + safe-contact rules are HARD
gates on every outbound. All sends idempotent. No prompt()/alert() ever.

────────────────────────────────────────────────────────
DONE (launch skeleton, Aug 22-24)
────────────────────────────────────────────────────────
Tenant lockdown + RLS (0084-0087) · firm login + provisioning RPC (0088a)
· redirect map · touch RPC + guard fixes (0089, 0091) · modals/timestamps
polish · LawRuler webhook 9/9 fields · secondary-interview email worker
(feat/m6-email-intake) · property lookup tool (task/property-lookup, 0090)
· LOR card (0086). Remaining launch tasks: CSV backfill (D), subdomain (E).

────────────────────────────────────────────────────────
PHASE P1 — OUTBOUND RAILS: TEXT + EMAIL  (task/m6-send-rails)
────────────────────────────────────────────────────────
Prereqs (Brett): M6 JustCall number → retention_settings.sending_number;
Resend account + claimreach.com domain verified + RESEND_API_KEY/EMAIL_FROM
in Cloudflare + Supabase auth SMTP → Resend; TMP-approved templates.
1. Compose panel on case file: Text | Email tabs. Text via JustCall from
   the M6 number; Email via Resend, TMP-branded, attachments from case
   Documents. Template picker first; free text staff-always, firm per TMP.
2. Every send logged to communications and the unified Timeline.
3. Inbound SMS: JustCall webhook → match contact_points → inbound comm +
   "client replied" badge on Today; unmatched → review queue.
4. Failures visible on case + Today. No silent failures.
5. Hard gates: opt-out list, STOP auto-opt-out, quiet hours (client tz by
   area code), and SAFE-CONTACT rules (see Call Console §3) checked before
   EVERY send, manual or automated.

────────────────────────────────────────────────────────
PHASE P2 — TEMPLATES + SCRIPT LIBRARY  (task/m6-scripts)
────────────────────────────────────────────────────────
1. templates table (sms/email, merge fields, approved_by_firm). Firm
   drafts; only approved are sendable.
2. scripts table: call scripts with talking points + objection blocks,
   versioned, authored/approved workflow. CRISSI IS THE AUTHORITY: her
   trauma-informed methodology is the foundation of every m6 script; her
   approval flag gates a script from draft → live.
3. Script-in-use breadcrumb stored on each logged touch (feeds QA).

────────────────────────────────────────────────────────
PHASE P2.5 — ACTIVE CALL CONSOLE  (task/m6-call-console)  [NEW]
────────────────────────────────────────────────────────
The agent workbench: replaces the spreadsheet-next-to-a-phone workflow.
One screen during a live client interaction; nothing else needed.
1. "Start interaction" from Today or the case file → console takes over:
   client header (name, file #, stage, LOR status), SAFE-CONTACT banner,
   the script for this call type (from P2) in a side rail, disposition
   buttons (same set as Log a touch), running note field, schedule-next
   inline, quick actions (send approved text/email via P1 rails).
2. SAFE-CONTACT rules (from intake Q101/102): which channels are
   monitored/unsafe, discreet methods, best time. Rendered as an
   unmissable banner; violated channels are DISABLED in the console and
   in P1 compose (hard gate, not a warning).
3. "Are you in a safe place to speak" gate: first click of every call
   flow, logged. If no → one-tap schedule callback + safe-exit script.
4. CRISSI LAYER inline: per call stage (opening / tough questions /
   closing), her do-and-don't guidance and exact phrasing for hard
   moments surfaces contextually next to the script — embedded, not a
   linked PDF.
5. "Escalate to Crissi" button: pings her (channel TBD — SMS via
   JustCall or email v1), logs the escalation on the timeline.
6. Everything the agent does in the console lands on the case timeline
   automatically: call logged with duration, script version, disposition,
   note, sends, schedule changes. Zero double entry.
7. Agent readiness flag: app_users.m6_trained (set by staff admin when
   Crissi's class is completed). Console refuses M6 interactions for
   untrained agents. Crissi's classes remain the certification source.

────────────────────────────────────────────────────────
PHASE P3 — LADDER + BULK  (task/m6-ladder)
────────────────────────────────────────────────────────
1. Ladder walker on heartbeat: enroll on m6 entry, advance the seeded
   9-step ladder, inbound contact pauses/resets. Sends use P1 rails + P2
   templates; all gates apply.
2. Bulk updates: filter recipients (stage, LOR, last-reached), template,
   per-recipient preview + result log, idempotent per (run, lead).
3. Today: Comms section — replies waiting, failed sends, ladder paused,
   opted out, safe-contact conflicts.
LawRuler feature-parity checklist to mine while building (from Brett's
automation screenshots, /areas/lawruler-automations): per-campaign channel
toggles, delay-per-trigger scheduling, chained deliveries ("schedule
another delivery"), retrigger-on-status-reuse, attach-docs-to-send,
workflow side-effects (auto status/assignee change), task automation.
Adopt what fits the ladder model; skip lead-lock/snooze (retention design
covers them).

────────────────────────────────────────────────────────
PHASE P4 — PLAINTIFF FACT SHEET  (task/m6-pfs)
────────────────────────────────────────────────────────
As specced in v1: June M6 PFS content → intake_forms engine (form_key
m6_pfs), multi-property child blocks, PFS tab with status + resume,
outputs PDF / CSV / authed JSON API / email via P1. "PFS needed" flag on
Today post-LOR. E-sign authorizations = follow-on.

────────────────────────────────────────────────────────
PHASE P5 — NEOS INGEST  (task/m6-neos)  [NEW]
────────────────────────────────────────────────────────
Once TMP files suit in Neos, litigation state flows INTO the same case.
1. Reuse the proven Firm Pulse Neos feed pattern (tmp.claimreach.com).
2. Matter↔lead matching: decide the join key early — preferred: store the
   LawRuler leadid (or ClaimReach case #) as a custom field on the Neos
   matter at referral time; fallback matching (name+DOB) flagged for
   human confirm, never auto-merged.
3. Inbound fields v1: matter number, litigation status/phase, key dates
   (filed, deadlines), assigned attorney, notes explicitly flagged
   shareable. Everything lands as timeline events + a Litigation card on
   the case file.
4. Direction v1 is Neos→m6 read-only. m6→Neos writeback is a later
   decision, not assumed.

────────────────────────────────────────────────────────
PHASE P6 — MULTI-FIRM / LEVY TENANCY  (task/m6-multifirm)  [NEW]
────────────────────────────────────────────────────────
firm_access already supports N firms; this phase is policy + surfaces.
1. PREREQ (Brett + Josh/Turnbull, before any build): Levy's visibility
   contract — which files (their referrals only vs all), which content
   lanes (messages yes/no, documents which types, timeline full or
   filtered). Co-counsel visibility is political before technical.
2. Build: third firm row + firm_access seats; per-firm visibility policy
   table driving every m6 query (extends the existing fence, one
   definition); Messages becomes multi-party with per-thread audience
   (Innovative+TMP, +Levy, or all); timeline entries carry actor + firm
   and filter by viewer's policy.
3. Every actor writes through the same fenced paths — no per-firm code
   forks. Levy's Today view = their policy-filtered slice.

────────────────────────────────────────────────────────
SEQUENCE + BRETT'S MANUAL LIST
────────────────────────────────────────────────────────
Launch week: finish D (CSV) + E (subdomain), Josh onboarding, LOR pipeline
build (existing docs/LOR_PIPELINE_SPEC.md) runs next week per its own doc.
Then: P1 → P2 → P2.5 (console) → P3 → P4, with P5/P6 slotting in when
Neos referrals are live and the Levy contract is agreed.

Brett's manual list across phases: M6 JustCall number · Resend account +
DNS + SMTP switch + 2 env vars · template drafts → Josh approves · Crissi:
script bible handoff + class-completion roster + escalation channel choice
· final PFS question set · Neos custom field for the join key · Levy
visibility agreement with TMP · apply migrations as handed over.

PARKING LOT: e-sign authorizations; MAVERICK scoring on m6 calls;
"Ask Crissi" AI layer trained on her methodology (after her material is
digitized in P2); property clustering attorney view; m6→Neos writeback;
migration-ledger reconciliation (audit which of 0001-0091 actually exist
in production); convert Cloudflare Text vars to Secret type.
