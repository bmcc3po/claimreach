"use client";
import { useState } from "react";
import { bibleFallback, type BibleEntry } from "@/lib/bible";
import { ESCALATION_LINE } from "@/lib/crissi-disclaimers";
import { M6_CRISSI_CHIPS } from "@/lib/m6-cadence";

export type M6CrissiFile = {
  id: string;
  name: string;
  leadNo: string | null;
  commsMonitored?: boolean;
};
import CrissiMessage from "@/components/CrissiMessage";

function renderEntryText(e: BibleEntry): string {
  let s = `${e.title}\n\n${e.summary}\n`;
  if (e.steps) s += "\n" + e.steps.map((st) => `${st.label}: ${st.detail}`).join("\n");
  if (e.say) s += "\n\nSay: " + e.say.join("  •  ");
  if (e.avoid) s += "\n\nAvoid: " + e.avoid.join("  •  ");
  if (e.escalate) s += "\n\nEscalate: " + e.escalate;
  return s;
}

export default function M6CrissiChat({ file }: { file: M6CrissiFile | null }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<{ role: "you" | "bot"; text: string; offline?: boolean }[]>([]);

  async function ask(prompt?: string) {
    const text = (prompt ?? q).trim();
    if (!text) return;
    setThread((t) => [...t, { role: "you", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/m6/crissi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lead_id: file?.id || null }),
      });
      const d = await r.json().catch(() => ({}));
      const out = typeof d.answer === "string" ? d.answer : "";
      if (out) {
        setThread((t) => [...t, { role: "bot", text: out }]);
      } else {
        const e = bibleFallback(text);
        const fb = e ? renderEntryText(e) : ESCALATION_LINE;
        setThread((t) => [...t, { role: "bot", text: fb, offline: true }]);
      }
    } catch {
      const e = bibleFallback(text);
      setThread((t) => [...t, { role: "bot", text: e ? renderEntryText(e) : ESCALATION_LINE, offline: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="m6-card m6-crissi-live">
      <div className="m6-card-head">
        <h2>Crissi</h2>
        {file && (
          <span className="m6-row-tag">
            {file.name}{file.leadNo ? ` · ${file.leadNo}` : ""}
          </span>
        )}
      </div>
      <p className="m6-hint">
        Motel 6 / trafficking-survivor words. Stay on the line. 988 or 911 if they are in danger.
        {file?.commsMonitored ? " This file may be monitored — no case subject." : ""}
      </p>
      <div className="m6-chips">
        {M6_CRISSI_CHIPS.map((c) => (
          <button key={c} type="button" className="m6-chip" onClick={() => void ask(c)}>{c}</button>
        ))}
      </div>
      <div className="m6-crissi-thread">
        {thread.length === 0 && (
          <p className="m6-empty">
            {file
              ? `You are with ${file.name}. Tell me what is happening on this call.`
              : "Tell me what is happening. I will give you the next thing to say."}
          </p>
        )}
        {thread.map((m, i) => (
          <div key={i} className={`m6-bubble ${m.role === "you" ? "mine" : "bot"}`}>
            {m.offline && <span className="m6-row-tag">From the Bible — Crissi is offline</span>}
            {m.role === "bot" ? <CrissiMessage text={m.text} /> : m.text}
          </div>
        ))}
        {busy && <p className="m6-hint">…</p>}
      </div>
      <div className="m6-crissi-ask">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask()}
          placeholder="What is happening right now?"
          aria-label="Ask Crissi"
        />
        <button type="button" className="m6-btn primary" disabled={busy} onClick={() => void ask()}>
          Ask
        </button>
      </div>
    </section>
  );
}
