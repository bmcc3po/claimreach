"use client";
import { useState } from "react";
import { CRISIS_SOP } from "@/lib/sop";

// SOP-grounded crisis coach. Advises the AGENT/case manager on what to say and
// which resource to surface — never replaces 988/911, never acts as a counselor.
export default function CrisisCoach() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);

  const sopText = `${CRISIS_SOP.title}\n${CRISIS_SOP.intro}\n` +
    CRISIS_SOP.sections.map((s) => `${s.h}: ${s.items.join("; ")}`).join("\n") +
    `\nResources: ${CRISIS_SOP.resources.map((r) => `${r.name} = ${r.value}`).join("; ")}`;

  async function ask() {
    if (!q.trim()) return;
    setBusy(true); setA("");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 800,
          messages: [{ role: "user", content: `You are a calm coach for a legal-intake agent during a difficult or crisis call. You advise the AGENT on what to say and which resource to offer. You are NOT a counselor and must never tell the agent to manage the crisis themselves instead of connecting to professionals. Always favor connecting the caller to 988 (crisis) or 911 (immediate danger). Ground every answer in this SOP and do not contradict it:\n\n${sopText}\n\nThe agent asks: ${q}\n\nGive a short, practical answer: 2-4 concrete things to say or do right now, and the exact resource to surface. Keep the caller safe and connected.` }],
        }),
      });
      const data = await resp.json();
      const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      setA(text || "Connect the caller to 988 (call or text) and stay on the line. If there is immediate danger, call 911. Then notify your supervisor.");
    } catch {
      setA("Connect the caller to 988 (call or text) and stay on the line. If there is immediate danger, call 911. Then notify your supervisor.");
    }
    setBusy(false);
  }

  if (!open) {
    return <button className="btn ghost" onClick={() => setOpen(true)}>🆘 Crisis coach</button>;
  }
  return (
    <div className="card" style={{ padding: 14, marginTop: 10, borderColor: "var(--danger)" }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>🆘 Crisis coach</strong>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Coaches you, the agent. Always favor 988 / 911. Not a counselor.</p>
      <textarea rows={2} placeholder="e.g. Caller says they don't want to be here anymore. What do I say?" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn" style={{ marginTop: 8 }} onClick={ask} disabled={busy}>{busy ? "Thinking…" : "Get guidance"}</button>
      {a && <div className="script" style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 13.5 }}>{a}</div>}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span className="badge danger">911 immediate danger</span>
        <span className="badge gold">988 call/text</span>
        <span className="badge stage">DV 800-799-7233</span>
        <span className="badge stage">Trafficking 1-888-373-7888</span>
      </div>
    </div>
  );
}
