"use client";
import { useState, useEffect, useRef } from "react";
import { fileMaySeeMoney, type FileFence } from "@/lib/file-fence";
import { useFieldAutosave } from "./useFieldAutosave";

const KEYS = ["marketing_source", "referring_attorney", "handling_attorney", "intake_agent_id",
  "qa_agent_id", "case_manager_id", "office_location", "case_rating", "call_outcome", "esign_date",
  "case_summary", "case_description", "case_tags"];

// The editable values from a lead record (tags as the comma list the box shows).
function fromLead(lead: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of KEYS) out[k] = k === "case_tags" ? (lead.case_tags ?? []).join(", ") : (lead[k] ?? "");
  return out;
}

// What the save route stores for these fields: tags as a list, and a blank
// person, date or uuid as NULL so the update is not rejected wholesale.
function toPayload(patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...patch };
  if ("case_tags" in out) out.case_tags = String(out.case_tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
  for (const k of ["intake_agent_id", "qa_agent_id", "case_manager_id", "esign_date"]) if (k in out) out[k] = out[k] || null;
  return out;
}

// Case-management layer: routing/people, content, dates, tags, events. Separate
// from the intake questionnaire. Saves to the leads row + case_events.
export default function CaseDetails({ lead, staff = [], editMode = true, onRequestEdit, fence, onSaved }: { lead: any; staff?: { id: string; full_name: string }[]; editMode?: boolean; onRequestEdit?: () => void; fence?: FileFence; onSaved?: (patch: Record<string, any>) => void }) {
  // The record's values as this tab last saw them in its props.
  const seen = useRef<Record<string, any> | null>(null);
  // Autosave a second after the last edit, no manual Save needed. Only the
  // fields a person changed are sent, with their values when the save goes
  // out, so a field this person did not touch (or cannot see, like the case
  // tier) is never written back from this tab's copy. A failed write keeps
  // them unsaved and says so.
  // Switching tabs sends what is pending (Astra audits, Sep 27, round 7b).
  const { values: f, status, error, edit, incoming } = useFieldAutosave<Record<string, any>>(() => fromLead(lead), {
    delay: 1000,
    send: async (patch) => {
      let r: Response;
      try {
        r = await fetch("/api/case/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: lead.id, ...toPayload(patch) }) });
      } catch {
        throw new Error("Could not reach the server. Nothing was saved.");
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || String(r.status));
    },
    onSaved: (patch) => {
      const saved = toPayload(patch);
      // This save coming back through the parent's copy is not a refresh, so
      // it never rewrites what is in the box (tags keep a trailing comma).
      const echo = fromLead(saved);
      if (seen.current) for (const k of Object.keys(saved)) seen.current[k] = echo[k];
      onSaved?.(saved);
    },
  });
  // A refreshed server record fills every CLEAN field whose value on the
  // record changed, while this tab is mounted (Astra round 5: a read-only tab
  // kept old outcome/date after refreshed props). Unsaved typing stays and its
  // pending save still goes out (Astra round 7b: a refresh used to cancel it).
  useEffect(() => {
    const now = fromLead(lead);
    const before = seen.current;
    seen.current = now;
    if (!before) return; // the first render started from these same values
    const changed: Record<string, any> = {};
    for (const k of KEYS) if (now[k] !== before[k]) changed[k] = now[k];
    if (Object.keys(changed).length) incoming(changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);
  const [opts, setOpts] = useState<Record<string, string[]>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({ title: "", event_at: "", notes: "" });
  const saving = status === "saving";
  const msg = error ? `Save failed: ${error}` : status === "saved" ? "Saved." : "";

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/case/options"); const d = await r.json(); setOpts(d.options ?? {}); } catch {}
    try { const r = await fetch(`/api/case/events?lead_id=${lead.id}`); const d = await r.json(); setEvents(d.events ?? []); } catch {}
  })(); }, [lead.id]);

  function set(k: string, v: any) { edit({ [k]: v }); }

  async function addEvent() {
    if (!newEvent.title || !newEvent.event_at) return;
    const r = await fetch("/api/case/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: lead.id, ...newEvent }) });
    if (r.ok) { const d = await r.json(); setEvents((e) => [...e, d.event].sort((a, b) => a.event_at.localeCompare(b.event_at))); setNewEvent({ title: "", event_at: "", notes: "" }); }
  }
  async function delEvent(id: string) {
    await fetch("/api/case/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete", id }) });
    setEvents((e) => e.filter((x) => x.id !== id));
  }

  const dd = (key: string) => opts[key] ?? [];

  // ---- READ-ONLY VIEW MODE (default) ----
  if (!editMode) {
    const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name || "";
    const tags = (lead.case_tags ?? []) as string[];
    const V = ({ label, value }: { label: string; value: any }) => (
      <div className="ro-field">
        <span className="ro-label">{label}</span>
        <span className={`ro-value ${!value ? "empty" : ""}`}>{value || "Not collected"}</span>
      </div>
    );
    return (
      <div className="ro-wrap case-details">
        <div className="ro-section">Routing & People</div>
        <div className="ro-grid">
          <V label="Marketing source" value={f.marketing_source} />
          <V label="Referring attorney" value={f.referring_attorney} />
          <V label="Handling attorney" value={f.handling_attorney} />
          <V label="Office location" value={f.office_location} />
          <V label="Intake agent" value={staffName(f.intake_agent_id)} />
          <V label="QA agent" value={staffName(f.qa_agent_id)} />
          <V label="Case manager" value={staffName(f.case_manager_id)} />
        </div>

        <div className="ro-section">Status & Dates</div>
        <div className="ro-grid">
          {fileMaySeeMoney(fence) && <V label="Case tier" value={f.case_rating} />}
          <V label="Call outcome" value={f.call_outcome} />
          <V label="eSign date" value={f.esign_date} />
          <V label="Last called" value={lead.last_called_at ? new Date(lead.last_called_at).toLocaleString() : ""} />
        </div>
        {tags.length > 0 && (
          <div className="ro-tags">{tags.map((t) => <span key={t} className="ro-tag">{t}</span>)}</div>
        )}

        {(f.case_summary || f.case_description) && <>
          <div className="ro-section">Case Summary</div>
          <div className="ro-narrative">{f.case_summary || "Not collected"}</div>
          {f.case_description && <div className="ro-narrative muted-narrative">{f.case_description}</div>}
        </>}

        {events.length > 0 && <>
          <div className="ro-section">Upcoming Events</div>
          {events.map((ev) => (
            <div key={ev.id} className="cd-event">
              <div><strong>{ev.title}</strong> <span className="muted">· {new Date(ev.event_at).toLocaleString()}</span>{ev.notes && <div className="muted" style={{ fontSize: 12 }}>{ev.notes}</div>}</div>
            </div>
          ))}
        </>}

        {onRequestEdit && <button className="edit-cta" onClick={onRequestEdit}>✎ Edit case details</button>}
      </div>
    );
  }

  return (
    <div className="case-details">
      <div className="cd-grid">
        <div className="cd-block">
          <div className="section-title">Routing & People</div>
          <L label="Marketing source"><Sel value={f.marketing_source} onChange={(v) => set("marketing_source", v)} options={dd("marketing_source")} /></L>
          <L label="Referring attorney"><input value={f.referring_attorney} onChange={(e) => set("referring_attorney", e.target.value)} /></L>
          <L label="Handling attorney"><input value={f.handling_attorney} onChange={(e) => set("handling_attorney", e.target.value)} /></L>
          <L label="Intake agent"><StaffSel value={f.intake_agent_id} onChange={(v) => set("intake_agent_id", v)} staff={staff} /></L>
          <L label="QA agent"><StaffSel value={f.qa_agent_id} onChange={(v) => set("qa_agent_id", v)} staff={staff} /></L>
          <L label="Case manager"><StaffSel value={f.case_manager_id} onChange={(v) => set("case_manager_id", v)} staff={staff} /></L>
          <L label="Office location"><Sel value={f.office_location} onChange={(v) => set("office_location", v)} options={dd("office")} allowFree /></L>
        </div>

        <div className="cd-block">
          <div className="section-title">Status & Dates</div>
          {fileMaySeeMoney(fence) && <L label="Case tier / rating"><Sel value={f.case_rating} onChange={(v) => set("case_rating", v)} options={dd("tier")} allowFree /></L>}
          <L label="Call outcome"><Sel value={f.call_outcome} onChange={(v) => set("call_outcome", v)} options={dd("call_outcome")} allowFree /></L>
          <L label="eSign date"><input type="date" value={f.esign_date ?? ""} onChange={(e) => set("esign_date", e.target.value)} /></L>
          <L label="Last called"><span className="muted">{lead.last_called_at ? new Date(lead.last_called_at).toLocaleString() : "—"}</span></L>
          <L label="Case tags (comma-separated, searchable)"><input value={f.case_tags} onChange={(e) => set("case_tags", e.target.value)} placeholder="urgent, spanish, callback" /></L>
        </div>
      </div>

      <div className="cd-block" style={{ marginTop: 14 }}>
        <div className="section-title">Case Summary</div>
        <textarea rows={2} value={f.case_summary} onChange={(e) => set("case_summary", e.target.value)} placeholder="One-line summary for the firm." />
        <div className="section-title" style={{ marginTop: 10 }}>Case Description</div>
        <textarea rows={4} value={f.case_description} onChange={(e) => set("case_description", e.target.value)} placeholder="Full narrative." />
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>{saving ? "Saving…" : msg || "Changes save automatically."}</span>
      </div>

      <div className="cd-block" style={{ marginTop: 18 }}>
        <div className="section-title">Upcoming Events</div>
        {events.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No events yet.</p>}
        {events.map((ev) => (
          <div key={ev.id} className="cd-event">
            <div><strong>{ev.title}</strong> <span className="muted">· {new Date(ev.event_at).toLocaleString()}</span>{ev.notes && <div className="muted" style={{ fontSize: 12 }}>{ev.notes}</div>}</div>
            <button className="btn ghost sm" onClick={() => delEvent(ev.id)}>✕</button>
          </div>
        ))}
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <input placeholder="Event title" value={newEvent.title} onChange={(e) => setNewEvent((s) => ({ ...s, title: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
          <input type="datetime-local" value={newEvent.event_at} onChange={(e) => setNewEvent((s) => ({ ...s, event_at: e.target.value }))} />
          <input placeholder="Notes (optional)" value={newEvent.notes} onChange={(e) => setNewEvent((s) => ({ ...s, notes: e.target.value }))} style={{ flex: 1, minWidth: 120 }} />
          <button className="btn ghost" onClick={addEvent}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="cd-field"><label className="fld-label">{label}</label>{children}</div>;
}
function Sel({ value, onChange, options, allowFree }: { value: string; onChange: (v: string) => void; options: string[]; allowFree?: boolean }) {
  if (allowFree && options.length === 0) return <input value={value} onChange={(e) => onChange(e.target.value)} />;
  return <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}{allowFree && value && !options.includes(value) && <option value={value}>{value}</option>}</select>;
}
function StaffSel({ value, onChange, staff }: { value: string; onChange: (v: string) => void; staff: { id: string; full_name: string }[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>;
}
