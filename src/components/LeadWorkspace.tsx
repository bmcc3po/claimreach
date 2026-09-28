"use client";
import { useState, useEffect, type ReactNode } from "react";
import { LX } from "@/lib/lexicon";
import FloatingDock from "./FloatingDock";
import IntakeSurface from "./IntakeSurface";
import CaseOverview from "./CaseOverview";
import StatusBadge from "./ui/StatusBadge";
import FileStatusControl from "./FileStatusControl";
import ActivityLog from "./ActivityLog";
import ContactInfo from "./ContactInfo";
import CaseDetails from "./CaseDetails";
import CaseDocuments from "./CaseDocuments";
import RetainerTab from "./RetainerTab";
import NotesTab from "./NotesTab";
import CommsTimeline from "./CommsTimeline";
import QaPanel from "./QaPanel";
import CaseTimeline from "./CaseTimeline";
import {
  INTERNAL_STAFF_FENCE, fileBackHref, fileMayEditLead, fileMayExportPdf,
  fileMayUseStaffTools, fileTabs, type FileFence,
} from "@/lib/file-fence";
import type { IdentifiedProperty } from "@/lib/property-tool";

interface Claim {
  id: string;
  claim_type: string;
  campaign: string | null;
  status: string;
  qualification: string;
  on_behalf_of: boolean;
  is_this_file: boolean;
  answers?: Record<string, any>;
  grievous_verdict?: string | null;
}

const TABS_HELP = "tabs are computed once in file-fence.ts";

export default function LeadWorkspace({
  lead, claims, activity, stats, claimProperties, audit, notes, callLogs, staff = [], formsByType = {},
  fence = INTERNAL_STAFF_FENCE, headerActions, retainers, signables, identified = [], lor = null,
  points = [], lastComm = null, appCall = null,
}: {
  appCall?: { rows: { k: string; v: string }[]; answered: number; href: string; hasOld: boolean; when: string | null; agent: string | null; dispo: string | null } | null;
  lead: any;
  claims: Claim[];
  activity: any[];
  stats?: { signed: number; tierA: number; weekPay: number; wip: number };
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
  staff?: { id: string; full_name: string }[];
  formsByType?: Record<string, any[]>;
  fence?: FileFence;
  headerActions?: ReactNode;
  retainers?: any[];
  signables?: any[];
  identified?: IdentifiedProperty[];
  lor?: { status?: string | null; sent_on?: string | null; sent_to?: string | null } | null;
  points?: { id: string; kind: string; value: string; label?: string | null; status: string }[];
  lastComm?: { channel?: string; direction?: string; occurred_at?: string; outcome?: string; body?: string; agent_name?: string } | null;
}) {
  const [showOldForm, setShowOldForm] = useState(false);
  // The freshest saved values for this file in THIS session. A tab that
  // unmounts and comes back re-initializes from here, not from the stale
  // server props, so an edit cannot resurrect old values (Astra round 3).
  const [leadLive, setLeadLive] = useState<any>(lead);
  const liveUp = (patch: Record<string, any>) => setLeadLive((s: any) => ({ ...s, ...patch }));
  // A refreshed server record re-syncs the live copy (Astra round-3 review:
  // init-once ignored router refreshes). Editors initialize their own state
  // on mount, so this never resets active typing.
  useEffect(() => { setLeadLive((s: any) => ({ ...s, ...lead })); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [lead.updated_at]);
  const [activeClaimId, setActiveClaimId] = useState(
    claims.find((c) => c.is_this_file)?.id ?? claims[0]?.id ?? null
  );
  const [tab, setTab] = useState("Overview");
  const [editMode, setEditMode] = useState(false);
  const activeClaim = claims.find((c) => c.id === activeClaimId);
  const [showAddClaim, setShowAddClaim] = useState(false);
  const canEdit = fileMayEditLead(fence);
  const canTools = fileMayUseStaffTools(fence);
  const TABS = fileTabs(lead.current_user_role, fence);
  const backHref = fileBackHref(fence);
  const safe: string[] = Array.isArray(lead.comms_safe_channels) ? lead.comms_safe_channels : [];

  function claimClass(c: Claim) {
    if (c.status === "dq") return "claimchip dq";
    if (c.status === "signed") return "claimchip signed";
    if (c.id === activeClaimId) return "claimchip active";
    return "claimchip";
  }

  return (
    <div>
      {/* The file header: name as the anchor, everything else calm around it. */}
      <div className="lf-head">
        <a className="lf-back" href={backHref} title="Back to your queue" aria-label="Back to your queue">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <div className="lf-id">
          <div className="lf-name">
            <span>{lead.claimant_name ?? "Unnamed claimant"}</span>
            <span className="lf-no">{lead.lead_no}</span>
          </div>
          <div className="lf-sub">
            <CampaignPicker leadId={lead.id} current={activeClaim?.campaign || lead.campaign} role={lead.current_user_role} />
            {appCall && lead.firm_name && (<>
              <span className="leadhead-dot">·</span>
              <span title="The attorney this case signs with">Attorney: {lead.firm_name}</span>
            </>)}
            {lead.created_at && (<>
              <span className="leadhead-dot">·</span>
              <span>Opened {new Date(lead.created_at).toLocaleDateString()}</span>
            </>)}
            {canTools && stats ? (<>
              <span className="leadhead-dot">·</span>
              <span className="lf-stat"><b>{stats.signed}</b> signed</span>
              <span className="lf-stat"><b>{stats.wip}</b> WIP</span>
            </>) : null}
          </div>
        </div>
        <div className="lf-acts">
          {headerActions}
          {fileMayExportPdf(fence) && (
            <a className="cl-btn cl-ghost cl-sm" href={`/api/export/intake-pdf?lead_id=${lead.id}`} target="_blank" rel="noopener noreferrer" title="Download this claimant's full intake as a PDF">Export PDF</a>
          )}
          {canTools && ["owner", "admin", "manager", "qa"].includes(lead.current_user_role || "") && <SendToFirmButton leadId={lead.id} />}
          <FileStatusControl leadId={lead.id} claimId={activeClaim?.id} current={activeClaim?.status ?? lead.status ?? "new"} role={lead.current_user_role} />
          {canTools && <LockFileButton lead={lead} />}
        </div>
      </div>
      {claims.length > 1 && (
        <div className="claimsrow" style={{ margin: "0 0 12px" }}>
          {claims.map((c) => (
            <button key={c.id} className={`claimtab ${activeClaimId === c.id ? "on" : ""}`} onClick={() => setActiveClaimId(c.id)}>
              {(c.campaign || c.claim_type)}
            </button>
          ))}
        </div>
      )}

      {/* WIP fix banner: QA sent this back. Resubmit returns it to the QA queue. */}
      {canTools && lead.wip_pending && <WipBanner lead={lead} signed={/^signed_/.test(activeClaim?.status || "")} />}

      {/* Main grid */}
      <div className="lead-grid solo">
        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); setEditMode(false); }}>{t}</button>
            ))}
            {canEdit && (tab === "Contact Info" || tab === "Case Details") && (
              <button className={`edit-toggle ${editMode ? "on" : ""}`} onClick={() => setEditMode((v) => !v)} title={editMode ? "Done editing" : "Edit"} style={{ alignSelf: "center", marginRight: 8, marginLeft: "auto" }}>
                {editMode ? "✓ Done" : "✎ Edit"}
              </button>
            )}
          </div>
          <div className="formbody">
            {tab === "Overview" && (<>
              <CaseOverview lead={leadLive} activeClaim={activeClaim} notes={notes} callLogs={callLogs} fence={fence} identified={identified} lor={lor} lastComm={lastComm} points={points} onGo={(t) => { setTab(t); setEditMode(false); }} />
              {/* Injured-party status and the pipeline live at the bottom of
                  Overview now; the old "File detail" fold bar is gone. */}
              <div style={{ marginTop: 18 }}><PncBanner lead={lead} readOnly={!canEdit} /></div>
              <div style={{ marginTop: 12 }}><PipelineStrip status={activeClaim?.status ?? lead.status ?? "new"} /></div>
            </>)}
            {tab === "Case Questions" && appCall && !showOldForm && (
              <AppAnswers call={appCall} onShowOld={appCall.hasOld ? () => setShowOldForm(true) : undefined} />
            )}
            {tab === "Case Questions" && activeClaim && (!appCall || showOldForm) && (
              <div>
                {appCall && <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setShowOldForm(false)}>Back to the App answers</button>}
                {canEdit && (
                  <div className="gate" style={{ marginBottom: 16 }}>
                    <span className="tag">Compliance notice</span>
                    Leading statements of any kind result in forfeiture of file credit and disciplinary
                    action. Ask every question in order and verbatim.
                  </div>
                )}
                <IntakeSurface
                  claimId={activeClaim.id}
                  firmId={lead.firm_id}
                  initialAnswers={activeClaim.answers ?? {}}
                  initialProperties={claimProperties[activeClaim.id] ?? []}
                  claimantName={lead.claimant_name ?? undefined}
                  claimantEmail={lead.email ?? undefined}
                  claimType={activeClaim.claim_type}
                  leadId={lead.id}
                  customFields={formsByType?.[activeClaim.claim_type]}
                  readOnly={!canEdit}
                />
              </div>
            )}
            {tab === "Case Questions" && !activeClaim && (
              <p className="muted">No intake on this file yet.</p>
            )}
            {tab === "Contact Info" && <ContactInfo lead={leadLive} claimType={activeClaim?.claim_type} editMode={canEdit && editMode} onRequestEdit={canEdit ? () => setEditMode(true) : undefined} points={points} onSaved={liveUp} />}
            {tab === "Case Details" && (
              <>
                <CaseDetails lead={leadLive} staff={staff} editMode={canEdit && editMode} onRequestEdit={canEdit ? () => setEditMode(true) : undefined} fence={fence} onSaved={liveUp} />
                <CaseDocuments leadId={lead.id} claimId={activeClaim?.id} />
              </>
            )}
            {tab === "QA" && <QaPanel leadId={lead.id} claimId={activeClaim?.id} role={lead.current_user_role} fence={fence} claimStatus={activeClaim?.status} grievousVerdict={activeClaim?.grievous_verdict} />}
            {tab === "Retainer" && <RetainerTab leadId={lead.id} claimId={activeClaimId} role={lead.current_user_role} fence={fence} initialRetainers={retainers} initialSignables={signables} />}
            {tab === "Messages" && <CommsTimeline leadId={lead.id} phone={lead.phone} channel="sms" fence={fence} />}
            {tab === "Calls" && <CommsTimeline leadId={lead.id} phone={lead.phone} channel="call" fence={fence} />}
            {tab === "Notes" && <NotesTab leadId={lead.id} claimId={activeClaim?.id} initial={notes} fence={fence} />}
            {tab === "Timeline" && <CaseTimeline entries={audit} />}
            {tab === "Activity Log" && <ActivityLog entries={audit} />}
          </div>
        </div>

        {canTools && <FloatingDock lead={lead} claimId={activeClaim?.id} claimType={activeClaim?.claim_type ?? "motel_trafficking"} />}
      </div>
    </div>
  );
}

function CampaignPicker({ leadId, current, role }: { leadId: string; current?: string | null; role?: string }) {
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const canChange = role === "owner" || role === "admin";
  async function load() {
    try { const d = await (await fetch("/api/campaigns")).json(); setCampaigns((d.campaigns ?? []).filter((c: any) => c.active)); } catch {}
  }
  async function choose(id: string) {
    setBusy(true);
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set_campaign", lead_id: leadId, campaign_id: id }) });
    const d = await r.json();
    setBusy(false);
    if (d.ok) window.location.reload();
  }
  if (!canChange) return <span className="leadhead-campaign" title="Campaign — the spine of this file">{current || "No campaign set"}</span>;
  return (
    <span className="campaign-picker">
      <button className="leadhead-campaign as-btn" title="Campaign is the spine of this file. Click to change." onClick={() => { if (!open) load(); setOpen(!open); }}>
        {current || "Set campaign"} ▾
      </button>
      {open && (
        <div className="campaign-menu" onMouseLeave={() => setOpen(false)}>
          <div className="campaign-menu-hint">Campaign drives intake, retainer, and e-sign. Changing it re-spines this file.</div>
          {campaigns.map((c) => (
            <button key={c.id} className="campaign-menu-item" disabled={busy} onClick={() => choose(c.id)}>{c.name}</button>
          ))}
          {campaigns.length === 0 && <div className="campaign-menu-hint">No active campaigns.</div>}
        </div>
      )}
    </span>
  );
}

function PipelineStrip({ status }: { status: string }) {
  // Map any status to one of five pipeline stages.
  const stages = ["Intake", "Grievous", "QA", "Approved", "Firm"];
  let active = 0;
  if (/grievous/.test(status)) active = 1;
  else if (/^(qa|signed_qa)$/.test(status)) active = 2;
  else if (/wip|flag/.test(status)) active = 2; // back in the QA loop
  else if (/approved/.test(status)) active = 3;
  else if (/delivered|retained|dropped|dq/.test(status)) active = 4;
  else active = 0;
  return (
    <div className="pipeline-strip">
      {stages.map((s, i) => (
        <div key={s} className={`pipe-step ${i < active ? "done" : ""} ${i === active ? "on" : ""}`}>
          <span className="pipe-dot" />
          <span className="pipe-label">{s}</span>
          {i < stages.length - 1 && <span className="pipe-bar" />}
        </div>
      ))}
    </div>
  );
}

function WipBanner({ lead, signed }: { lead: any; signed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function resubmit() {
    setBusy(true);
    const status = signed ? "signed_qa" : "qa";
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "status", lead_id: lead.id, status }) });
    setBusy(false);
    if (r.ok) { setDone(true); setTimeout(() => window.location.reload(), 700); }
  }
  return (
    <div className="wip-banner">
      <div>
        <strong>QA sent this back for a fix.</strong>
        <span className="muted" style={{ marginLeft: 8 }}>Correct what was flagged (check the QA tab and internal thread), then resubmit so QA can re-review.</span>
      </div>
      <button className="btn" disabled={busy || done} onClick={resubmit}>{done ? "Resubmitted" : busy ? "Resubmitting…" : "Resubmit to QA"}</button>
    </div>
  );
}

function PncBanner({ lead, readOnly = false }: { lead: any; readOnly?: boolean }) {
  const [state, setState] = useState<string>(lead.pnc_status ?? "speaking_with_ip");
  const [saving, setSaving] = useState(false);

  const STATES = [
    { id: "speaking_with_ip", label: "Speaking with IP" },
    { id: "deceased_ip", label: "Deceased IP" },
    { id: "minor_ip", label: "Minor IP" },
  ];

  async function pick(s: string) {
    setState(s); setSaving(true);
    await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: { pnc_status: s } }),
    }).catch(() => {});
    setSaving(false);
  }

  const note = state === "speaking_with_ip"
    ? "Speaking with the injured party. They sign for themselves, no OBO needed."
    : state === "deceased_ip"
    ? "Injured party is deceased. Speak only with the OBO (surviving spouse/executor) who has legal authority and signs the retainer."
    : "Injured party is a minor. Speak only with the parent/guardian (OBO) who signs the retainer.";

  return (
    <div className={state === "speaking_with_ip" ? "pnc" : "pnc warn"}>
      <div className="pncbadge">{state === "speaking_with_ip" ? "✓" : "!"}</div>
      <div style={{ flex: 1 }}>
        <strong>Injured Party: {lead.claimant_name ?? "—"}</strong>
        <div className="muted">{note}</div>
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {STATES.map((s) => (
            <button key={s.id} className={`chip ${state === s.id ? "active" : ""}`}
              disabled={saving} onClick={() => pick(s.id)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateClaim({ leadId, firmId }: { leadId: string; firmId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<{ value: string; label: string; campaign?: string }[]>([]);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/claim-types"); const d = await r.json(); setTypes(d.types ?? []); } catch {}
  })(); }, []);

  async function create(type: string, campaign?: string, dupReason?: string) {
    setBusy(true);
    const r = await fetch("/api/claims", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", lead_id: leadId, firm_id: firmId, claim_type: type, campaign: campaign || null, dup_override_reason: dupReason || null }),
    });
    const d = await r.json().catch(() => ({}));
    // Same-case-type dedup: agent must justify before we allow it.
    if (r.ok && d.needs_override) {
      setBusy(false);
      const reason = window.prompt(`${d.message}\n\nWhy is this PNC getting another intake for the same case type? What is unique about this claim vs the existing one? (required)`);
      if (!reason || !reason.trim()) return; // cancelled, no override
      return create(type, campaign, reason.trim());
    }
    if (r.ok && d.id) { location.reload(); return; }
    setBusy(false);
    alert(`Could not create claim: ${d.error || r.status}`);
  }

  if (!open) {
    return <button className="claimchip subtle" onClick={() => setOpen(true)} title="Use this when the same person has a second, separate matter (e.g. a different mass tort)">+ Add another claim</button>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {types.map((t) => (
        <button key={t.value} className="chip" disabled={busy} onClick={() => create(t.value, t.campaign)}>{t.label}</button>
      ))}
      <button className="chip" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

function LockFileButton({ lead }: { lead: any }) {
  const [locked, setLocked] = useState(!!lead.is_locked);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: { is_locked: !locked } }) });
    setBusy(false);
    if (r.ok) setLocked(!locked); else { const d = await r.json().catch(() => ({})); alert(`Lock failed: ${d.error || r.status}`); }
  }
  return (
    <button className={`cl-btn cl-sm ${locked ? "" : "cl-ghost"}`} onClick={toggle} disabled={busy} title={locked ? "File is locked, click to unlock" : "Lock this file read-only"}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {locked
          ? <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>
          : <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>}
      </svg>
      {locked ? "Unlock file" : "Lock file"}
    </button>
  );
}

function SendToFirmButton({ leadId }: { leadId: string }) {
  const [state, setState] = useState<{ sentAt: string | null; result: string | null }>({ sentAt: null, result: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/firm-delivery?lead_id=${leadId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setState({ sentAt: d.firm_sent_at ?? null, result: d.firm_send_result ?? null });
      } catch {}
    })();
    return () => { alive = false; };
  }, [leadId]);

  async function send(force: boolean) {
    const already = !!state.sentAt;
    if (already && !force) { if (!confirm("This file was already sent to the firm. Resend it?")) return; force = true; }
    if (!force && !confirm("Send this file to the firm now?")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/firm-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, force }) });
      const d = await r.json();
      setBusy(false);
      if (!r.ok) { setMsg(d.error || "Send failed"); return; }
      if (d.skipped) { setMsg(`Skipped: ${d.skipped}`); return; }
      setState({ sentAt: new Date().toISOString(), result: "sent" });
      setMsg(`Sent to ${d.to || "firm"} (${(d.attachments || []).length} attachment${(d.attachments || []).length === 1 ? "" : "s"})`);
    } catch (e: any) { setBusy(false); setMsg(e?.message || "Send error"); }
  }

  const label = busy ? "Sending…" : state.sentAt ? "Resend to firm" : "Send to firm";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button className="cl-btn cl-ghost cl-sm" onClick={() => send(false)} disabled={busy}
        title={state.sentAt ? `Already sent ${new Date(state.sentAt).toLocaleString()}` : "Email the firm this file's documents"}>
        {label}
      </button>
      {msg && <span className="muted" style={{ fontSize: 11.5 }}>{msg}</span>}
    </span>
  );
}


// Case Questions for a file worked in the App: the App's answers, read only,
// with a way into the App to keep going. Same rows as the printed case.
function AppAnswers({ call, onShowOld }: {
  call: { rows: { k: string; v: string }[]; answered: number; href: string; when: string | null; agent: string | null; dispo: string | null };
  onShowOld?: () => void;
}) {
  const when = call.when ? new Date(call.when).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Answered in the App</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {call.answered ? `${call.answered} answers` : "Nothing answered yet"}{when ? `, last saved ${when}` : ""}{call.agent ? ` by ${call.agent}` : ""}{call.dispo ? `. Dispo: ${call.dispo}` : ""}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onShowOld && <button className="btn ghost sm" onClick={onShowOld}>Show the old intake form</button>}
          <a className="btn sm" href={call.href}>Open in the App</a>
        </div>
      </div>
      {call.rows.length === 0 ? (
        <p className="muted">No call on this file yet. Open it in the App to take the call.</p>
      ) : (
        <table className="docket" style={{ width: "100%" }}>
          <tbody>
            {call.rows.map((r) => (
              <tr key={r.k}><td className="muted" style={{ width: 200, verticalAlign: "top" }}>{r.k}</td><td style={{ fontWeight: 500 }}>{r.v}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
