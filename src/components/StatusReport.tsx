"use client";
import { useState, useMemo, useEffect } from "react";

// LawRuler-style Status Report: multi-select statuses + case types + date range
// (+ assignee/source) run to a file list, with saveable presets.
export default function StatusReport({ leads, claims, statuses, agents = [] }: { leads: any[]; claims: any[]; statuses: any[]; agents?: { id: string; full_name: string }[] }) {
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [selTypes, setSelTypes] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateField, setDateField] = useState<"updated" | "created">("updated");
  const [assignee, setAssignee] = useState("any");
  const [source, setSource] = useState("any");
  const [ran, setRan] = useState(false);
  const [presets, setPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState("");
  const [msg, setMsg] = useState("");

  const leadById = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);
  const statusLabel = useMemo(() => Object.fromEntries(statuses.map((s) => [s.key, s.label])), [statuses]);
  const caseTypes = useMemo(() => Array.from(new Set(claims.map((c) => c.claim_type).filter(Boolean))).sort(), [claims]);
  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))).sort(), [leads]);

  useEffect(() => { (async () => { try { const d = await (await fetch("/api/report-presets")).json(); setPresets(d.presets ?? []); } catch {} })(); }, []);

  const results = useMemo(() => {
    if (!ran) return [];
    return claims.map((c) => ({ ...c, lead: leadById[c.lead_id] })).filter((c) => {
      if (!c.lead) return false;
      if (selStatuses.length && !selStatuses.includes(c.status)) return false;
      if (selTypes.length && !selTypes.includes(c.claim_type)) return false;
      if (assignee !== "any" && c.lead.assigned_agent !== assignee) return false;
      if (source !== "any" && c.lead.source !== source) return false;
      const d = dateField === "created" ? c.lead.created_at : c.lead.updated_at;
      if (from && d && d < from) return false;
      if (to && d && d > to + "T23:59:59") return false;
      return true;
    }).sort((a, b) => (b.lead.updated_at || "").localeCompare(a.lead.updated_at || ""));
  }, [ran, claims, selStatuses, selTypes, assignee, source, from, to, dateField, leadById]);

  function toggle(arr: string[], setArr: (v: string[]) => void, v: string) {
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function applyPreset(p: any) {
    const c = p.config || {};
    setSelStatuses(c.statuses ?? []); setSelTypes(c.caseTypes ?? []);
    setFrom(c.from ?? ""); setTo(c.to ?? ""); setDateField(c.dateField ?? "updated");
    setAssignee(c.assignee ?? "any"); setSource(c.source ?? "any");
    setRan(true);
  }
  async function savePreset() {
    if (!presetName.trim()) { setMsg("Name the preset first."); return; }
    const config = { statuses: selStatuses, caseTypes: selTypes, from, to, dateField, assignee, source };
    const r = await fetch("/api/report-presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: presetName, config }) });
    if (r.ok) { setPresetName(""); setMsg("Preset saved."); const d = await (await fetch("/api/report-presets")).json(); setPresets(d.presets ?? []); }
  }
  async function delPreset(id: string) {
    await fetch(`/api/report-presets?id=${id}`, { method: "DELETE" });
    setPresets((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Status Report</h3>
        <p className="muted" style={{ marginTop: 0 }}>Choose one or more statuses and case types to pull a file list. Default reports by last-updated; switch to created date if you prefer.</p>

        {presets.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Saved:</span>
            {presets.map((p) => (
              <span key={p.id} className="preset-chip">
                <button onClick={() => applyPreset(p)}>{p.name}</button>
                <button className="preset-x" onClick={() => delPreset(p.id)}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="sr-grid">
          <div>
            <div className="sr-label">Statuses</div>
            <div className="sr-chips">
              {statuses.map((s) => (
                <button key={s.key} className={`sr-chip ${selStatuses.includes(s.key) ? "on" : ""}`} onClick={() => toggle(selStatuses, setSelStatuses, s.key)}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="sr-label">Case types</div>
            <div className="sr-chips">
              {caseTypes.map((t) => (
                <button key={t} className={`sr-chip ${selTypes.includes(t) ? "on" : ""}`} onClick={() => toggle(selTypes, setSelTypes, t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="sr-field">Date field<select value={dateField} onChange={(e) => setDateField(e.target.value as any)}><option value="updated">Last updated</option><option value="created">Created</option></select></label>
          <label className="sr-field">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="sr-field">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="sr-field">Assignee<select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="any">Any</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label>
          {sources.length > 0 && <label className="sr-field">Source<select value={source} onChange={(e) => setSource(e.target.value)}><option value="any">Any</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>}
          <button className="btn" onClick={() => setRan(true)}>Run report</button>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
          <input placeholder="Save this as a preset…" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ width: 220 }} />
          <button className="btn ghost sm" onClick={savePreset}>Save preset</button>
          {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
        </div>
      </div>

      {ran && (
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{results.length} file{results.length === 1 ? "" : "s"}</h3>
          </div>
          <div className="table-scroll">
            <table className="docket">
              <thead><tr><th>File</th><th>Claimant</th><th>Case type</th><th>Status</th><th>Campaign</th><th>Updated</th></tr></thead>
              <tbody>
                {results.slice(0, 1000).map((c, i) => (
                  <tr key={c.lead_id + i}>
                    <td><a href={`/leads/${c.lead_id}`}>{c.lead.lead_no}</a></td>
                    <td style={{ fontWeight: 600 }}>{c.lead.claimant_name || "—"}</td>
                    <td>{c.claim_type || "—"}</td>
                    <td>{statusLabel[c.status] ?? c.status}</td>
                    <td className="muted">{c.campaign || "—"}</td>
                    <td className="muted">{c.lead.updated_at ? new Date(c.lead.updated_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={6} className="muted">No files match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
