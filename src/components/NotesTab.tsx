"use client";
import { useState } from "react";

const SCOPES = [
  { id: "call", label: "Call note" },
  { id: "plaintiff", label: "About the plaintiff" },
  { id: "file", label: "About the file" },
  { id: "case", label: "About the case" },
  { id: "self", label: "My note (self)" },
];

export default function NotesTab({ leadId, claimId, initial }: { leadId: string; claimId?: string; initial: any[] }) {
  const [scope, setScope] = useState("call");
  const [body, setBody] = useState("");
  const [list, setList] = useState<any[]>(initial ?? []);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, claim_id: claimId, scope, body }),
      });
      const d = await r.json();
      if (r.ok) { setList((l) => [d.note, ...l]); setBody(""); }
      else setErr(d.error || `Save failed (${r.status})`);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  }

  const shown = filter === "all" ? list : list.filter((n) => n.scope === filter);

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {SCOPES.map((s) => (
            <button key={s.id} className={`chip ${scope === s.id ? "active" : ""}`} onClick={() => setScope(s.id)}>{s.label}</button>
          ))}
        </div>
        <textarea rows={3} placeholder={`Write a ${SCOPES.find((s) => s.id === scope)?.label.toLowerCase()}…`} value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn" style={{ marginTop: 8 }} onClick={add} disabled={busy}>{busy ? "Saving…" : "Add note"}</button>
        {err && <span className="save-msg warn" style={{ marginLeft: 10 }}>{err}</span>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        {SCOPES.map((s) => <button key={s.id} className={`chip ${filter === s.id ? "active" : ""}`} onClick={() => setFilter(s.id)}>{s.label}</button>)}
      </div>

      {shown.length === 0 && <p className="muted">No notes yet.</p>}
      {shown.map((n) => (
        <div key={n.id} className="qcard">
          <span className="badge stage" style={{ marginBottom: 6 }}>{SCOPES.find((s) => s.id === n.scope)?.label ?? n.scope}</span>
          <div>{n.body}</div>
          <div className="pmeta" style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>{n.author_name} · {new Date(n.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
