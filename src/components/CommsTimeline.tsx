"use client";
import { useState, useEffect } from "react";

const ICON: Record<string, string> = { call: "📞", sms: "💬", voicemail: "📩" };

export default function CommsTimeline({ leadId, phone, channel }: { leadId: string; phone?: string; channel?: "call" | "sms" | "all" }) {
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsBody, setSmsBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/communications?lead_id=${leadId}`); const d = await r.json();
    setComms(d.comms ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, [leadId]);

  const filtered = comms.filter((c) => channel === "sms" ? c.channel === "sms" : channel === "call" ? c.channel !== "sms" : true);

  function call() {
    if (!phone) return;
    // JustCall has no click-to-call REST endpoint; open the dialer. The JustCall
    // desktop/web app registers tel: links, so this rings through JustCall.
    const num = phone.replace(/[^\d+]/g, "");
    window.open(`tel:${num}`, "_self");
    setMsg("Opening dialer… place the call in JustCall.");
  }
  async function sendSms() {
    if (!smsBody.trim()) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/justcall/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "sms", lead_id: leadId, to: phone, body: smsBody }) });
    const d = await r.json(); setBusy(false);
    if (d.ok) { setSmsBody(""); load(); } else setMsg(d.error || "SMS failed");
  }

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 14, alignItems: "center" }}>
        {channel !== "sms" && <button className="btn gold sm" onClick={call} disabled={busy || !phone}>📞 Call {phone || "—"}</button>}
        {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
      </div>

      {channel === "sms" && (
        <div className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input placeholder={`Text ${phone || ""}…`} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendSms()} style={{ flex: 1 }} />
          <button className="btn sm" onClick={sendSms} disabled={busy || !phone}>Send</button>
        </div>
      )}

      {loading && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No {channel === "sms" ? "messages" : "calls"} yet.</p>}

      <div className="comm-feed">
        {filtered.map((c) => (
          <div key={c.id} className={`comm-item ${c.direction}`}>
            <div className="comm-head">
              <span className="comm-icon">{ICON[c.channel] || "•"}</span>
              <strong>{c.channel === "sms" ? "Text" : c.channel === "voicemail" ? "Voicemail" : "Call"}</strong>
              <span className="comm-dir">{c.direction}{c.call_kind === "dialer" ? " · dialer" : ""}</span>
              {c.agent_name && <span className="muted" style={{ fontSize: 12 }}>· {c.agent_name}</span>}
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}>{c.occurred_at ? new Date(c.occurred_at).toLocaleString() : ""}</span>
            </div>
            {c.body && <div className="comm-body">{c.body}</div>}
            {c.duration_sec != null && c.channel !== "sms" && <div className="muted" style={{ fontSize: 12 }}>Duration: {Math.floor(c.duration_sec / 60)}m {c.duration_sec % 60}s</div>}
            {c.recording_url && (
              <audio controls preload="none" style={{ width: "100%", marginTop: 6, height: 34 }}><source src={c.recording_url} /></audio>
            )}
            {c.transcript && (
              <details style={{ marginTop: 6 }}><summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Transcript</summary>
                <div className="comm-transcript">{c.transcript}</div></details>
            )}
            {(c.jc_summary || c.jc_sentiment) && (
              <div className="comm-jc">
                <span className="comm-jc-tag">JustCall AI</span>
                {c.jc_sentiment && <span className="badge count" style={{ marginLeft: 6 }}>{c.jc_sentiment}</span>}
                {c.jc_summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{c.jc_summary}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
