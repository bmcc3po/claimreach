"use client";
import { useState, useEffect } from "react";

// Deal-level message thread — both teams (intake + firm) post and see it.
// Backed by notes scope 'message' so it shares RLS with the case.
export default function CaseMessages({ leadId, claimId, me }: { leadId: string; claimId?: string; me: string }) {
  const [thread, setThread] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const r = await fetch(`/api/messages?lead=${leadId}`); const d = await r.json(); setThread(d.messages ?? []); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, [leadId]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, claim_id: claimId, body }) });
    if (r.ok) { setBody(""); await load(); }
    setBusy(false);
  }

  return (
    <div>
      <div className="section-title">Case messages — visible to both teams</div>
      <div className="msg-thread">
        {loading && <p className="muted">Loading…</p>}
        {!loading && thread.length === 0 && <p className="muted">No messages yet. Start the conversation.</p>}
        {thread.map((m) => {
          const mine = m.author_name === me;
          return (
            <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
              <div className="msg-bubble">
                <div style={{ fontSize: 11, fontWeight: 700, opacity: .7, marginBottom: 2 }}>{m.author_name}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                <div style={{ fontSize: 10.5, opacity: .55, marginTop: 3 }}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn" onClick={send} disabled={busy}>{busy ? "…" : "Send"}</button>
      </div>
    </div>
  );
}
