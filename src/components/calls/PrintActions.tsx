"use client";
import { useState } from "react";

// Print, or email the whole case. When the agreement is complete, the signed
// PDF goes along unless the sender turns it off (it has her DOB and SSN).
export default function PrintActions({ leadId, hasPdf = false }: { leadId: string; hasPdf?: boolean }) {
  const [to, setTo] = useState("");
  const [attach, setAttach] = useState(true);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true); setMsg(""); setBad(false);
    try {
      const r = await fetch("/api/calls/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, to, attach: hasPdf && attach }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `The email did not send (${r.status}).`);
      const sent = to;
      setTo("");
      if (d.attach_error) { setBad(true); setMsg(`Sent to ${sent}, without the agreement: ${d.attach_error}`); }
      else setMsg(`Sent to ${sent}${d.attached ? " with the signed agreement" : ""}.`);
    } catch (e: any) { setBad(true); setMsg(e.message); }
    setBusy(false);
  }

  return (
    <div className="cc-print-actions">
      <button className="cc-btn cc-full" onClick={() => window.print()}>Print</button>
      <input className="cc-field" style={{ background: "#F2F2F7" }} type="email" inputMode="email" placeholder="Email this case to" aria-label="Email this case to" value={to} onChange={(e) => setTo(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && to && !busy) send(); }} />
      {hasPdf && (
        <label className="cr-attach">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          <span>Attach the signed agreement<small>It has her date of birth and SSN on it.</small></span>
        </label>
      )}
      <button className="cc-btn cc-soft" disabled={busy || !to} onClick={send}>{busy ? "Sending" : "Email the case"}</button>
      {msg && <div className={`cc-cue${bad ? " cc-red" : ""}`} role="status">{msg}</div>}
    </div>
  );
}
