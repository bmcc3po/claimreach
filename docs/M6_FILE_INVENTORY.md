# M6 firm case file — inventory

Brett's ruling (2026-08-23): `/m6` was wrongly rebuilt from zero. A TMP firm
user opening a Motel 6 case must get the existing internal file
(`LeadWorkspace` on `/leads/[id]`), fenced for firm and money-blind. This
supersedes any casefile-v2 visual redesign.

Staff `/m6` (`CaseFile`) and staff `/leads/[id]` stay unchanged.

No new migration. Fence is queries + UI. Firm writes stay on the existing
m6 RPCs (`/api/m6/note`, `/api/m6/lor`, `/api/m6/touch`). Staff-only tables
(`qa_reviews`, `qa_thread`, `retainers`) are never opened to a firm JWT.

| Internal tab / section | Decision | Why |
|---|---|---|
| Header (name, file #, campaign, date, status) | **reuse / fence-filter** | Same `LeadWorkspace` header. Back goes to `/m6/cases`. Campaign is a label (already owner/admin-only to change). `FileStatusControl` already refuses firm edits. |
| Header stats (`signed` / `WIP` / `weekPay` / `tierA`) | **hide** | Staff KPIs. `weekPay` is money. |
| Export PDF | **hide** | `/api/export/intake-pdf` is staff-only. |
| Send to firm | **hide** | Staff delivery action. Firm is the recipient. |
| Lock file | **hide** | Staff-only write on `leads`. |
| FloatingDock (Crissi, Vitals, Assist, Integrity, Maverick, Grievous) | **hide** | Staff tools. Grievous / Maverick / Integrity are intake-floor. |
| Injured-party banner (`PncBanner`) | **reuse / fence-filter** | Same banner, read-only. Firm cannot PATCH `pnc_status` (`firm_stage_only_guard`). |
| Pipeline strip | **reuse** | Display-only stage map. Does not write `current_stage`. |
| WIP / resubmit-to-QA banner | **hide** | Staff QA loop. |
| Add another claim | **hide** | Staff intake. `/api/claims` is firm-forbidden. |
| **Overview** | **reuse / fence-filter** | Same `CaseOverview`. Actions say review, not run intake / generate retainer. No money. |
| **Case Questions** | **reuse / fence-filter** | Same field set via `resolveFormKey` / `resolveIntakeFields`. Firm gets a read-only review (no GuidedIntake write). Scripts, `agentNote`, and `choices[].note` stripped. Compliance / leading-statement gate is staff-only. |
| **Contact Info** | **reuse / fence-filter** | Same `ContactInfo` read-only view. Edit toggle hidden. SSN reveal stays staff-only. |
| **Case Details** | **reuse / fence-filter** | Same `CaseDetails` read-only view. Edit hidden. **Case tier / rating hidden** (staff KPI). Routing names resolved server-side (firm JWT can only read its own `app_users` row). |
| **QA** | **reuse / fence-filter** | Tab is shown (Brett listed it). Coaching grades, agent notes, internal thread, Approve / WIP / Flag / Decline stay staff-only (`qa_reviews` / `qa_thread` are internal RLS). Firm sees claim status + `grievous_verdict` already on `claims` (firm-readable). |
| **Retainer** | **reuse / fence-filter** | Status + signed copies only. Generate / send / templates / Grievous / SignWell / packet send hidden. No rates, bills, payouts. Loaded server-side (retainers RLS is internal; no new policy). |
| **Messages** | **reuse / fence-filter** | Same `CommsTimeline` (`channel=sms`). Compose / JustCall send hidden (P1 send rails are a later branch). Firm can already SELECT `communications` for their firm. |
| **Calls** | **reuse / fence-filter** | Same `CommsTimeline` (`channel=call`). Dialer `tel:` kept. JustCall AI sentiment / summary hidden (staff KPI). |
| **Notes** | **reuse / fence-filter** | Same `NotesTab` list from `notes` (firm SELECT already). Add posts to existing `/api/m6/note` → `lead_notes` (firm cannot INSERT `notes`). One thread definition; two tables only because RLS already splits them. |
| **Timeline** | **reuse / fence-filter** | Same `CaseTimeline` on `audit_log` (firm SELECT already). Money-shaped descriptions stripped. |
| **Activity Log** | **reuse / fence-filter** | Same `ActivityLog` on the same `audit_log` rows. Same money strip. |
| `CaseFile` rebuilt workbench (health, contact points, comms feed, schedule) | **hide for firm** | That rebuild is what Brett rejected. Staff `/m6` still uses it. |
| Letter of representation | **reuse** (m6 rail, not an internal tab) | Existing `LorCard` / LOR API. Already firm-writable. Not a second file. |
| Log a touch | **reuse** (m6 rail) | Existing `LogTouch` + `/api/m6/touch`. Not a send rail. |
| Identified properties | **reuse** (m6 rail) | Existing property-identification read. TMP-only, already fenced. |

## Money-blind (absolute for firm)

Hidden everywhere on the firm file: rates, bills, payouts, costs, `weekPay`,
`bill_rate`, case tier / rating, staff KPI chips, JustCall sentiment.
`canSeeMoney` on role `firm` is already false. This fence does not grant
`money.view`. Trafficking *case facts* about money exchanged stay — those are
intake answers, not Innovative economics.

## Unchanged for Innovative staff

- `/leads/[id]` → `LeadWorkspace` with no fence prop (internal staff default).
- `/m6/cases/[id]` for an internal role → existing `CaseFile`.
- No change to `gate.ts` role defaults or RLS.
