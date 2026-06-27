"use client";
import { useState, useMemo } from "react";
import { CRISIS_SOP } from "@/lib/sop";
import { BIBLE, BIBLE_GROUPS, searchBible, bibleFallback, type BibleEntry } from "@/lib/bible";
import { DISCLAIMER_SHORT, DISCLAIMER_FULL, ESCALATION_LINE, CRISSI_GUARDRAIL_PROMPT } from "@/lib/crissi-disclaimers";
import { askAI } from "@/lib/ai";
import { CrissiLogo } from "./CrissiLogo";
import { SILVER_LINERS, linersFor } from "@/lib/silver-liners";
import SilverLiners from "./SilverLiners";

type Mode = "moment" | "bible" | "liners" | "sop";


function bibleGrounding() {
  return BIBLE.map((e) =>
    `${e.title}${e.acute ? " [ACUTE]" : ""}: ${e.summary}` +
    (e.say ? ` SAY: ${e.say.join(" | ")}` : "") +
    (e.avoid ? ` AVOID: ${e.avoid.join(" | ")}` : "") +
    (e.escalate ? ` ESCALATE: ${e.escalate}` : "")
  ).join("\n");
}

export default function Crissi({ trigger = "fab" }: { trigger?: "fab" | "inline" }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<Mode>("moment");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "bot"; text: string; offline?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);

  const results = useMemo(() => searchBible(search), [search]);
  const selected = BIBLE.find((e) => e.id === topic);

  async function ask(prompt?: string) {
    const text = prompt ?? q;
    if (!text.trim()) return;
    setThread((t) => [...t, { role: "you", text }]); setQ(""); setBusy(true);

    const system = `${CRISSI_GUARDRAIL_PROMPT}\n\nYou are Crissi, a warm, calm crisis-support coach for a legal-intake agent or case manager working with trafficking survivors (who often have histories of DV, sexual assault, incest, substance use, legal-system trauma, and suicidal ideation). ${DISCLAIMER_SHORT} Coach the worker on how to handle the CALLER (exact words, which resource, when to escalate) and steady the worker too. Stay-with-them, don't-abandon. For acute risk: stay, stabilize, connect to 988 (or 911 if imminent danger), don't over-call police for mere ideation. CRITICAL: never react, gush, or perform — never say things like 'I can't believe you went through that' or 'I could never do it, you're so strong.' Don't minimize and don't glorify. Stay calm, neutral, warm, non-judgmental; you are a vehicle for the facts that get survivors justice, not a character in their story. Empathy not sympathy. Be brief and concrete: 2-5 things to say or do now. Ground in this doctrine:\n\n${bibleGrounding()}\n\nSILVER LINERS (offer warmly when it fits): ${SILVER_LINERS.flatMap((g)=>g.liners.map((l)=>l.line)).join(" | ")}`;

    const out = await askAI(system, text);
    if (out) {
      setThread((t) => [...t, { role: "bot", text: out }]);
    } else {
      // OFFLINE FALLBACK — the bible answers when Crissi/AI is down.
      const e = bibleFallback(text);
      const fb = e ? renderEntryText(e) : ESCALATION_LINE;
      setThread((t) => [...t, { role: "bot", text: fb, offline: true }]);
    }
    setBusy(false);
  }

  function renderEntryText(e: BibleEntry): string {
    let s = `${e.title}\n\n${e.summary}\n`;
    if (e.steps) s += "\n" + e.steps.map((st) => `${st.label}: ${st.detail}`).join("\n");
    if (e.say) s += "\n\nSay: " + e.say.join("  •  ");
    if (e.avoid) s += "\n\nAvoid: " + e.avoid.join("  •  ");
    if (e.escalate) s += "\n\nEscalate: " + e.escalate;
    return s;
  }

  if (!open) {
    return (
      <button className={trigger === "inline" ? "btn ghost" : "crisis-fab"} onClick={() => setOpen(true)}>
        🆘 {trigger === "inline" ? "Crissi" : "Crissi"}
      </button>
    );
  }

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className={`modal crissi-modal ${full ? "full" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h crissi-head">
          <CrissiLogo height={24} />
          <div className="seg-toggle" style={{ marginLeft: 12 }}>
            <button className={mode === "moment" ? "active" : ""} onClick={() => setMode("moment")}>In the moment</button>
            <button className={mode === "bible" ? "active" : ""} onClick={() => setMode("bible")}>The Bible</button>
            <button className={mode === "liners" ? "active" : ""} onClick={() => setMode("liners")}>Silver Liners</button>
            <button className={mode === "sop" ? "active" : ""} onClick={() => setMode("sop")}>SOP</button>
          </div>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setFull((f) => !f)}>{full ? "⤡ Shrink" : "⤢ Full window"}</button>
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
              <div className="disclaimer-bar">{DISCLAIMER_SHORT}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
                {["Caller is spiraling, what do I say?", "Caller mentioned they don't want to be here", "Caller is dissociating / going flat", "I'm shaken after that call", "Out-of-state caller in danger", "Caller is angry at me"].map((p) => (
                  <button key={p} className="chip" onClick={() => ask(p)}>{p}</button>
                ))}
              </div>
              <div className="msg-thread" style={{ maxHeight: full ? "52vh" : 300 }}>
                {thread.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Tell me what's happening. I'll give you the next thing to say, and stay with you.</p>}
                {thread.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "you" ? "mine" : ""}`}>
                    <div className="msg-bubble" style={{ whiteSpace: "pre-wrap" }}>
                      {m.offline && <span className="badge gold" style={{ marginBottom: 6, fontSize: 10 }}>📖 From the Bible (Crissi offline)</span>}
                      {m.offline && <br />}
                      {m.text}
                    </div>
                  </div>
                ))}
                {busy && <p className="muted">…</p>}
              </div>
              {q && linersFor(q).length > 0 && (
                <div className="liner-suggest">
                  <span className="muted" style={{ fontSize: 12 }}>✨ Silver Liners that might fit:</span>
                  {linersFor(q).slice(0,3).map((l,i) => <span key={i} className="badge gold" style={{ marginLeft: 6 }}>"{l.line}"</span>)}
                </div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <input placeholder="What\'s happening right now?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
                <button className="btn" onClick={() => ask()} disabled={busy}>Help</button>
              </div>
            </div>
          )}

          {mode === "bible" && (
            <div className="crisis-learn">
              <div className="crisis-topics">
                <input placeholder="Search the Bible…" value={search} onChange={(e) => { setSearch(e.target.value); }} style={{ marginBottom: 10 }} />
                {search ? (
                  <div>
                    <div className="section-title" style={{ marginBottom: 4 }}>{results.length} result{results.length === 1 ? "" : "s"}</div>
                    {results.map((t) => (
                      <button key={t.id} className={`chip ${topic === t.id ? "active" : ""}`} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => setTopic(t.id)}>
                        {t.acute && "🚨 "}{t.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  BIBLE_GROUPS.map((g) => (
                    <div key={g.id} style={{ marginBottom: 10 }}>
                      <div className="section-title" style={{ marginBottom: 4 }}>{g.label}</div>
                      {BIBLE.filter((t) => t.group === g.id).map((t) => (
                        <button key={t.id} className={`chip ${topic === t.id ? "active" : ""}`} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => setTopic(t.id)}>
                          {t.acute && "🚨 "}{t.title}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <div className="crisis-topic-detail">
                {!selected && <p className="muted">Pick a topic or search. In an emergency, the 🚨 entries are step-by-step.</p>}
                {selected && <BibleDetail e={selected} onPractice={(t) => { setMode("moment"); ask(t); }} />}
              </div>
            </div>
          )}

          {mode === "liners" && (
            <div>
              <div className="disclaimer-bar" style={{ marginBottom: 12 }}>Hopeful lines to get a caller through the call and the day — a bandage, not a fix. Use with warmth and timing, never to rush or minimize.</div>
              <SilverLiners />
            </div>
          )}

          {mode === "sop" && (
            <div>
              <div className="disclaimer-bar">{DISCLAIMER_FULL[0]} {DISCLAIMER_FULL[1]}</div>
              <h3 style={{ marginTop: 14 }}>{CRISIS_SOP.title}</h3>
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

function BibleDetail({ e, onPractice }: { e: BibleEntry; onPractice: (t: string) => void }) {
  return (
    <div>
      {e.acute && <div className="acute-banner">🚨 Acute — break glass. Stay with them. Don't abandon. {ESCALATION_LINE}</div>}
      <h3 style={{ marginTop: e.acute ? 12 : 0 }}>{e.title}</h3>
      <p style={{ fontSize: 14 }}>{e.summary}</p>

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
