"use client";
import { useState, useEffect } from "react";

export default function DripManager() {
  const [due, setDue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [held, setHeld] = useState<any[]>([]);
  const [sending, setSending] = useState("unknown");
  const [preview, setPreview] = useState({ limit: 200, truncated: false });

  async function load() {
    setLoading(true); setError(""); setDue([]); setHeld([]); setSending("unknown");
    try {
      const r = await fetch("/api/drip"); const d = await r.json();
      if (!r.ok || d.error || !Array.isArray(d.due)) throw new Error(d.error || "Could not load scheduled follow-up.");
      setDue(d.due); setHeld(d.held ?? []); setSending(d.sending || "unknown");
      setPreview(d.preview ?? { limit: 200, truncated: false });
    } catch (e: any) { setError(e?.message || "Could not load scheduled follow-up."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function run() {
    setRunning(true); setMsg("");
    try {
      const r = await fetch("/api/drip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "process" }) });
      const d = await r.json();
      if (!r.ok || d.ok !== true) throw new Error(d.error || d.errors?.[0]?.reason || "The reminder run could not be confirmed. Refresh before retrying.");
      setMsg(`Recorded ${d.fired} call reminder${d.fired === 1 ? "" : "s"}. ${d.held?.length || 0} held in this batch.${d.batch?.truncated ? " More reminders remain outside this batch." : ""} No calls, texts or emails were sent.`);
      await load();
    } catch (e: any) { setMsg(e?.message || "The reminder run could not be confirmed. Refresh before retrying."); }
    finally { setRunning(false); }
  }

  return (
    <div className="side-card" style={{ maxWidth: 620 }}>
      <div className="row"><h3 style={{ margin: 0 }}>Scheduled follow-up</h3>
        <span className="spacer" />
        <button className="btn sm" onClick={run} disabled={running || loading || !!error || sending !== "reminders_only"}>{running ? "Running…" : "Record due reminders"}</button>
      </div>
      <p className="muted">Automatic texts and emails are not configured. {sending === "off" ? "Scheduled reminders are also switched off." : "This view records call reminders only."}</p>
      {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p role="alert">{error} <button className="btn sm" onClick={load}>Retry</button></p>}
      {!loading && !error && preview.truncated && <p className="muted">Preview is limited to the first {preview.limit} due items. Counts below cover this preview only; more items are not shown.</p>}
      {!loading && !error && due.length === 0 && <p className="muted">{preview.truncated ? "No eligible reminders in this preview." : "No eligible reminders are due."}</p>}
      {!error && held.length > 0 && <p className="muted">{held.length} follow-up item{held.length === 1 ? " is" : "s are"} held. {held[0].reason}</p>}
      {!error && due.map((d) => (
        <div key={d.enrollment_id} className="vrow">
          <span className="vk">{d.claimant_name ?? d.lead_id?.slice(0, 8)}</span>
          <span className="vv"><span className="badge stage">{d.channel}</span> {d.name}</span>
        </div>
      ))}
    </div>
  );
}
