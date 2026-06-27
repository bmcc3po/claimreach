"use client";
import { useState } from "react";
import { CRISIS_SOP } from "@/lib/sop";
import { PLAYBOOK, PLAYBOOK_GROUPS } from "@/lib/playbook";

type Mode = "moment" | "learn" | "sop";

function sopGrounding() {
  return `${CRISIS_SOP.title}. ${CRISIS_SOP.intro}\n` +
    CRISIS_SOP.sections.map((s) => `${s.h}: ${s.items.join("; ")}`).join("\n") +
    `\nResources: ${CRISIS_SOP.resources.map((r) => `${r.name} = ${r.value}`).join("; ")}\n` +
    PLAYBOOK.map((t) => `${t.title}: ${t.summary}${t.do ? " DO: " + t.do.join("; ") : ""}${t.avoid ? " AVOID: " + t.avoid.join("; ") : ""}`).join("\n");
}

export default function CrisisBot({ trigger }: { trigger?: "fab" | "inline" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("moment");
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "bot"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);

  async function ask(prompt?: string) {
    const text = prompt ?? q;
    if (!text.trim()) return;
    setThread((t) => [...t, { role: "you", text }]); setQ(""); setBusy(true);
    const system = mode === "moment"
      ? `You are a calm crisis-support coach for a legal-intake agent or case manager during or right after a hard call. PRIMARY JOB: coach them on how to handle the CALLER (exact words to say, which resource to surface, when to bring in a supervisor or 988/911). SECONDARY: steady the worker themselves if they're rattled. You are NOT a counselor and must NEVER tell them to manage acute risk alone instead of connecting to professionals. Always favor 988 (crisis) or 911 (immediate danger). Be warm, brief, concrete: 2-4 things to say or do right now. Empathy not sympathy. Stabilize, don't treat. Ground everything in this doctrine:\n\n${sopGrounding()}`
      : `You are a trauma-informed training mentor for legal-intake agents and case managers. Teach practically and warmly: how to navigate hard moments, empathy vs sympathy, spotting and stopping emotional spirals, trigger signaling, DV support vs intervention, pitfalls. Use concrete examples and exact phrasing. Keep the worker-coaches-caller, professionals-handle-clinical-risk boundary. Ground in:\n\n${sopGrounding()}`;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800,
          messages: [{ role: "user", content: `${system}\n\nQUESTION: ${text}` }] }),
      });
      const data = await resp.json();
      const out = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      setThread((t) => [...t, { role: "bot", text: out || "Connect the caller to 988, stay on the line, and bring in a supervisor. If there's immediate danger, call 911." }]);
    } catch {
      setThread((t) => [...t, { role: "bot", text: "Connect the caller to 988 (call or text) and stay with them. Immediate danger: 911. Then notify a supervisor." }]);
    }
    setBusy(false);
  }

  const selectedTopic = PLAYBOOK.find((t) => t.id === topic);

  if (!open) {
    return <button className={trigger === "inline" ? "btn ghost" : "crisis-fab"} onClick={() => setOpen(true)}>🆘 {trigger === "inline" ? "Crisis support" : "Crisis"}</button>;
  }

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="modal crisis-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <strong>🆘 Crisis support</strong>
          <div className="seg-toggle" style={{ marginLeft: 16 }}>
            <button className={mode === "moment" ? "active" : ""} onClick={() => setMode("moment")}>In the moment</button>
            <button className={mode === "learn" ? "active" : ""} onClick={() => setMode("learn")}>Learn</button>
            <button className={mode === "sop" ? "active" : ""} onClick={() => setMode("sop")}>SOP</button>
          </div>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button>
        </div>

        <div className="crisis-resources">
          <span className="badge danger">911 danger</span>
          <span className="badge gold">988 call/text</span>
          <span className="badge stage">DV 800-799-7233</span>
          <span className="badge stage">Trafficking 1-888-373-7888</span>
          <span className="badge stage">Childhelp 800-422-4453</span>
        </div>

        <div className="modal-b crisis-body">
          {mode === "moment" && (
            <div>
              <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>Coaches you through the caller, and steadies you. Always favor 988/911. Not a counselor.</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {["Caller is spiraling, what do I say?", "Caller mentioned harming themselves", "I'm shaken after that call", "Caller went silent / flat", "Out-of-state caller in danger"].map((p) => (
                  <button key={p} className="chip" onClick={() => ask(p)}>{p}</button>
                ))}
              </div>
              <div className="msg-thread" style={{ maxHeight: 320 }}>
                {thread.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Tell me what's happening. I'll give you the next thing to say.</p>}
                {thread.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}><div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div></div>
                ))}
                {busy && <p className="muted">…</p>}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <input placeholder="What's happening right now?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
                <button className="btn" onClick={() => ask()} disabled={busy}>Help</button>
              </div>
            </div>
          )}

          {mode === "learn" && (
            <div className="crisis-learn">
              <div className="crisis-topics">
                {PLAYBOOK_GROUPS.map((g) => (
                  <div key={g.id} style={{ marginBottom: 10 }}>
                    <div className="section-title" style={{ marginBottom: 4 }}>{g.label}</div>
                    {PLAYBOOK.filter((t) => t.group === g.id).map((t) => (
                      <button key={t.id} className={`chip ${topic === t.id ? "active" : ""}`} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => setTopic(t.id)}>{t.title}</button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="crisis-topic-detail">
                {!selectedTopic && <p className="muted">Pick a topic, or ask anything below.</p>}
                {selectedTopic && (
                  <div>
                    <h3 style={{ marginTop: 0 }}>{selectedTopic.title}</h3>
                    <p style={{ fontSize: 14 }}>{selectedTopic.summary}</p>
                    {selectedTopic.do && (<><div className="section-title" style={{ color: "var(--ok)" }}>Do</div><ul style={{ marginTop: 4 }}>{selectedTopic.do.map((d, i) => <li key={i} style={{ marginBottom: 4, fontSize: 13.5 }}>{d}</li>)}</ul></>)}
                    {selectedTopic.avoid && (<><div className="section-title" style={{ color: "var(--danger)" }}>Avoid</div><ul style={{ marginTop: 4 }}>{selectedTopic.avoid.map((d, i) => <li key={i} style={{ marginBottom: 4, fontSize: 13.5 }}>{d}</li>)}</ul></>)}
                    <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => ask(`Give me a short practice scenario for: ${selectedTopic.title}, with a good response and why it works.`)}>Practice this →</button>
                  </div>
                )}
                {thread.length > 0 && (
                  <div className="msg-thread" style={{ maxHeight: 220, marginTop: 12 }}>
                    {thread.map((m, i) => <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}><div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div></div>)}
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <input placeholder="Ask the mentor anything…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
                  <button className="btn" onClick={() => ask()} disabled={busy}>Ask</button>
                </div>
              </div>
            </div>
          )}

          {mode === "sop" && (
            <div>
              <h3 style={{ marginTop: 0 }}>{CRISIS_SOP.title}</h3>
              <p className="muted" style={{ marginTop: 0, fontWeight: 600 }}>{CRISIS_SOP.subtitle}</p>
              <p style={{ fontSize: 13.5 }}>{CRISIS_SOP.intro}</p>
              {CRISIS_SOP.sections.map((s) => (
                <div key={s.h} style={{ marginBottom: 12 }}>
                  <div className="section-title">{s.h}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{s.items.map((it, i) => <li key={i} style={{ marginBottom: 4, fontSize: 13 }}>{it}</li>)}</ul>
                </div>
              ))}
              <div className="section-title">Key resources</div>
              {CRISIS_SOP.resources.map((r) => <div key={r.name} className="vrow"><span className="vk">{r.name}</span><span className="vv">{r.value}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
