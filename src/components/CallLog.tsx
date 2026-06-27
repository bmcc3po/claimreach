"use client";
import { useState } from "react";

const OUTCOMES = ["reached", "voicemail", "no_answer", "callback_scheduled", "question_answered"];

export default function CallLog({ leadId, claimId, initial }: { leadId: string; claimId?: string; initial: any[] }) {
  const [list, setList] = useState<any[]>(initial ?? []);
  const [direction, setDirection] = useState("outbound");
  const [outcome, setOutcome] = useState("reached");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function add() {
    if (!notes.trim() && outcome === "reached") return;
    setBusy(true);
    const r = await fetch("/api/call-log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, claim_id: claimId, direction, outcome, notes }),
    });
    const d = await r.json();
    if (r.ok) { setList((l) => [d.log, ...l]); setNotes(""); }
    setBusy(false);
  }

  // AI note cleanup — turns rough notes into structured case notes (Claude in artifact).
  async function aiClean() {
    if (!notes.trim()) return;
    setAiBusy(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: `Clean up these rough call notes from a legal intake/case-management catch-up call into clear, professional case notes. Keep it factual, concise, and neutral. Add a one-line summary at top, then bullet the key points and any action items. Do not invent facts. Rough notes:\n\n${notes}` }],
        }),
      });
      const data = await resp.json();
      const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      if (text) setNotes(text);
    } catch { /* ignore */ }
    setAiBusy(false);
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <select style={{ width: "auto" }} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound (client called in)</option>
          </select>
          <select style={{ width: "auto" }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <textarea rows={4} placeholder="Call notes — what was discussed, questions answered, follow-ups…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={add} disabled={busy}>{busy ? "Logging…" : "Log call"}</button>
          <button className="btn ghost" onClick={aiClean} disabled={aiBusy || !notes.trim()}>{aiBusy ? "✨ Cleaning…" : "✨ AI clean up notes"}</button>
        </div>
      </div>

      {list.length === 0 && <p className="muted">No calls logged yet.</p>}
      {list.map((c) => (
        <div key={c.id} className="qcard">
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span className={`badge ${c.direction === "inbound" ? "gold" : "stage"}`}>{c.direction}</span>
            {c.outcome && <span className="badge stage">{c.outcome.replace(/_/g, " ")}</span>}
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>{new Date(c.created_at).toLocaleString()}</span>
          </div>
          {c.notes && <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{c.notes}</div>}
          <div className="pmeta" style={{ marginTop: 4, fontSize: 12, color: "var(--ink-soft)" }}>{c.author_name}</div>
        </div>
      ))}
    </div>
  );
}
