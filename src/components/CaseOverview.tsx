"use client";
import { fileMayEditLead, type FileFence } from "@/lib/file-fence";
import { LOR_STATUSES } from "@/lib/m6";
import { stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";
import { isSignedKey, resolveStatus, resolveFileStatus } from "@/lib/statuses";

// The front door. When anyone opens a file, they land here: who this is,
// what kind of case, where it stands, last contact, recent notes, then clear
// "where do you want to go" actions. Works even when the file is empty.
export default function CaseOverview({ lead, activeClaim, notes = [], callLogs = [], onGo, fence, identified = [], lor = null, lastComm = null, points = [], intakeAnswered, signatureConfirmed = false }: {
  lead: any; activeClaim: any; notes?: any[]; callLogs?: any[];
  intakeAnswered?: number;
  signatureConfirmed?: boolean;
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
    if (status === "signed_dropped") return { label: resolveStatus(status).label, cls: "bad" };
    if (status === "sent") return { label: "Sent to firm", cls: "info" };
    if (status === "delivered") return { label: resolveFileStatus(activeClaim, undefined, signatureConfirmed).label, cls: "ok" };
    if (isSignedKey(status)) return { label: activeClaim?.claim_type === "mva" && /^signed_/.test(status) ? "Signed · agent review" : resolveStatus(status).label, cls: "ok" };
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
  const intakeProgress = intakeAnswered ?? (activeClaim?.answers ? Object.keys(activeClaim.answers).filter((k) => !["__meta", "mva_call"].includes(k) && activeClaim.answers[k] !== "" && activeClaim.answers[k] != null).length : 0);

  const addr = [lead.mail_addr1, [lead.mail_city, lead.mail_state].filter(Boolean).join(", "), lead.mail_zip].filter(Boolean).join(" · ");
  const stamped = [lead.property_name, lead.property_street, [lead.property_city, lead.property_state].filter(Boolean).join(", "), lead.property_zip].filter(Boolean).join(" · ");
  const lorLabel = LOR_STATUSES.find((s) => s.value === lor?.status)?.label || (lor?.status ? String(lor.status) : "");

  // Only the facts that exist make a row. Empty state is one quiet line, not
  // four boxes of "No X yet" (Brett: the clutter goes).
  const facts: { k: string; v: string; sub?: string }[] = [];
  if (lead.phone) facts.push({ k: "Phone", v: lead.phone });
  if (lead.email) facts.push({ k: "Email", v: lead.email });
  if (addr) facts.push({ k: "Address", v: addr });
  if (diagnosis) facts.push({ k: "Diagnosis", v: String(diagnosis) });
  if (lastCall) facts.push({ k: "Last touch", v: `${lastCallLabel}${lastComm?.occurred_at && lastCallWhen ? ` · ${lastCallWhen}` : ""}`, sub: lastComm?.outcome || (lastCall.jc_summary ? String(lastCall.jc_summary).slice(0, 90) : undefined) });
  if (livePoints.length > 0) facts.push({ k: "Contact points", v: `${livePoints.length} live` });
  if (intakeProgress > 0) facts.push({ k: "Intake", v: `${intakeProgress} answers captured` });
  if (activeClaim?.grievous_approved) facts.push({ k: "Grievous", v: "Approved" });

  return (
    <div className="ov">
      {/* status banner */}
      <div className={`ov-status ${stateChip.cls}`}>
        <span className="ov-status-dot" />
        <strong>{stateChip.label}</strong>
        <span className="ov-status-sub">{caseType}{activeClaim?.on_behalf_of ? " · on behalf of" : ""}</span>
      </div>

      {/* the glance rows: only what the file actually has */}
      {facts.length === 0 ? (
        <div className="ov2-quiet">Nothing on this file yet. Start the intake below.</div>
      ) : (
        <div className="ov2-facts">
          {facts.map((f) => (
            <div key={f.k} className="ov2-fact">
              <span className="ov2-k">{f.k}</span>
              <span className="ov2-v">{f.v}{f.sub ? <em>{f.sub}</em> : null}</span>
            </div>
          ))}
        </div>
      )}

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

      {/* recent notes, only when there are any */}
      {recentNotes.length > 0 && (<>
        <div className="ov-section-label">Recent notes</div>
        <div className="ov-notes">
          {recentNotes.map((n: any) => (
            <div key={n.id} className="ov-note">
              <span className="ov-note-meta">{n.author_name || "Staff"} · {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}</span>
              <span>{n.body}</span>
            </div>
          ))}
        </div>
      </>)}

      {/* the actions: a clean list, the intake first */}
      <div className="ov2-acts">
        <ActionRow
          icon="pencil"
          title={fileMayEditLead(fence) ? (intakeProgress > 0 ? "Continue intake" : "Start intake") : "Review intake"}
          sub={fileMayEditLead(fence) ? "Work the questionnaire" : "The questions that were asked"}
          onClick={() => onGo("Case Questions")}
          primary
        />
        <ActionRow icon="user" title="Contact info" sub="Names, address, emergency contact" onClick={() => onGo("Contact Info")} />
        <ActionRow icon="folder" title="File details" sub="Routing, dates, case manager" onClick={() => onGo("Case Details")} />
        <ActionRow
          icon="sign"
          title="Retainer"
          sub={fileMayEditLead(fence) ? "Generate, send for signature" : "Status and signed copies"}
          onClick={() => onGo("Retainer")}
        />
        <ActionRow icon="phone" title="Calls" sub={lastCall ? "Review the call timeline" : "Nothing logged yet"} onClick={() => onGo("Calls")} />
        <ActionRow icon="note" title={fileMayEditLead(fence) ? "Add a note" : "Notes"} sub="Log something on the file" onClick={() => onGo("Notes")} />
      </div>
    </div>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  sign: <><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />,
  note: <><path d="M14 3v6h6" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /></>,
};

function ActionRow({ icon, title, sub, onClick, primary }: { icon: string; title: string; sub: string; onClick: () => void; primary?: boolean }) {
  return (
    <button className={`ov2-act ${primary ? "ov2-primary" : ""}`} onClick={onClick}>
      <span className="ov2-ico" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
      </span>
      <span className="ov2-act-t">
        <span className="ov2-act-title">{title}</span>
        <span className="ov2-act-sub">{sub}</span>
      </span>
      <svg className="ov2-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  );
}
