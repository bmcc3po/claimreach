"use client";
import { useState } from "react";
import type { DqReason } from "@/lib/statuses";

const CATEGORIES = ["Medical", "Representation", "Eligibility", "Contact", "Other"];

export default function DqReasonManager({ initial }: { initial: DqReason[] }) {
  const [rows, setRows] = useState<DqReason[]>(initial);
  const [edit, setEdit] = useState<Partial<DqReason> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!edit?.key?.trim() || !edit?.label?.trim()) { setMsg("Key and label are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/dq-reasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Save failed"); return; }
    const list = await (await fetch("/api/dq-reasons")).json();
    setRows(list.reasons ?? []);
    setEdit(null);
  }

  async function retire(key: string) {
    if (!confirm(`Retire reason "${key}"? Past disqualifications stay queryable; it just stops appearing for agents.`)) return;
    const r = await fetch(`/api/dq-reasons?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setMsg(d.error || "Failed"); return; }
    setRows((rs) => rs.map((x) => x.key === key ? { ...x, active: false } : x));
  }

  return (
    <div className="side-card" style={{ maxWidth: 720 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>DQ Reasons</h3>
        <button className="btn" onClick={() => setEdit({ key: "", label: "", category: "Other", sort: 100, active: true })}>+ Add reason</button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>Agents must choose one of these whenever they disqualify a file. Retire a reason to keep its history queryable while removing it from the picker.</p>
      {msg && <p className="banner" style={{ margin: "8px 0" }}>{msg}</p>}

      <table className="docket">
        <thead><tr><th>Reason</th><th>Category</th><th>Key</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key} style={{ opacity: d.active === false ? 0.5 : 1 }}>
              <td style={{ fontWeight: 600 }}>{d.label}</td>
              <td>{d.category}</td>
              <td className="muted">{d.key}</td>
              <td>{d.active === false ? <span className="badge dq">retired</span> : <span className="badge count">active</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEdit({ ...d })}>Edit</button>
                {d.active !== false && <button className="btn ghost sm danger" onClick={() => retire(d.key)}>Retire</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>{rows.some((r) => r.key === edit.key) ? "Edit reason" : "New reason"}</h3>
            <div className="grid2">
              <label>Label<input value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
              <label>Key<input value={edit.key ?? ""} disabled={rows.some((r) => r.key === edit.key)} onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="lowercase_key" /></label>
              <label>Category<select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>Sort<input type="number" value={edit.sort ?? 100} onChange={(e) => setEdit({ ...edit, sort: parseInt(e.target.value, 10) })} /></label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save reason"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
