"use client";
import { useState } from "react";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { LX } from "@/lib/lexicon";
import { VitalsCard, GrievousPanel, ConversationPanel } from "./LeadSidebar";
import ClaimIntake from "./ClaimIntake";
import ActivityLog from "./ActivityLog";
import KnowledgePanel from "./KnowledgePanel";
import ContactInfo from "./ContactInfo";
import NotesTab from "./NotesTab";
import CallLog from "./CallLog";
import CrisisBot from "./CrisisBot";
import CaseMessages from "./CaseMessages";

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

const TABS = ["Case Questions", "Contact Info", "Messages", "Calls", "Criteria", "Notes", "Activity Log"];

export default function LeadWorkspace({
  lead, claims, activity, stats, claimProperties, audit, notes, callLogs,
}: {
  lead: any;
  claims: Claim[];
  activity: any[];
  stats: { signed: number; tierA: number; weekPay: number; wip: number };
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
}) {
  const [activeClaimId, setActiveClaimId] = useState(
    claims.find((c) => c.is_this_file)?.id ?? claims[0]?.id ?? null
  );
  const [tab, setTab] = useState("Case Questions");
  const activeClaim = claims.find((c) => c.id === activeClaimId);
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
          <a className="qtab" href="/leads" style={{ textDecoration: "none" }}>+ Next</a>
        </div>
        <div className="myday">
          <div className="stat"><b>{stats.signed}</b><span>Signed today</span></div>
          <div className="stat"><b>{stats.wip}</b><span>WIP</span></div>
        </div>
      </div>

      {/* Lead header */}
      <div className="leadhead">
        <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
          <div>
            <h2>{lead.claimant_name ?? "Unnamed claimant"}</h2>
            <div className="claimsrow">
              {activeClaim?.campaign && <span className="ftag gold">{activeClaim.campaign}</span>}
              <span style={{ fontWeight: 600 }}>File {lead.lead_no}</span>
            </div>

            {/* Claims row — multiple claims per person */}
            <div className="claimsrow">
              {claims.map((c) => (
                <button key={c.id} className={claimClass(c)} onClick={() => setActiveClaimId(c.id)}>
                  {(c.campaign || c.claim_type)} · {c.on_behalf_of ? "OBO" : "self"} · {c.status}
                </button>
              ))}
              <CreateClaim leadId={lead.id} firmId={lead.firm_id} />
            </div>

            <div className="meta">
              <span className="ftag">Created {new Date(lead.created_at).toLocaleDateString()}</span>
              <span className="ftag">{STAGE_LABELS[activeClaim?.status === "signed" ? "signed_retained" : "referral_received"] ?? activeClaim?.status}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <span className="timer">● Live call 00:00</span>
            <button className="btn ghost">🔒 Lock file</button>
          </div>
        </div>
      </div>

      {/* PNC banner — interactive injured-party state */}
      <PncBanner lead={lead} />

      {/* Main grid */}
      <div className="lead-grid">
        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
            ))}
            <span className="badge stage" style={{ marginLeft: "auto", alignSelf: "center", marginRight: 8 }}>
              {activeClaim?.qualification ?? "pending"}
            </span>
          </div>
          <div className="formbody">
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
                />
              </div>
            )}
            {tab === "Contact Info" && <ContactInfo lead={lead} claimType={activeClaim?.claim_type} />}
            {tab === "Criteria" && <p className="muted">Campaign criteria checklist coming.</p>}
            {tab === "Messages" && <CaseMessages leadId={lead.id} claimId={activeClaim?.id} me={lead.current_user_name ?? "Staff"} />}
            {tab === "Calls" && <CallLog leadId={lead.id} claimId={activeClaim?.id} initial={callLogs} />}
            {tab === "Notes" && <NotesTab leadId={lead.id} claimId={activeClaim?.id} initial={notes} />}
            {tab === "Activity Log" && <ActivityLog entries={audit} />}
          </div>
        </div>

        {/* Right sidebar */}
        <div>
          <VitalsCard lead={lead} />
          <KnowledgePanel claimType={activeClaim?.claim_type ?? "motel_trafficking"} />
          <CrisisBot trigger="inline" />
          <GrievousPanel />
          <ConversationPanel
            leadId={lead.id}
            phone={lead.phone}
            monitored={!!lead.comms_monitored}
            safeChannels={safe}
            activity={activity}
          />
        </div>
      </div>
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

  const TYPES = [
    { type: "motel_trafficking", label: "Hospitality Trafficking", campaign: "" },
    { type: "pfas", label: "PFAS", campaign: "NGUYEN PFAS INNO" },
    { type: "bard_powerport", label: "Bard PowerPort", campaign: "TMP BARD PP" },
    { type: "medmal", label: "Medical Malpractice", campaign: "TMP MED MAL" },
  ];

  async function create(type: string, campaign: string) {
    setBusy(true);
    const r = await fetch("/api/claims", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", lead_id: leadId, firm_id: firmId, claim_type: type, campaign: campaign || null }),
    });
    setBusy(false);
    if (r.ok) location.reload();
  }

  if (!open) {
    return <button className="claimchip" onClick={() => setOpen(true)}>+ Create another claim</button>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {TYPES.map((t) => (
        <button key={t.type} className="chip" disabled={busy} onClick={() => create(t.type, t.campaign)}>{t.label}</button>
      ))}
      <button className="chip" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}
