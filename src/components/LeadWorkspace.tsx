"use client";
import { useState, useEffect } from "react";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { LX } from "@/lib/lexicon";
import FloatingDock from "./FloatingDock";
import CollapsiblePanel from "./CollapsiblePanel";
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
      {/* One dense header line: name, file, campaign, date, status, lock. */}
      <div className="leadhead-line">
        <a className="qtab-back" href="/leads" title="Back to your queue">←</a>
        <span className="lh-name">{lead.claimant_name ?? "Unnamed claimant"}</span>
        <span className="lh-file">{lead.lead_no}</span>
        <span className="leadhead-dot">·</span>
        <CampaignPicker leadId={lead.id} current={activeClaim?.campaign || lead.campaign} role={lead.current_user_role} />
        <span className="leadhead-dot">·</span>
        <span className="muted lh-date">{new Date(lead.created_at).toLocaleDateString()}</span>
        <span className="lh-spacer" />
        <span className="lh-stat"><b>{stats.signed}</b> signed</span>
        <span className="lh-stat"><b>{stats.wip}</b> WIP</span>
        <a className="btn ghost sm" href={`/api/export/intake-pdf?lead_id=${lead.id}`} target="_blank" rel="noopener noreferrer" title="Download this claimant's full intake as a PDF">Export PDF</a>
        {["owner", "admin", "qa"].includes(lead.current_user_role || "") && <SendToFirmButton leadId={lead.id} />}
        <FileStatusControl leadId={lead.id} current={activeClaim?.status ?? lead.status ?? "new"} role={lead.current_user_role} />
        <LockFileButton lead={lead} />
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

      {/* Everything else, injured-party + progress, folds into ONE panel that
          shows just the PNC name when collapsed. */}
      <CollapsiblePanel id="lead_detail" title="File detail" sub={`${lead.claimant_name ?? ""}${STAGE_LABELS?.[activeClaim?.status ?? lead.status ?? "new"] ? " · " + STAGE_LABELS[activeClaim?.status ?? lead.status ?? "new"] : ""}`} defaultOpen={false}>
        <PncBanner lead={lead} />
        <div style={{ marginTop: 12 }}><PipelineStrip status={activeClaim?.status ?? lead.status ?? "new"} /></div>
      </CollapsiblePanel>

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
            {tab === "QA" && canQa && <QaPanel leadId={lead.id} claimId={activeClaim?.id} role={lead.current_user_role} />}
            {tab === "Retainer" && <RetainerTab leadId={lead.id} claimId={activeClaimId} role={lead.current_user_role} />}
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
  return <button className={`btn ${locked ? "" : "ghost"}`} onClick={toggle} disabled={busy} title={locked ? "File is locked, click to unlock" : "Lock this file read-only"}>{locked ? "🔓 Unlock file" : "🔒 Lock file"}</button>;
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
      <button className="btn ghost sm" onClick={() => send(false)} disabled={busy}
        title={state.sentAt ? `Already sent ${new Date(state.sentAt).toLocaleString()}` : "Email the firm this file's documents"}>
        {label}
      </button>
      {msg && <span className="muted" style={{ fontSize: 11.5 }}>{msg}</span>}
    </span>
  );
}
