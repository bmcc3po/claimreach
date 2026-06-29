"use client";
import { useState, useEffect } from "react";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { LX } from "@/lib/lexicon";
import FloatingDock from "./FloatingDock";
import ClaimIntake from "./ClaimIntake";
import CaseOverview from "./CaseOverview";
import StatusBadge from "./ui/StatusBadge";
import FileStatusControl from "./FileStatusControl";
import ActivityLog from "./ActivityLog";
import ContactInfo from "./ContactInfo";
import CaseDetails from "./CaseDetails";
import RetainerTab from "./RetainerTab";
import NotesTab from "./NotesTab";
import CommsTimeline from "./CommsTimeline";
import QaPanel from "./QaPanel";
import CaseTimeline from "./CaseTimeline";

interface Claim {
  id: string;
  claim_type: string;
  campaign: string | null;
  status: string;
  qualification: string;
  on_behalf_of: boolean;
  is_this_file: boolean;
  answers?: Record<string, any>;
}

const TABS_HELP = "tabs are computed per-role inside the component";

export default function LeadWorkspace({
  lead, claims, activity, stats, claimProperties, audit, notes, callLogs, staff = [], formsByType = {},
}: {
  lead: any;
  claims: Claim[];
  activity: any[];
  stats: { signed: number; tierA: number; weekPay: number; wip: number };
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
  staff?: { id: string; full_name: string }[];
  formsByType?: Record<string, any[]>;
}) {
  const [activeClaimId, setActiveClaimId] = useState(
    claims.find((c) => c.is_this_file)?.id ?? claims[0]?.id ?? null
  );
  const [tab, setTab] = useState("Overview");
  const [editMode, setEditMode] = useState(false);
  const activeClaim = claims.find((c) => c.id === activeClaimId);
  const [showAddClaim, setShowAddClaim] = useState(false);
  const canQa = ["owner", "admin", "qa"].includes(lead.current_user_role || "");
  // QA tab sits right after Case Details for the people who run QA.
  const TABS = canQa
    ? ["Overview", "Case Questions", "Contact Info", "Case Details", "QA", "Retainer", "Messages", "Calls", "Notes", "Timeline", "Activity Log"]
    : ["Overview", "Case Questions", "Contact Info", "Case Details", "Retainer", "Messages", "Calls", "Notes", "Timeline", "Activity Log"];
  const safe: string[] = Array.isArray(lead.comms_safe_channels) ? lead.comms_safe_channels : [];

  function claimClass(c: Claim) {
    if (c.status === "dq") return "claimchip dq";
    if (c.status === "signed") return "claimchip signed";
    if (c.id === activeClaimId) return "claimchip active";
    return "claimchip";
  }

  return (
    <div>
      {/* Command bar: queue + my-day stats */}
      <div className="cmdbar">
        <div className="queue">
          <span className="qhdr">Working</span>
          <span className="qtab active">{lead.claimant_name ?? lead.lead_no}</span>
          <a className="qtab" href="/leads" style={{ textDecoration: "none" }} title="Go back to your lead queue">← Queue</a>
        </div>
        <div className="myday">
          <div className="stat"><b>{stats.signed}</b><span>Signed today</span></div>
          <div className="stat"><b>{stats.wip}</b><span>WIP</span></div>
        </div>
      </div>

      {/* Lead header */}
      <div className="leadhead">
        <div className="row" style={{ justifyContent: "space-between", width: "100%", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{lead.claimant_name ?? "Unnamed claimant"}</h2>
            <div className="leadhead-sub">
              <span className="leadhead-file">{lead.lead_no}</span>
              <span className="leadhead-dot">·</span>
              <span className="muted">{activeClaim?.claim_type || lead.case_type || "case"}</span>
              <span className="leadhead-dot">·</span>
              <span className="muted">Created {new Date(lead.created_at).toLocaleDateString()}</span>
            </div>

            {/* Claims selector — quiet, only when more than one claim exists */}
            {claims.length > 1 && (
              <div className="claimsrow" style={{ marginTop: 10 }}>
                {claims.map((c) => (
                  <button key={c.id} className={`claimtab ${activeClaimId === c.id ? "on" : ""}`} onClick={() => setActiveClaimId(c.id)}>
                    {(c.campaign || c.claim_type)}
                  </button>
                ))}
                <CreateClaim leadId={lead.id} firmId={lead.firm_id} />
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div className="status-field">
              <span className="status-field-label">Status</span>
              <FileStatusControl leadId={lead.id} current={activeClaim?.status ?? lead.status ?? "new"} role={lead.current_user_role} />
            </div>
            <LockFileButton lead={lead} />
          </div>
        </div>
        {claims.length <= 1 && (
          <button className="addclaim-quiet" onClick={() => setShowAddClaim(true)}>+ Add another claim</button>
        )}
        {showAddClaim && claims.length <= 1 && <CreateClaim leadId={lead.id} firmId={lead.firm_id} />}
      </div>

      {/* PNC banner — interactive injured-party state */}
      <PncBanner lead={lead} />

      {/* Pipeline strip: shows where this file sits from intake through firm handoff. */}
      <PipelineStrip status={activeClaim?.status ?? lead.status ?? "new"} />

      {/* WIP fix banner: QA sent this back. Resubmit returns it to the QA queue. */}
      {lead.wip_pending && <WipBanner lead={lead} signed={/^signed_/.test(activeClaim?.status || "")} />}

      {/* Main grid */}
      <div className="lead-grid solo">
        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); setEditMode(false); }}>{t}</button>
            ))}
            {(tab === "Contact Info" || tab === "Case Details") && (
              <button className={`edit-toggle ${editMode ? "on" : ""}`} onClick={() => setEditMode((v) => !v)} title={editMode ? "Done editing" : "Edit"} style={{ alignSelf: "center", marginRight: 8, marginLeft: "auto" }}>
                {editMode ? "✓ Done" : "✎ Edit"}
              </button>
            )}
          </div>
          <div className="formbody">
            {tab === "Overview" && (
              <CaseOverview lead={lead} activeClaim={activeClaim} notes={notes} callLogs={callLogs} onGo={(t) => { setTab(t); setEditMode(false); }} />
            )}
            {tab === "Case Questions" && activeClaim && (
              <div>
                <div className="gate" style={{ marginBottom: 16 }}>
                  <span className="tag">Compliance notice</span>
                  Leading statements of any kind result in forfeiture of file credit and disciplinary
                  action. Ask every question in order and verbatim.
                </div>
                <ClaimIntake
                  claimId={activeClaim.id}
                  firmId={lead.firm_id}
                  initialAnswers={activeClaim.answers ?? {}}
                  initialProperties={claimProperties[activeClaim.id] ?? []}
                  claimantName={lead.claimant_name ?? undefined}
                  claimantEmail={lead.email ?? undefined}
                  claimType={activeClaim.claim_type}
                  leadId={lead.id}
                  customFields={formsByType?.[activeClaim.claim_type]}
                />
              </div>
            )}
            {tab === "Contact Info" && <ContactInfo lead={lead} claimType={activeClaim?.claim_type} editMode={editMode} onRequestEdit={() => setEditMode(true)} />}
            {tab === "Case Details" && <CaseDetails lead={lead} staff={staff} editMode={editMode} onRequestEdit={() => setEditMode(true)} />}
            {tab === "QA" && canQa && <QaPanel leadId={lead.id} claimId={activeClaim?.id} />}
            {tab === "Retainer" && <RetainerTab leadId={lead.id} role={lead.current_user_role} />}
            {tab === "Messages" && <CommsTimeline leadId={lead.id} phone={lead.phone} channel="sms" />}
            {tab === "Calls" && <CommsTimeline leadId={lead.id} phone={lead.phone} channel="call" />}
            {tab === "Notes" && <NotesTab leadId={lead.id} claimId={activeClaim?.id} initial={notes} />}
            {tab === "Timeline" && <CaseTimeline entries={audit} />}
            {tab === "Activity Log" && <ActivityLog entries={audit} />}
          </div>
        </div>

        {/* Floating Tools dock (hammer pill) — Crissi, Vitals, Agent assist, Integrity, Maverick, Grievous */}
        <FloatingDock lead={lead} claimId={activeClaim?.id} claimType={activeClaim?.claim_type ?? "motel_trafficking"} />
      </div>
    </div>
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

function PncBanner({ lead }: { lead: any }) {
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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {STATES.map((s) => (
          <button key={s.id} className={`chip ${state === s.id ? "active" : ""}`}
            disabled={saving} onClick={() => pick(s.id)}>{s.label}</button>
        ))}
      </div>
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

  async function create(type: string, campaign?: string) {
    setBusy(true);
    const r = await fetch("/api/claims", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", lead_id: leadId, firm_id: firmId, claim_type: type, campaign: campaign || null }),
    });
    if (r.ok) { location.reload(); return; }
    const d = await r.json().catch(() => ({}));
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
  return <button className={`btn ${locked ? "" : "ghost"}`} onClick={toggle} disabled={busy} title={locked ? "File is locked, click to unlock" : "Lock this file read-only"}>{locked ? "🔓 Unlock file" : "🔒 Lock file"}</button>;
}
