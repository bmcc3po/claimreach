"use client";
import { useEffect, useState } from "react";

const CHANNELS = [
  { v: "sms", label: "SMS text" },
  { v: "email", label: "Email" },
  { v: "call_reminder", label: "Call reminder" },
];
const ASSIGN = [
  { v: "agent", label: "Agent" },
  { v: "case_manager", label: "Case manager" },
  { v: "both", label: "Both" },
];

export default function DripRulesManager() {
  const [rules, setRules] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const d = await (await fetch("/api/drip")).json(); setRules(d.rules ?? []); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.name?.trim()) { setMsg("Give the sequence a name."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/drip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_rule", ...edit }) });
    const d = await r.json();
    setBusy(false);
    if (d.ok) { setEdit(null); load(); } else setMsg(d.error || "Save failed");
  }
  async function toggle(rule: any) {
    await fetch("/api/drip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "toggle_rule", id: rule.id, active: !rule.active }) });
    load();
  }
  async function del(id: string) {
    if (!confirm("Delete this sequence?")) return;
    await fetch("/api/drip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete_rule", id }) });
    load();
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>Automated messaging (drip)</h3>
          <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>Recurring touches assigned to the agent and/or case manager. Toggle one off to pause it without deleting.</p>
        </div>
        <button className="btn" onClick={() => setEdit({ name: "", channel: "sms", every_days: 10, assign_to: "agent", template: "", active: true })}>+ New sequence</button>
      </div>
      {msg && !edit && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}

      <table className="docket" style={{ marginTop: 12 }}>
        <thead><tr><th>Sequence</th><th>Channel</th><th>Every</th><th>Assigned</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td><span className="badge stage">{r.channel}</span></td>
              <td>{r.every_days} days</td>
              <td className="muted">{r.assign_to}</td>
              <td>{r.active ? <span className="badge count">active</span> : <span className="badge">paused</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => toggle(r)}>{r.active ? "Pause" : "Resume"}</button>
                <button className="btn ghost sm" onClick={() => setEdit({ ...r })}>Edit</button>
                <button className="btn ghost sm danger" onClick={() => del(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && <tr><td colSpan={6} className="muted">No sequences yet. Add one to start automated touches.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, padding: "20px 22px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit sequence" : "New sequence"}</h3>
            <div className="grid2">
              <label>Sequence name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Check-in text" /></label>
              <label>Channel<select value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}</select></label>
              <label>Every (days)<input type="number" min={1} value={edit.every_days} onChange={(e) => setEdit({ ...edit, every_days: e.target.value })} placeholder="10" /></label>
              <label>Assigned to<select value={edit.assign_to} onChange={(e) => setEdit({ ...edit, assign_to: e.target.value })}>{ASSIGN.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></label>
            </div>
            {edit.channel !== "call_reminder" && (
              <label style={{ display: "block", marginTop: 10 }}>Message template
                <textarea value={edit.template ?? ""} onChange={(e) => setEdit({ ...edit, template: e.target.value })} rows={4} placeholder="Hi {{contact.first_name}}, just checking in on your case. Reply here with any questions." style={{ width: "100%" }} />
              </label>
            )}
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>You can use merge fields like {"{{contact.first_name}}"} and {"{{case.lead_no}}"} in the message.</p>
            <label className="chk" style={{ marginTop: 6 }}><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            {msg && <p className="sign-err" style={{ fontSize: 13 }}>{msg}</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save sequence"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
