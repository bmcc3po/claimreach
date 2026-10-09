"use client";
import { useState, useEffect, useRef } from "react";

// Deal-level message thread — both teams (intake + firm) post and see it.
// Backed by notes scope 'message' so it shares RLS with the case.
export default function CaseMessages({ leadId, claimId, me }: { leadId: string; claimId?: string; me: string }) {
  const [thread, setThread] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const currentLead = useRef(leadId);
  currentLead.current = leadId;

  async function load() {
    if (currentLead.current !== leadId) return;
    const current = ++generation.current;
    setLoading(true); setLoadError("");
    try {
      const r = await fetch(`/api/messages?lead=${leadId}`); const d = await r.json();
      if (!r.ok || !Array.isArray(d.messages)) throw new Error("load failed");
      if (current === generation.current) setThread(d.messages);
    } catch { if (current === generation.current) setLoadError("Could not refresh the messages. The thread may be out of date. Please retry."); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { setThread([]); setBody(""); setSendError(""); inFlight.current = false; setBusy(false); load(); return () => { generation.current++; }; }, [leadId]);

  async function send() {
    if (!body.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setSendError("");
    try {
      const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, body }) });
      const d = await r.json().catch(() => null);
      if (currentLead.current !== leadId) return;
      if (!r.ok || d?.ok !== true) { setSendError(d?.error || "Could not confirm the message. Refresh the thread before retrying. Your draft is still here."); return; }
      setBody(""); await load();
    } catch { if (currentLead.current === leadId) setSendError("Could not confirm the message. Check the connection and refresh the thread before retrying. Your draft is still here."); }
    finally { if (currentLead.current === leadId) { inFlight.current = false; setBusy(false); } }
  }

  return (
    <div>
      <div className="section-title">Case messages — visible to both teams</div>
      <div className="msg-thread">
        {loading && <p className="muted">Loading…</p>}
        {loadError && <p role="alert">{loadError} <button className="btn ghost sm" onClick={load}>Retry loading messages</button></p>}
        {!loading && !loadError && thread.length === 0 && <p className="muted">No messages yet. Start the conversation.</p>}
        {thread.map((m) => {
          const mine = m.author_name === me;
          return (
            <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
              <div className="msg-bubble">
                <div style={{ fontSize: 11, fontWeight: 700, opacity: .7, marginBottom: 2 }}>{m.author_name}</div>
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
                <div style={{ fontSize: 10.5, opacity: .55, marginTop: 3 }}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input aria-label="Case message" disabled={busy} placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn" onClick={send} disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send"}</button>
      </div>
      {sendError && <p role="alert">{sendError} {!loadError && <button className="btn ghost sm" disabled={loading} onClick={load}>Refresh messages</button>}</p>}
    </div>
  );
}
