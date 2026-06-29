"use client";
import { useState } from "react";

interface Campaign { id: string; name: string; firm_id: string | null; case_type: string; intake_template: string | null; retainer_template_id: string | null; tier: string | null; bill_rate: number | null; active: boolean; firms?: { name: string } | null; }

export default function CampaignsManager({ initial, firms, retainerTemplates }: { initial: Campaign[]; firms: { id: string; name: string }[]; retainerTemplates: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Campaign[]>(initial);
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!edit?.name?.trim() || !edit?.case_type?.trim()) { setMsg("Name and case type are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Save failed"); return; }
    const list = await (await fetch("/api/campaigns")).json();
    setRows(list.campaigns ?? []);
    setEdit(null);
  }
  async function deactivate(id: string) {
    if (!confirm("Deactivate this campaign? Existing leads keep their link; it just stops appearing for new leads.")) return;
    await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    setRows((rs) => rs.map((x) => x.id === id ? { ...x, active: false } : x));
  }

  return (
    <div className="side-card" style={{ maxWidth: 920 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        <button className="btn" onClick={() => setEdit({ name: "", case_type: "", active: true })}>+ New campaign</button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>A campaign is one firm running one case type (e.g. "TMP MVA"). It carries the firm, type, intake form, default retainer, and billing so Add lead only needs a name and the campaign.</p>
      {msg && <p className="banner" style={{ margin: "8px 0" }}>{msg}</p>}

      <table className="docket">
        <thead><tr><th>Campaign</th><th>Firm</th><th>Type</th><th>Tier</th><th>Rate</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td>{c.firms?.name || (firms.find((f) => f.id === c.firm_id)?.name) || "—"}</td>
              <td>{c.case_type}</td>
              <td>{c.tier || "—"}</td>
              <td>{c.bill_rate != null ? `$${c.bill_rate}` : "—"}</td>
              <td>{c.active ? <span className="badge count">active</span> : <span className="badge dq">inactive</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEdit({ ...c })}>Edit</button>
                {c.active && <button className="btn ghost sm danger" onClick={() => deactivate(c.id)}>Deactivate</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No campaigns yet. Create one to route Add lead.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit campaign" : "New campaign"}</h3>
            <div className="grid2">
              <label>Campaign name<input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="TMP MVA" /></label>
              <label>Firm<select value={edit.firm_id ?? ""} onChange={(e) => setEdit({ ...edit, firm_id: e.target.value })}><option value="">Select firm…</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Case type<input value={edit.case_type ?? ""} onChange={(e) => setEdit({ ...edit, case_type: e.target.value })} placeholder="mva" /></label>
              <label>Intake template (claim type key)<input value={edit.intake_template ?? ""} onChange={(e) => setEdit({ ...edit, intake_template: e.target.value })} placeholder="defaults to case type" /></label>
              <label>Default retainer<select value={edit.retainer_template_id ?? ""} onChange={(e) => setEdit({ ...edit, retainer_template_id: e.target.value })}><option value="">None</option>{retainerTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label>Tier<input value={edit.tier ?? ""} onChange={(e) => setEdit({ ...edit, tier: e.target.value })} placeholder="A" /></label>
              <label>Bill rate (per sign)<input type="number" step="0.01" value={edit.bill_rate ?? ""} onChange={(e) => setEdit({ ...edit, bill_rate: parseFloat(e.target.value) })} placeholder="0.00" /></label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save campaign"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
