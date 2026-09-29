"use client";
import { useState, useEffect, useRef } from "react";
import { fileMaySendComms, fileMayUseStaffTools, type FileFence } from "@/lib/file-fence";

const ICON: Record<string, string> = { call: "📞", sms: "💬", mms: "💬", email: "✉", voicemail: "📩" };

export default function CommsTimeline({ leadId, phone, channel, fence }: { leadId: string; phone?: string; channel?: "call" | "sms" | "messages" | "all"; fence?: FileFence }) {
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsBody, setSmsBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState(false);
  const sending = useRef(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch(`/api/communications?lead_id=${encodeURIComponent(leadId)}`); const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Could not load communications.");
      setComms(d.comms ?? []);
    } catch (e: any) { setLoadError(true); setMsg(e.message || "Could not load communications."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [leadId]);

  const messages = channel === "sms" || channel === "messages";
  const filtered = comms.filter((c) => channel === "sms" ? ["sms", "mms"].includes(c.channel) : channel === "messages" ? ["sms", "mms", "email"].includes(c.channel) : channel === "call" ? ["call", "voicemail"].includes(c.channel) : true);

  function call() {
    if (!phone) return;
    // JustCall has no click-to-call REST endpoint; open the dialer. The JustCall
    // desktop/web app registers tel: links, so this rings through JustCall.
    const num = phone.replace(/[^\d+]/g, "");
    window.open(`tel:${num}`, "_self");
    setMsg("Opening dialer… place the call in JustCall.");
  }
  async function sendSms() {
    if (sending.current || !smsBody.trim() || !phone || !fileMaySendComms(fence)) return;
    sending.current = true;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/justcall/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "sms", lead_id: leadId, to: phone, body: smsBody }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "The text could not be confirmed. Check message history before retrying.");
      setSmsBody(""); await load();
    } catch (e: any) { setMsg(e.message || "The text could not be confirmed. Check message history before retrying."); }
    finally { sending.current = false; setBusy(false); }
  }

  const canSend = fileMaySendComms(fence);
  const showAi = fileMayUseStaffTools(fence);

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 14, alignItems: "center" }}>
        {!messages && <button className="btn gold sm" onClick={call} disabled={busy || !phone}>📞 Call {phone || "—"}</button>}
        {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
      </div>

      {canSend && messages && (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input placeholder={phone ? `Text ${phone}…` : "No phone on file"} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendSms()} style={{ flex: 1 }} disabled={!phone} />
            <button className="btn sm" onClick={sendSms} disabled={busy || !phone || !smsBody.trim()}>{busy ? "Sending…" : "Send"}</button>
          </div>
          {msg && <p className="save-msg warn" style={{ fontSize: 12.5, marginBottom: 14 }}>{msg}</p>}
          {!phone && <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Add a phone in Contact Info to text this client.</p>}
        </>
      )}

      {loading && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
      {!loading && !loadError && filtered.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No {messages ? "messages" : "calls"} yet.</p>}

      <div className="comm-feed">
        {filtered.map((c) => (
          <div key={c.id} className={`comm-item ${c.direction}`}>
            <div className="comm-head">
              <span className="comm-icon">{ICON[c.channel] || "•"}</span>
              <strong>{c.channel === "sms" || c.channel === "mms" ? "Text" : c.channel === "email" ? "Email" : c.channel === "voicemail" ? "Voicemail" : "Call"}</strong>
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
            {showAi && (c.jc_summary || c.jc_sentiment) && (
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
