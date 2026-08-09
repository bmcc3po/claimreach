"use client";
import { useEffect, useState } from "react";

export default function FirmsManager() {
  const [firms, setFirms] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const d = await (await fetch("/api/firms")).json(); setFirms(d.firms ?? []); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.name?.trim()) { setMsg("Firm name is required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/firms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    setBusy(false);
    if (d.ok) { setEdit(null); load(); } else setMsg(d.error || "Save failed");
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Firms</h1>
          <p className="muted" style={{ marginTop: 0 }}>Each firm has a short vanity prefix shown on its lead IDs (TMP-1002, WLL-1003). The number itself is one global sequence across all firms, so an agent can search just the number, and audit pulls stay in true creation order.</p>
        </div>
        <button className="btn" onClick={() => setEdit({ name: "", lead_prefix: "" })}>+ New firm</button>
      </div>
      {msg && !edit && <p className="muted" style={{ marginTop: 6 }}>{msg}</p>}

      <table className="docket" style={{ marginTop: 12 }}>
        <thead><tr><th>Firm</th><th>Lead prefix</th><th>Example lead ID</th><th></th></tr></thead>
        <tbody>
          {firms.map((f) => (
            <tr key={f.id}>
              <td style={{ fontWeight: 600 }}>{f.name}</td>
              <td><span className="badge count">{f.lead_prefix}</span></td>
              <td className="muted">{f.lead_prefix}-1002</td>
              <td><button className="btn ghost sm" onClick={() => setEdit({ id: f.id, name: f.name, lead_prefix: f.lead_prefix })}>Edit</button></td>
            </tr>
          ))}
          {firms.length === 0 && <tr><td colSpan={4} className="muted">No firms yet. Add your first firm.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: "20px 22px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit firm" : "New firm"}</h3>
            <div className="grid2" style={{ gridTemplateColumns: "1fr" }}>
              <label>Firm name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Turnbull Moak & Pendergrass" /></label>
              <label>Lead prefix (2 to 5 letters)<input value={edit.lead_prefix} onChange={(e) => setEdit({ ...edit, lead_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) })} placeholder="TMP" /></label>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Preview: <strong>{(edit.lead_prefix || "CR")}-1002</strong>. The prefix is cosmetic, the number is global and is what makes each lead unique and searchable.</p>
            {msg && <p className="sign-err" style={{ fontSize: 13 }}>{msg}</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save firm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
