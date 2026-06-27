"use client";
import { useState, useEffect } from "react";

// Case-management layer: routing/people, content, dates, tags, events. Separate
// from the intake questionnaire. Saves to the leads row + case_events.
export default function CaseDetails({ lead, staff = [] }: { lead: any; staff?: { id: string; full_name: string }[] }) {
  const [f, setF] = useState<any>({
    marketing_source: lead.marketing_source ?? "",
    referring_attorney: lead.referring_attorney ?? "",
    handling_attorney: lead.handling_attorney ?? "",
    intake_agent_id: lead.intake_agent_id ?? "",
    qa_agent_id: lead.qa_agent_id ?? "",
    case_manager_id: lead.case_manager_id ?? "",
    office_location: lead.office_location ?? "",
    case_rating: lead.case_rating ?? "",
    call_outcome: lead.call_outcome ?? "",
    esign_date: lead.esign_date ?? "",
    case_summary: lead.case_summary ?? "",
    case_description: lead.case_description ?? "",
    case_tags: (lead.case_tags ?? []).join(", "),
  });
  const [opts, setOpts] = useState<Record<string, string[]>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({ title: "", event_at: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/case/options"); const d = await r.json(); setOpts(d.options ?? {}); } catch {}
    try { const r = await fetch(`/api/case/events?lead_id=${lead.id}`); const d = await r.json(); setEvents(d.events ?? []); } catch {}
  })(); }, [lead.id]);

  function set(k: string, v: any) { setF((s: any) => ({ ...s, [k]: v })); }

  async function save() {
    setSaving(true); setMsg("");
    const payload = { ...f, case_tags: f.case_tags.split(",").map((t: string) => t.trim()).filter(Boolean),
      intake_agent_id: f.intake_agent_id || null, qa_agent_id: f.qa_agent_id || null, case_manager_id: f.case_manager_id || null,
      esign_date: f.esign_date || null };
    const r = await fetch("/api/case/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: lead.id, ...payload }) });
    setSaving(false);
    setMsg(r.ok ? "Saved." : "Save failed.");
  }

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
          <L label="Case tier / rating"><Sel value={f.case_rating} onChange={(v) => set("case_rating", v)} options={dd("tier")} allowFree /></L>
          <L label="Call outcome"><input value={f.call_outcome} onChange={(e) => set("call_outcome", e.target.value)} /></L>
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
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save case details"}</button>
        {msg && <span className="muted" style={{ alignSelf: "center" }}>{msg}</span>}
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
