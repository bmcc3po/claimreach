"use client";
import { useState } from "react";
import { STAGE_LABELS } from "@/lib/questionnaire";
import { LX } from "@/lib/lexicon";
import { VitalsCard, GrievousPanel, ConversationPanel } from "./LeadSidebar";
import ClaimIntake from "./ClaimIntake";
import ActivityLog from "./ActivityLog";

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

const TABS = ["Case Questions", "Contact Info", "Criteria", "Notes", "Activity Log"];

export default function LeadWorkspace({
  lead, claims, activity, stats, claimProperties, audit,
}: {
  lead: any;
  claims: Claim[];
  activity: any[];
  stats: { signed: number; tierA: number; weekPay: number; wip: number };
  claimProperties: Record<string, any[]>;
  audit: any[];
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
          <div className="stat"><b>{stats.tierA}/15</b><span>Tier A</span></div>
          <div className="stat"><b>${stats.weekPay.toLocaleString()}</b><span>Week pay</span></div>
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
              <span className="claimchip" style={{ opacity: 0.7 }}>+ Create another claim</span>
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

      {/* PNC banner */}
      <div className="pnc">
        <div className="pncbadge">✓</div>
        <div style={{ flex: 1 }}>
          <strong>Injured Party: {lead.claimant_name ?? "—"}</strong>
          <div className="muted">{lead.pnc_relation ?? "Speaking with the injured party."}</div>
        </div>
      </div>

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
                />
              </div>
            )}
            {tab === "Contact Info" && (
              <div>
                <div className="field"><label>Name</label><div>{lead.claimant_name ?? "—"}</div></div>
                <div className="field"><label>Phone</label><div>{lead.phone ?? "—"}</div></div>
                <div className="field"><label>Email</label><div>{lead.email ?? "—"}</div></div>
                <div className="field"><label>Address</label><div>{lead.address ?? "—"}</div></div>
              </div>
            )}
            {tab === "Criteria" && <p className="muted">Campaign criteria checklist coming.</p>}
            {tab === "Notes" && <p className="muted">Notes thread coming.</p>}
            {tab === "Activity Log" && <ActivityLog entries={audit} />}
          </div>
        </div>

        {/* Right sidebar */}
        <div>
          <VitalsCard lead={lead} />
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
