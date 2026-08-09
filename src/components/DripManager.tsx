"use client";
import { useState, useEffect } from "react";

export default function DripManager() {
  const [due, setDue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/drip"); const d = await r.json(); setDue(d.due ?? []); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function run() {
    setRunning(true);
    const r = await fetch("/api/drip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "process" }) });
    const d = await r.json();
    setMsg(r.ok ? `Fired ${d.fired} drip${d.fired === 1 ? "" : "s"}.` : "Failed to run.");
    setRunning(false); load();
  }

  return (
    <div className="side-card" style={{ maxWidth: 620 }}>
      <div className="row"><h3 style={{ margin: 0 }}>Drips due now</h3>
        <span className="spacer" />
        <button className="btn sm" onClick={run} disabled={running}>{running ? "Running…" : "Run due drips"}</button>
      </div>
      {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && due.length === 0 && <p className="muted">Nothing due right now.</p>}
      {due.map((d) => (
        <div key={d.enrollment_id} className="vrow">
          <span className="vk">{d.claimant_name ?? d.lead_id?.slice(0, 8)}</span>
          <span className="vv"><span className="badge stage">{d.channel}</span> {d.name}</span>
        </div>
      ))}
    </div>
  );
}
