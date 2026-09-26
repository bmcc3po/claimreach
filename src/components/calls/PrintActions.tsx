"use client";
import { useState } from "react";

export default function PrintActions({ leadId }: { leadId: string }) {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true); setMsg(""); setBad(false);
    try {
      const r = await fetch("/api/calls/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, to }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || "The email did not send.");
      setMsg(`Sent to ${to}.`); setTo("");
    } catch (e: any) { setBad(true); setMsg(e.message); }
    setBusy(false);
  }

  return (
    <div className="cc-print-actions">
      <button className="cc-btn cc-full" onClick={() => window.print()}>Print</button>
      <input className="cc-field" style={{ background: "#F2F2F7" }} type="email" inputMode="email" placeholder="Email this case to" aria-label="Email this case to" value={to} onChange={(e) => setTo(e.target.value)} />
      <button className="cc-btn cc-soft" disabled={busy || !to} onClick={send}>{busy ? "Sending" : "Email the case"}</button>
      {msg && <div className={`cc-cue${bad ? " cc-red" : ""}`}>{msg}</div>}
    </div>
  );
}
