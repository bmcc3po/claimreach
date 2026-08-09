"use client";
import { useState, useMemo } from "react";
import { SILVER_LINERS, searchLiners } from "@/lib/silver-liners";

// Searchable, mood-categorized Silver Liner finder. Pick a category or type a
// keyword ("hope", "alone", "shame") to surface liners that fit the moment.
export default function SilverLiners({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const results = useMemo(() => {
    let r = searchLiners(q);
    if (cat !== "all") r = r.filter((x) => x.group.id === cat);
    return r;
  }, [q, cat]);

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input placeholder="Find a line for the moment — try 'hope', 'alone', 'shame', 'control'…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        {q && <button className="btn ghost sm" onClick={() => setQ("")}>Clear</button>}
      </div>
      <div className="liner-cats">
        <button className={`chip ${cat === "all" ? "active" : ""}`} onClick={() => setCat("all")}>All</button>
        {SILVER_LINERS.map((g) => (
          <button key={g.id} className={`chip ${cat === g.id ? "active" : ""}`} onClick={() => setCat(g.id)} title={g.intro}>{g.label}</button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 12, margin: "10px 0 6px" }}>{results.length} line{results.length === 1 ? "" : "s"}{cat !== "all" ? ` · ${SILVER_LINERS.find((g) => g.id === cat)?.intro}` : ""}</div>

      <div className={compact ? "" : "liner-grid"}>
        {results.map(({ group, liner }, i) => (
          <div key={i} className="liner-card">
            <div className="liner-line">{liner.framing && <span className="liner-framing">{liner.framing} </span>}"{liner.line}"</div>
            <div className="liner-meta">
              <span className="badge stage" style={{ fontSize: 10 }}>{group.label}</span>
              {liner.source && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>— {liner.source}</span>}
            </div>
            <div className="liner-when"><strong>When:</strong> {liner.when}</div>
          </div>
        ))}
        {results.length === 0 && <p className="muted">No lines match. Try a different word, or browse a category.</p>}
      </div>
    </div>
  );
}
