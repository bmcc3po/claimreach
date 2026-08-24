"use client";
import { fileMayEditLead, type FileFence } from "@/lib/file-fence";
import { LOR_STATUSES } from "@/lib/m6";
import { stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";

// The front door. When anyone opens a file, they land here: who this is,
// what kind of case, where it stands, last contact, recent notes, then clear
// "where do you want to go" actions. Works even when the file is empty.
export default function CaseOverview({ lead, activeClaim, notes = [], callLogs = [], onGo, fence, identified = [], lor = null, lastComm = null, points = [] }: {
  lead: any; activeClaim: any; notes?: any[]; callLogs?: any[];
  onGo: (tab: string) => void;
  fence?: FileFence;
  identified?: IdentifiedProperty[];
  lor?: { status?: string | null; sent_on?: string | null; sent_to?: string | null } | null;
  lastComm?: { channel?: string; direction?: string; occurred_at?: string; outcome?: string; body?: string; agent_name?: string } | null;
  points?: { id: string; kind: string; value: string; label?: string | null; status: string }[];
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

  const lastCall = lastComm?.occurred_at ? lastComm : callLogs[0];
  const lastCallWhen = lastCall?.occurred_at ? new Date(lastCall.occurred_at).toLocaleString() : "";
  const lastCallLabel = lastComm?.occurred_at
    ? `${lastComm.direction === "inbound" ? "Inbound" : "Outbound"} ${lastComm.channel === "sms" ? "text" : lastComm.channel === "email" ? "email" : "call"}`
    : lastCall ? `${lastCall.direction === "inbound" ? "Inbound" : "Outbound"} · ${lastCallWhen}` : "";
  const livePoints = points.filter((p) => p.status !== "dead" && p.status !== "opted_out");
  const recentNotes = (notes || []).slice(0, 3);
  const diagnosis = activeClaim?.answers?.qualified_injury || activeClaim?.answers?.date_of_diagnosis || lead.diagnosis;
  const intakeProgress = activeClaim?.answers ? Object.keys(activeClaim.answers).filter((k) => activeClaim.answers[k] !== "" && activeClaim.answers[k] != null).length : 0;

  const addr = [lead.mail_addr1, [lead.mail_city, lead.mail_state].filter(Boolean).join(", "), lead.mail_zip].filter(Boolean).join(" · ");
  const stamped = [lead.property_name, lead.property_street, [lead.property_city, lead.property_state].filter(Boolean).join(", "), lead.property_zip].filter(Boolean).join(" · ");
  const lorLabel = LOR_STATUSES.find((s) => s.value === lor?.status)?.label || (lor?.status ? String(lor.status) : "");

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

        <Glance label="Last touch">
          {lastCall ? <>
            <div className="ov-val-strong">{lastCallLabel}{lastComm?.occurred_at && lastCallWhen ? ` · ${lastCallWhen}` : ""}</div>
            {(lastComm?.outcome || lastCall.jc_summary) && (
              <div className="ov-val-sub">{lastComm?.outcome || String(lastCall.jc_summary).slice(0, 90)}</div>
            )}
          </> : <div className="ov-empty">No calls yet</div>}
          {livePoints.length > 0 && (
            <div className="ov-val-sub">{livePoints.length} live contact {livePoints.length === 1 ? "point" : "points"}</div>
          )}
        </Glance>

        <Glance label="Intake">
          {intakeProgress > 0 ? <div className="ov-val-strong">{intakeProgress} answers captured</div> : <div className="ov-empty">Not started</div>}
          {activeClaim?.grievous_approved && <div className="ov-val-sub" style={{ color: "var(--ok)" }}>✓ Grievous approved</div>}
        </Glance>
      </div>

      {(identified.length > 0 || stamped || lorLabel) && (
        <>
          <div className="ov-section-label">Property and LOR</div>
          {identified.length > 0 ? (
            <div className="ov-notes">
              {identified.map((p) => {
                const where = [p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
                const when = stayRangeLabel(p.stay_from, p.stay_to);
                return (
                  <div key={p.id} className="ov-note">
                    <span className="ov-note-meta">
                      {p.remembered_brand || "brand not noted"}
                      {p.current_brand ? ` · current ${p.current_brand}` : ""}
                      {when ? ` · ${when}` : ""}
                    </span>
                    <span>{p.name || "Property"}{where ? ` · ${where}` : ""}</span>
                    {p.history?.map((h, i) => (
                      <span key={`${p.id}-h-${i}`} className="ov-note-meta">
                        Recorded {h.from ?? "?"}{h.to && h.to !== h.from ? `–${h.to}` : ""}: {h.brand || "brand not noted"}
                        {h.llc ? ` · ${h.llc}` : ""}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : stamped ? (
            <div className="ov-notes">
              <div className="ov-note">
                <span className="ov-note-meta">Address on the file</span>
                <span>{stamped}</span>
              </div>
            </div>
          ) : null}
          {lorLabel && (
            <div className="ov-val-sub" style={{ marginTop: 8 }}>
              LOR: {lorLabel}
              {lor?.sent_on ? ` · ${new Date(lor.sent_on).toLocaleDateString()}` : ""}
              {lor?.sent_to ? ` · ${lor.sent_to}` : ""}
            </div>
          )}
        </>
      )}

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
        <ActionCard
          icon="📝"
          title={fileMayEditLead(fence) ? (intakeProgress > 0 ? "Continue intake" : "Start intake") : "Review intake"}
          sub={fileMayEditLead(fence) ? "Work the questionnaire" : "The questions that were asked"}
          onClick={() => onGo("Case Questions")}
          primary
        />
        <ActionCard icon="👤" title="Contact info" sub="Names, address, emergency contact" onClick={() => onGo("Contact Info")} />
        <ActionCard icon="📂" title="File details" sub="Routing, dates, case manager" onClick={() => onGo("Case Details")} />
        <ActionCard
          icon="✍️"
          title="Retainer"
          sub={fileMayEditLead(fence) ? "Generate, send for signature" : "Status and signed copies"}
          onClick={() => onGo("Retainer")}
        />
        <ActionCard icon="📞" title="Calls" sub={lastCall ? "Review the call timeline" : "No calls yet"} onClick={() => onGo("Calls")} />
        <ActionCard icon="🗒️" title={fileMayEditLead(fence) ? "Add a note" : "Notes"} sub="Log something on the file" onClick={() => onGo("Notes")} />
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
