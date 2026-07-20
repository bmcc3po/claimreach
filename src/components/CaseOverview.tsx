"use client";
import { useState } from "react";

// The front door. When anyone opens a file, they land here: who this is,
// what kind of case, where it stands, last contact, recent notes, then clear
// "where do you want to go" actions. Works even when the file is empty.
export default function CaseOverview({ lead, activeClaim, notes = [], callLogs = [], onGo }: {
  lead: any; activeClaim: any; notes?: any[]; callLogs?: any[];
  onGo: (tab: string) => void;
}) {
  const fullName = lead.claimant_name || `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || "Unnamed claimant";
  const caseType = activeClaim?.campaign || activeClaim?.claim_type || "No claim yet";
  const qual = (activeClaim?.qualification || "pending").toLowerCase();
  const status = (activeClaim?.status || lead.status || "new").toLowerCase();

  // qualification state -> single clear status chip
  const stateChip = (() => {
    if (status === "signed") return { label: "Signed & retained", cls: "ok" };
    if (status === "sent" || status === "delivered") return { label: "Sent to firm", cls: "info" };
    if (qual === "dq" || status === "dq") return { label: "Disqualified", cls: "bad" };
    if (lead.currently_represented) return { label: "Already represented", cls: "warn" };
    if (qual === "qualified") return { label: "Qualified", cls: "ok" };
    return { label: "In progress", cls: "neutral" };
  })();

  const lastCall = callLogs[0];
  const recentNotes = (notes || []).slice(0, 3);
  const diagnosis = activeClaim?.answers?.qualified_injury || activeClaim?.answers?.date_of_diagnosis || lead.diagnosis;
  const intakeProgress = activeClaim?.answers ? Object.keys(activeClaim.answers).filter((k) => activeClaim.answers[k] !== "" && activeClaim.answers[k] != null).length : 0;

  const addr = [lead.mail_addr1, [lead.mail_city, lead.mail_state].filter(Boolean).join(", "), lead.mail_zip].filter(Boolean).join(" · ");

  return (
    <div className="ov">
      {/* status banner */}
      <div className={`ov-status ${stateChip.cls}`}>
        <span className="ov-status-dot" />
        <strong>{stateChip.label}</strong>
        <span className="ov-status-sub">{caseType}{activeClaim?.on_behalf_of ? " · on behalf of" : ""}</span>
      </div>

      {/* the glance grid */}
      <div className="ov-grid">
        <Glance label="Contact">
          <div className="ov-val-strong">{lead.phone || "No phone"}</div>
          {lead.email && <div className="ov-val-sub">{lead.email}</div>}
          {addr && <div className="ov-val-sub">{addr}</div>}
          {!lead.phone && !lead.email && <div className="ov-empty">No contact info yet</div>}
        </Glance>

        <Glance label="Case type">
          <div className="ov-val-strong">{caseType}</div>
          {diagnosis ? <div className="ov-val-sub">Dx: {String(diagnosis)}</div> : <div className="ov-empty">No diagnosis recorded</div>}
        </Glance>

        <Glance label="Last call">
          {lastCall ? <>
            <div className="ov-val-strong">{lastCall.direction === "inbound" ? "Inbound" : "Outbound"} · {lastCall.occurred_at ? new Date(lastCall.occurred_at).toLocaleString() : ""}</div>
            {lastCall.jc_summary && <div className="ov-val-sub">{lastCall.jc_summary.slice(0, 90)}</div>}
          </> : <div className="ov-empty">No calls yet</div>}
        </Glance>

        <Glance label="Intake">
          {intakeProgress > 0 ? <div className="ov-val-strong">{intakeProgress} answers captured</div> : <div className="ov-empty">Not started</div>}
          {activeClaim?.grievous_approved && <div className="ov-val-sub" style={{ color: "var(--ok)" }}>✓ Grievous approved</div>}
        </Glance>
      </div>

      {/* recent notes */}
      <div className="ov-section-label">Recent notes</div>
      {recentNotes.length === 0 ? <div className="ov-empty-block">No notes yet.</div> : (
        <div className="ov-notes">
          {recentNotes.map((n: any) => (
            <div key={n.id} className="ov-note">
              <span className="ov-note-meta">{n.author_name || "Staff"} · {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}</span>
              <span>{n.body}</span>
            </div>
          ))}
        </div>
      )}

      {/* the actions — where do you want to go */}
      <div className="ov-section-label">What do you want to do?</div>
      <div className="ov-actions">
        <ActionCard icon="📝" title={intakeProgress > 0 ? "Continue intake" : "Start intake"} sub="Work the questionnaire" onClick={() => onGo("Case Questions")} primary />
        <ActionCard icon="👤" title="Contact info" sub="Names, address, emergency contact" onClick={() => onGo("Contact Info")} />
        <ActionCard icon="📂" title="File details" sub="Routing, dates, case manager" onClick={() => onGo("Case Details")} />
        <ActionCard icon="✍️" title="Retainer" sub="Generate, send for signature" onClick={() => onGo("Retainer")} />
        <ActionCard icon="📞" title="Calls" sub={lastCall ? "Review the call timeline" : "No calls yet"} onClick={() => onGo("Calls")} />
        <ActionCard icon="🗒️" title="Add a note" sub="Log something on the file" onClick={() => onGo("Notes")} />
      </div>
    </div>
  );
}

function Glance({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ov-glance">
      <div className="ov-glance-label">{label}</div>
      {children}
    </div>
  );
}

function ActionCard({ icon, title, sub, onClick, primary }: { icon: string; title: string; sub: string; onClick: () => void; primary?: boolean }) {
  return (
    <button className={`ov-action ${primary ? "primary" : ""}`} onClick={onClick}>
      <span className="ov-action-icon">{icon}</span>
      <span className="ov-action-text">
        <span className="ov-action-title">{title}</span>
        <span className="ov-action-sub">{sub}</span>
      </span>
      <span className="ov-action-arrow">→</span>
    </button>
  );
}
