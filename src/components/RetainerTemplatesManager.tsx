"use client";
import { useEffect, useState } from "react";

// Global retainer-template management (outside any file): create, edit, assign
// to a case type, mark default. Mirrors the per-file editor but standalone.
const CASE_TYPES = ["any", "motel_trafficking", "bard_powerport", "pfas", "medmal", "mva"];

export default function RetainerTemplatesManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const d = await (await fetch("/api/retainer-templates")).json(); setTemplates(d.templates ?? []); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.name?.trim() || !edit?.body?.trim()) { setMsg("Name and body are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save_template", id: edit.id, name: edit.name, body: edit.body, case_type: edit.case_type === "any" ? null : edit.case_type, is_default: !!edit.is_default }) });
    setBusy(false);
    if (r.ok) { setEdit(null); setMsg("Saved."); load(); } else { const d = await r.json(); setMsg(d.error || "Save failed"); }
  }
  async function del(id: string) {
    if (!confirm("Delete this retainer template?")) return;
    await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete_template", id }) });
    load();
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Retainer templates</h2>
          <p className="muted" style={{ marginTop: 0 }}>Create reusable retainers, bind each to a case type, and mark one default per type. On a file, the matching default pre-selects automatically.</p>
        </div>
        <button className="btn" onClick={() => setEdit({ name: "", body: "", case_type: "any", is_default: false })}>+ New retainer</button>
      </div>
      {msg && <p className="muted" style={{ marginTop: 6 }}>{msg}</p>}

      <table className="docket" style={{ marginTop: 12 }}>
        <thead><tr><th>Name</th><th>Case type</th><th>Default</th><th></th></tr></thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td style={{ fontWeight: 600 }}>{t.name}</td>
              <td>{t.case_type || "any"}</td>
              <td>{t.is_default ? <span className="badge count">default</span> : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEdit({ ...t, case_type: t.case_type || "any" })}>Edit</button>
                <button className="btn ghost sm danger" onClick={() => del(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {templates.length === 0 && <tr><td colSpan={4} className="muted">No retainer templates yet.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit retainer" : "New retainer"}</h3>
            <div className="row" style={{ gap: 12, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: 1, minWidth: 200 }}>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="MVA Standard Retainer" /></label>
              <label>Case type<select value={edit.case_type} onChange={(e) => setEdit({ ...edit, case_type: e.target.value })}>{CASE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label className="chk" style={{ alignSelf: "flex-end", marginBottom: 6 }}><input type="checkbox" checked={!!edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Default for this type</label>
            </div>
            <label>Body<textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={12} placeholder="Retainer text. Use {{client_name}}, {{date}} etc. for auto-fill." style={{ width: "100%", fontFamily: "Georgia, serif" }} /></label>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save retainer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
