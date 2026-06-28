"use client";
import { useState } from "react";
import { askAI } from "@/lib/ai";

const TOPICS = [
  "How do I close on a hesitant caller?",
  "Caller says they need to ask their spouse first",
  "How do I build rapport fast?",
  "Caller is emotional, how do I keep control with warmth?",
  "How do I handle 'I need to think about it'?",
  "How do I sound confident reading the script?",
];

export default function MaverickConsole() {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "mav"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    setThread((t) => [...t, { role: "you", text }]);
    setQ(""); setBusy(true);
    const system = "You are Maverick, a sharp, supportive intake and closing COACH built on Straight Line persuasion (Belfort spine; Cardone, Voss, Miner, Ziglar on the bench). You coach the agent with warmth and practical, specific tactics, tonality, exact phrasing, next steps. Never punitive. Keep it tight and usable on a live call.";
    const a = await askAI(system, text);
    setThread((t) => [...t, { role: "mav", text: a || "Maverick is unavailable right now. Try again." }]);
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>⚡ Maverick</h1>
      <p className="muted" style={{ marginTop: 0 }}>Your closing & craft coach. Straight Line persuasion. Ask anything, get tactics you can use on the call.</p>

      <div className="mav-topics">
        {TOPICS.map((t) => <button key={t} className="chip" onClick={() => ask(t)} disabled={busy}>{t}</button>)}
      </div>

      <div className="mav-thread">
        {thread.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Pick a topic above or ask your own question below.</p>}
        {thread.map((m, i) => (
          <div key={i} className={`mav-msg ${m.role}`}>
            <div className="mav-msg-who">{m.role === "you" ? "You" : "⚡ Maverick"}</div>
            <div className="mav-msg-body" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="muted" style={{ fontSize: 13 }}>Maverick is thinking…</div>}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input placeholder="Ask Maverick…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} style={{ flex: 1 }} />
        <button className="btn" onClick={() => ask()} disabled={busy}>Ask</button>
      </div>
    </div>
  );
}
