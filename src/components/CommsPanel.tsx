"use client";
import { useState } from "react";

export default function CommsPanel({
  leadId, phone, monitored, safeChannels,
}: {
  leadId: string;
  phone: string | null;
  monitored: boolean;
  safeChannels: string[];
}) {
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canText = !monitored || safeChannels.includes("Text");
  const canCall = !monitored || safeChannels.includes("Call");

  async function send(action: "text" | "call") {
    if (!phone) { setLog((l) => [...l, "No phone number on file."]); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/justcall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lead_id: leadId, to: phone, body: msg }),
      });
      const d = await r.json();
      if (!r.ok) { setLog((l) => [...l, `Error: ${d.error}`]); }
      else {
        setLog((l) => [...l, action === "text" ? `Text sent: ${msg}` : "Call initiated"]);
        if (action === "text") setMsg("");
      }
    } catch (e: any) { setLog((l) => [...l, `Error: ${e.message}`]); }
    setBusy(false);
  }

  return (
    <div className="card">
      <strong>Contact</strong>
      {monitored && (
        <div className="gate" style={{ marginTop: 8 }}>
          <span className="tag">Monitored contact</span>
          Communications are flagged monitored. Only safe channels are enabled:
          {" "}{safeChannels.length ? safeChannels.join(", ") : "none selected"}.
        </div>
      )}
      <div className="muted" style={{ margin: "8px 0" }}>{phone ?? "No number on file"}</div>
      <textarea placeholder="Type a text message…" value={msg}
        onChange={(e) => setMsg(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={busy || !canText || !msg} onClick={() => send("text")}>
          Send text
        </button>
        <button className="btn secondary" disabled={busy || !canCall} onClick={() => send("call")}>
          Click to call
        </button>
      </div>
      {log.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {log.map((l, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>· {l}</div>)}
        </div>
      )}
    </div>
  );
}
