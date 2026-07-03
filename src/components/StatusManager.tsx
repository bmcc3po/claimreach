"use client";
import { useState } from "react";
import type { StatusDef } from "@/lib/statuses";

const TONES = ["good", "bad", "warn", "info", "neut"];
const PHASES = ["pre_qa", "in_qa", "post_qa", "terminal"];
const QUALIFY = ["qualify", "disqualify", "undetermined"];
const SIDES = ["agent", "qa", "owner", "firm", "system"];
const TRACKS = ["esign", "nosig", "intake", "firm", "terminal", "none"];
const LR_GROUPS = ["New/Open", "Wanted/Chasing", "Referred", "Clients", "Rejected", "Closed"];

const BLANK: Partial<StatusDef> = {
  key: "", label: "", track: "none", phase: "pre_qa", tone: "neut", side: "agent",
  qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false,
  is_final: false, lawruler_group: "New/Open", sort: 100, active: true,
};

export default function StatusManager({ initial }: { initial: StatusDef[] }) {
  const [rows, setRows] = useState<StatusDef[]>(initial);
  const [edit, setEdit] = useState<Partial<StatusDef> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!edit?.key?.trim() || !edit?.label?.trim()) { setMsg("Key and label are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/statuses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Save failed"); return; }
    const list = await (await fetch("/api/statuses")).json();
    setRows(list.statuses ?? []);
    setEdit(null);
  }

  async function remove(key: string) {
    if (!confirm(`Delete status "${key}"? If it is in use, set it inactive instead.`)) return;
    const r = await fetch(`/api/statuses?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Delete failed"); return; }
    setRows((rs) => rs.filter((x) => x.key !== key));
  }

  return (
    <div className="side-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Statuses</h3>
        <button className="btn" onClick={() => setEdit({ ...BLANK })}>+ Add status</button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>The status set that drives the QA pipeline, billing, and what the firm can see. Core statuses can be edited but not deleted.</p>
      {msg && <p className="banner" style={{ margin: "8px 0" }}>{msg}</p>}

      <div className="table-scroll">
        <table className="docket statuses-table">
          <thead><tr>
            <th>Label</th><th>Key</th><th>Phase</th><th>Qualify</th><th>Side</th>
            <th className="col-flag">e-Sign</th><th className="col-flag">Billable</th><th className="col-flag">Unlocks firm</th><th className="col-flag">Final</th><th>LawRuler</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key} style={{ opacity: s.active === false ? 0.5 : 1 }}>
                <td><span className={`sb ${s.tone}`}>{s.label}</span></td>
                <td className="muted">{s.key}</td>
                <td>{s.phase}</td>
                <td>{s.qualify}</td>
                <td>{s.side}</td>
                <td className="col-flag">{s.requires_esign ? "Yes" : "—"}</td>
                <td className="col-flag">{s.billable ? "Yes" : "—"}</td>
                <td className="col-flag">{s.unlocks_firm ? "Yes" : "—"}</td>
                <td className="col-flag">{s.is_final ? "Yes" : "—"}</td>
                <td className="muted">{s.lawruler_group || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setEdit({ ...s })}>Edit</button>
                  {!s.system_locked && <button className="btn ghost sm danger" onClick={() => remove(s.key)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.system_locked ? "Edit status" : (rows.find((r) => r.key === edit.key) ? "Edit status" : "New status")}</h3>
            <div className="grid2">
              <label>Label<input value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
              <label>Key<input value={edit.key ?? ""} disabled={!!edit.system_locked || rows.some((r) => r.key === edit.key)} onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="lowercase_key" /></label>
              <label>Phase<select value={edit.phase} onChange={(e) => setEdit({ ...edit, phase: e.target.value as any })}>{PHASES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>Qualify<select value={edit.qualify} onChange={(e) => setEdit({ ...edit, qualify: e.target.value as any })}>{QUALIFY.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>Side<select value={edit.side} onChange={(e) => setEdit({ ...edit, side: e.target.value as any })}>{SIDES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>Track<select value={edit.track} onChange={(e) => setEdit({ ...edit, track: e.target.value as any })}>{TRACKS.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>Color<select value={edit.tone} onChange={(e) => setEdit({ ...edit, tone: e.target.value as any })}>{TONES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>LawRuler group<select value={edit.lawruler_group ?? ""} onChange={(e) => setEdit({ ...edit, lawruler_group: e.target.value })}>{LR_GROUPS.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label>Sort<input type="number" value={edit.sort ?? 100} onChange={(e) => setEdit({ ...edit, sort: parseInt(e.target.value, 10) })} /></label>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 14, marginTop: 10 }}>
              <label className="chk"><input type="checkbox" checked={!!edit.requires_esign} onChange={(e) => setEdit({ ...edit, requires_esign: e.target.checked })} /> Requires e-sign</label>
              <label className="chk"><input type="checkbox" checked={!!edit.billable} onChange={(e) => setEdit({ ...edit, billable: e.target.checked })} /> Billable</label>
              <label className="chk"><input type="checkbox" checked={!!edit.unlocks_firm} onChange={(e) => setEdit({ ...edit, unlocks_firm: e.target.checked })} /> Unlocks file for firm</label>
              <label className="chk"><input type="checkbox" checked={!!edit.is_final} onChange={(e) => setEdit({ ...edit, is_final: e.target.checked })} /> Final</label>
              <label className="chk"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save status"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
