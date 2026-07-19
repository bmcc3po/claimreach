"use client";
import { useState } from "react";

// Resolve where the crash happened and show which agency probably holds the
// report. The agency list is an inference, so it is presented as candidates the
// agent confirms with the caller, never as an answer.

export interface ResolvedIncident {
  formatted: string; route?: string; city?: string; county?: string;
  state?: string; zip?: string; lat?: number; lng?: number;
  agency?: string;
}

export default function IncidentLocation({
  value, near, onResolved,
}: {
  value?: string;
  near?: string;                        // city/state already captured
  onResolved: (r: ResolvedIncident) => void;
}) {
  const [q, setQ] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<any[]>([]);
  const [chosen, setChosen] = useState<any>(null);
  const [note, setNote] = useState("");

  async function look() {
    if (q.trim().length < 3) return;
    setBusy(true); setNote(""); setHits([]); setChosen(null);
    try {
      const r = await fetch("/api/geocode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, near }),
      });
      const d = await r.json();
      if (!r.ok) { setNote(d.error || "Lookup failed."); setBusy(false); return; }
      setHits(d.results ?? []);
      if (!d.results?.length) setNote(d.note || "No match. Try adding the cross street or the city.");
      if (d.results?.length === 1) setChosen(d.results[0]);
    } catch { setNote("Could not reach the lookup."); }
    setBusy(false);
  }

  function choose(h: any, agency?: string) {
    setChosen(h);
    onResolved({ ...h, agency });
  }

  return (
    <div className="il">
      <div className="il-row">
        <input
          className="il-in"
          value={q}
          placeholder="Intersection, mile marker, or address"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void look(); } }}
        />
        <button className="il-btn" disabled={busy || q.trim().length < 3} onClick={() => void look()}>
          {busy ? "Looking…" : "Find it"}
        </button>
      </div>
      {note && <p className="il-note">{note}</p>}

      {hits.length > 1 && !chosen && (
        <div className="il-hits">
          {hits.map((h, i) => (
            <button key={i} className="il-hit" onClick={() => choose(h)}>
              <b>{h.formatted}</b>
              <span>{[h.county, h.state].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="il-picked">
          <div className="il-addr">
            <b>{chosen.formatted}</b>
            <span>{[chosen.city, chosen.county, chosen.state].filter(Boolean).join(" · ")}</span>
          </div>

          {chosen.agencies?.length > 0 && (
            <>
              <div className="il-cap">Who likely has the report — confirm with the caller</div>
              {chosen.agencies.map((a: any, i: number) => (
                <button key={i} className="il-ag" onClick={() => choose(chosen, a.name)}>
                  <span className={`il-dot ${a.confidence}`} />
                  <span className="il-ag-body">
                    <b>{a.name}</b>
                    <em>{a.why}</em>
                  </span>
                </button>
              ))}
              <p className="il-ask">Ask them: do you remember whether it was city police, the sheriff, or a state trooper?</p>
            </>
          )}
          <button className="il-again" onClick={() => { setChosen(null); setHits([]); }}>Search again</button>
        </div>
      )}

      <style>{`
        .il { display:block; }
        .il-row { display:flex; gap:8px; }
        .il-in { flex:1; padding:11px 13px; border:1.5px solid var(--line,#d7dee7); border-radius:9px;
          font:inherit; font-size:15px; background:var(--surface-2,#f8fafc); color:var(--ink,#0d1420); }
        .il-btn { padding:11px 16px; border-radius:9px; border:1px solid #0f1a2a; background:#0f1a2a;
          color:#fff; font:inherit; font-weight:700; cursor:pointer; }
        .il-btn:disabled { opacity:.4; cursor:not-allowed; }
        .il-note { font-size:12.5px; color:#a16207; margin:8px 0 0; }
        .il-hits { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
        .il-hit { text-align:left; padding:10px 12px; border:1px solid var(--line,#d7dee7); border-radius:9px;
          background:#fff; cursor:pointer; display:flex; flex-direction:column; gap:2px; font:inherit; }
        .il-hit:hover { border-color:#1d4ed8; background:#f5f9ff; }
        .il-hit span { font-size:12px; color:var(--ink-faint,#6b7a90); }
        .il-picked { margin-top:12px; border:1px solid var(--line,#d7dee7); border-radius:11px; padding:12px 14px;
          background:var(--surface-2,#f8fafc); }
        .il-addr { display:flex; flex-direction:column; gap:2px; margin-bottom:12px; }
        .il-addr span { font-size:12.5px; color:var(--ink-faint,#6b7a90); }
        .il-cap { font-size:10.5px; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
          color:var(--ink-faint,#6b7a90); margin-bottom:7px; }
        .il-ag { display:flex; gap:10px; width:100%; text-align:left; padding:10px 12px; margin-bottom:6px;
          border:1px solid var(--line,#d7dee7); border-radius:9px; background:#fff; cursor:pointer; font:inherit; }
        .il-ag:hover { border-color:#1d4ed8; background:#f5f9ff; }
        .il-ag-body { display:flex; flex-direction:column; gap:2px; }
        .il-ag-body b { font-size:14px; }
        .il-ag-body em { font-size:12px; font-style:normal; color:var(--ink-faint,#6b7a90); line-height:1.45; }
        .il-dot { width:9px; height:9px; border-radius:99px; margin-top:5px; flex:0 0 auto; }
        .il-dot.likely { background:#16a34a; }
        .il-dot.possible { background:#d1d5db; }
        .il-ask { font-size:12.5px; font-style:italic; color:#a16207; margin:8px 0 0; }
        .il-again { margin-top:10px; background:none; border:0; color:#1d4ed8; font:inherit; font-size:12.5px;
          font-weight:700; cursor:pointer; padding:0; }
      `}</style>
    </div>
  );
}
