"use client";
import { useEffect, useState } from "react";
import { randomUpliftingLiner } from "@/lib/silver-liners";
import { randomRebuttal } from "@/lib/rebuttals";

// ============================================================================
// THE DAILY RAIL
//
// Three things an agent sees every time they land: something motivating,
// something hopeful they can hand a caller, and a rebuttal to drill.
//
// They used to be scattered — a crisis-management Silver Liner floating under
// the greeting and a quote card three screens down — which made both look
// accidental. Grouped, they read as intentional, and the rebuttal earns its
// place by being the one that actually changes what an agent says today.
// ============================================================================

export default function DailyRail() {
  const [quote, setQuote] = useState<{ q: string; a: string } | null>(null);
  const [liner] = useState(() => randomUpliftingLiner());
  const [reb] = useState(() => randomRebuttal());

  useEffect(() => {
    let alive = true;
    fetch("/api/quote").then((r) => r.json()).then((d) => { if (alive && d?.q) setQuote(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="rail">
      <style>{CSS}</style>

      <div className="rail-card quote">
        <span className="rail-tag">Today</span>
        <p className="rail-line">"{quote?.q ?? "Slow is smooth and smooth is fast."}"</p>
        <span className="rail-src">— {quote?.a ?? "old Navy saying"}</span>
      </div>

      <div className="rail-card liner">
        <span className="rail-tag">Silver Liner</span>
        <p className="rail-line">"{liner.line}"</p>
        <span className="rail-src">
          {liner.source ? `— ${liner.source} · ` : ""}for a caller who needs one
        </span>
      </div>

      <div className="rail-card reb">
        <span className="rail-tag">Rebuttal drill</span>
        <p className="rail-obj">"{reb.objection}"</p>
        <p className="rail-line">"{reb.line}"</p>
        {reb.why && <span className="rail-src">{reb.why}</span>}
      </div>
    </div>
  );
}

const CSS = `
.rail { display:grid; grid-template-columns:1fr 1fr 1.2fr; gap:12px; margin:14px 0 20px; align-items:stretch; }
@media (max-width:1000px){ .rail{ grid-template-columns:1fr; } }
.rail-card { border:1px solid var(--line); border-radius:14px; padding:14px 16px; background:var(--surface);
  display:flex; flex-direction:column; gap:6px; }
.rail-card.quote { background:#f8fafc; }
.rail-card.liner { background:#fffbeb; border-color:#fde68a; }
.rail-card.reb   { background:#eff6ff; border-color:#bfdbfe; }
.rail-tag { font-size:9.5px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint); }
.rail-card.liner .rail-tag { color:#a16207; }
.rail-card.reb .rail-tag { color:#1d4ed8; }
.rail-line { margin:0; font-size:14.5px; line-height:1.5; font-weight:600; font-style:italic; color:var(--ink); }
.rail-obj { margin:0; font-size:13px; line-height:1.45; font-weight:700; color:#1e3a8a; opacity:.75; }
.rail-src { font-size:11.5px; color:var(--ink-faint); line-height:1.45; }
`;
