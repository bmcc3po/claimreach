"use client";
import React from "react";

// Renders Crissi's reply in a scannable, color-coded way an agent can read at a
// glance mid-call. Quotes (lines the agent SAYS) become bold highlighted callouts.
// Numbered/step lines get a bold label. **bold** and *italic* are honored.
export default function CrissiMessage({ text }: { text: string }) {
  const lines = (text || "").split("\n");
  const out: React.ReactNode[] = [];
  let key = 0;

  const inline = (s: string): React.ReactNode => {
    // honor **bold** then *italic*
    const parts: React.ReactNode[] = [];
    let rest = s, k = 0;
    const re = /\*\*(.+?)\*\*|\*(.+?)\*/;
    let m;
    while ((m = re.exec(rest))) {
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      if (m[1]) parts.push(<strong key={k++}>{m[1]}</strong>);
      else if (m[2]) parts.push(<em key={k++}>{m[2]}</em>);
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) parts.push(rest);
    return parts;
  };

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { out.push(<div key={key++} style={{ height: 6 }} />); continue; }

    // Quote line = something the agent should SAY. Render as a highlighted callout.
    const q = line.match(/^\s*>\s?["“]?(.+?)["”]?\s*$/);
    if (q) {
      out.push(
        <div key={key++} className="crissi-say">
          <span className="crissi-say-tag">SAY</span>
          <span className="crissi-say-text">“{q[1].replace(/^["“]|["”]$/g, "")}”</span>
        </div>
      );
      continue;
    }

    // Numbered step: "1. **Label**" or "1. Label"
    const num = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (num) {
      out.push(
        <div key={key++} className="crissi-step">
          <span className="crissi-step-num">{num[1]}</span>
          <span className="crissi-step-body">{inline(num[2])}</span>
        </div>
      );
      continue;
    }

    // Bullet
    const bul = line.match(/^\s*[-•]\s+(.*)$/);
    if (bul) {
      out.push(<div key={key++} className="crissi-bullet">{inline(bul[1])}</div>);
      continue;
    }

    // Plain line
    out.push(<div key={key++} className="crissi-line">{inline(line)}</div>);
  }

  return <div className="crissi-msg">{out}</div>;
}
