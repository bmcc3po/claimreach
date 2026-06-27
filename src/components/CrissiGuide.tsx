"use client";
import { useState, useMemo } from "react";
import { BIBLE, BIBLE_GROUPS, searchBible, bibleFallback, type BibleEntry } from "@/lib/bible";
import { DISCLAIMER_SHORT, DISCLAIMER_FULL, ESCALATION_LINE, CRISSI_GUARDRAIL_PROMPT } from "@/lib/crissi-disclaimers";
import { askAI } from "@/lib/ai";
import { CrissiLogo } from "./CrissiLogo";
import { SILVER_LINERS } from "@/lib/silver-liners";
import SilverLiners from "./SilverLiners";

// Full-page Crissi — the whole Bible as a searchable guide, plus in-the-moment chat.
export default function CrissiGuide() {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<string | null>(BIBLE[0].id);
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "bot"; text: string; offline?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const results = useMemo(() => searchBible(search), [search]);
  const selected = BIBLE.find((e) => e.id === topic);

  function bibleGrounding() {
    return BIBLE.map((e) => `${e.title}${e.acute ? " [ACUTE]" : ""}: ${e.summary}${e.say ? " SAY: " + e.say.join(" | ") : ""}${e.escalate ? " ESCALATE: " + e.escalate : ""}`).join("\n") + "\n\nSILVER LINERS (hopeful one-liners to offer with warmth when it fits): " + SILVER_LINERS.flatMap((g) => g.liners.map((l) => l.line)).join(" | ");
  }
  async function ask(prompt?: string) {
    const text = prompt ?? q; if (!text.trim()) return;
    setThread((t) => [...t, { role: "you", text }]); setQ(""); setBusy(true);
    const system = `${CRISSI_GUARDRAIL_PROMPT}\n\nYou are Crissi, a warm crisis-support coach for legal-intake staff working with trafficking survivors. ${DISCLAIMER_SHORT} Coach the worker on handling the caller and steady them. Stay-with-them. Acute risk: connect to 988 (911 if imminent), don't over-call police for ideation. CRITICAL: never react, gush, or perform (never 'I can't believe you went through that' or 'I could never do it, you're so strong'); don't minimize or glorify; stay calm, neutral, warm, non-judgmental — a vehicle for the facts that get survivors justice, not a character in their story. Brief, concrete. Ground in:\n\n${bibleGrounding()}`;
    const out = await askAI(system, text);
    if (out) setThread((t) => [...t, { role: "bot", text: out }]);
    else { const e = bibleFallback(text); setThread((t) => [...t, { role: "bot", text: e ? entryText(e) : ESCALATION_LINE, offline: true }]); }
    setBusy(false);
  }
  function entryText(e: BibleEntry) {
    let s = `${e.title}\n\n${e.summary}`;
    if (e.steps) s += "\n\n" + e.steps.map((st) => `${st.label}: ${st.detail}`).join("\n");
    if (e.say) s += "\n\nSay: " + e.say.join("  •  ");
    return s;
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
<CrissiLogo height={38} />
        <span className="badge gold" style={{ marginLeft: 8 }}>Crisis support & trauma-informed guide</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Your empathic playbook and in-the-moment coach. Stabilize, connect, escalate.</p>
      <div className="disclaimer-bar" style={{ marginBottom: 14 }}>{DISCLAIMER_SHORT}</div>

      <div className="crissi-guide">
        <div className="crissi-guide-nav">
          <input placeholder="Search the Bible…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
          {(search ? results : BIBLE).length === 0 && <p className="muted" style={{ fontSize: 13 }}>No matches.</p>}
          {search ? (
            results.map((t) => <button key={t.id} className={`chip ${topic === t.id ? "active" : ""}`} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => setTopic(t.id)}>{t.acute && "🚨 "}{t.title}</button>)
          ) : (
            BIBLE_GROUPS.map((g) => (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 4 }}>{g.label}</div>
                {BIBLE.filter((t) => t.group === g.id).map((t) => (
                  <button key={t.id} className={`chip ${topic === t.id ? "active" : ""}`} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => setTopic(t.id)}>{t.acute && "🚨 "}{t.title}</button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="crissi-guide-main">
          {selected && <BibleDetail e={selected} onPractice={(t) => ask(t)} />}
          {thread.length > 0 && (
            <div className="card" style={{ padding: 14, marginTop: 16 }}>
              <div className="section-title">Crissi</div>
              <div className="msg-thread" style={{ maxHeight: 320 }}>
                {thread.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}>
                    <div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.offline && <span className="badge gold" style={{ fontSize: 10, marginBottom: 6, display: "inline-block" }}>📖 From the Bible (Crissi offline)</span>}{m.offline && <br />}{m.text}</div>
                  </div>
                ))}
                {busy && <p className="muted">…</p>}
              </div>
            </div>
          )}
          <div className="card" style={{ padding: 18, marginTop: 16 }}>
            <div className="row"><h3 style={{ margin: 0 }}>✨ Silver Liners</h3><span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>hopeful lines to get them through the call and the day — a bandage, not a fix</span></div>
            <div style={{ marginTop: 12 }}><SilverLiners /></div>
          </div>
          <div className="card" style={{ padding: 14, marginTop: 16 }}>
            <div className="section-title">Ask Crissi anything</div>
            <div className="row" style={{ gap: 8 }}>
              <input placeholder="e.g. caller just said they don't want to be here" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
              <button className="btn" onClick={() => ask()} disabled={busy}>Ask</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BibleDetail({ e, onPractice }: { e: BibleEntry; onPractice: (t: string) => void }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      {e.acute && <div className="acute-banner">🚨 Acute — break glass. Stay with them. Don't abandon. {ESCALATION_LINE}</div>}
      <h2 style={{ marginTop: e.acute ? 12 : 0 }}>{e.title}</h2>
      <p style={{ fontSize: 14.5 }}>{e.summary}</p>
      {e.whatYouMightHear && (<><div className="section-title">What you might hear</div><ul className="bible-list">{e.whatYouMightHear.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.steps && (<><div className="section-title">Step by step</div>{e.steps.map((s, i) => <div key={i} className="bible-step"><strong>{s.label}</strong><span>{s.detail}</span></div>)}</>)}
      {e.say && (<><div className="section-title" style={{ color: "var(--ok)" }}>Say</div><ul className="bible-list">{e.say.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.avoid && (<><div className="section-title" style={{ color: "var(--danger)" }}>Avoid</div><ul className="bible-list">{e.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.whatToListenFor && (<><div className="section-title">What to listen for</div><ul className="bible-list">{e.whatToListenFor.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.pitfalls && (<><div className="section-title" style={{ color: "var(--flag)" }}>Pitfalls</div><ul className="bible-list">{e.pitfalls.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.why && (<><div className="section-title">Why this works</div><p style={{ fontSize: 13.5 }}>{e.why}</p></>)}
      {e.hardLines && (<div className="hardlines"><div className="section-title" style={{ color: "var(--danger)" }}>Lines you cannot cross</div><ul className="bible-list">{e.hardLines.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
      {e.escalate && <div className="escalate-line">↗ {e.escalate}</div>}
      <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => onPractice(`Give me a short practice scenario for: ${e.title}, with a good response and why it works.`)}>Practice this with Crissi →</button>
    </div>
  );
}
