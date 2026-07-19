"use client";
import { useEffect, useRef, useState } from "react";
import { stateFromText, stateName, solForState, solDeadline, SOL_DISCLAIMER } from "@/lib/reference/sol";

// ============================================================================
// Google-filled city/state input for intake. Type "Las Ve" -> pick "Las Vegas,
// NV" / "Las Vegas, NM", and store the STANDARDIZED "City, ST" so reporting can
// group on it. When the incident date is known, it also surfaces that state's
// personal-injury statute of limitations and the filing runway — a guardrail,
// clearly labeled as not legal advice.
// ============================================================================

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

export default function CityStateLookup({
  value, onChange, incidentDate,
}: {
  value: string;
  onChange: (v: string) => void;
  incidentDate?: string;
}) {
  const [q, setQ] = useState(value ?? "");
  const [hits, setHits] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => { setQ(value ?? ""); }, [value]);

  function runSearch(text: string) {
    clearTimeout(timer.current);
    if (text.trim().length < 3) { setHits([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/places", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, kind: "city" }),
        });
        const d = await r.json();
        setHits(Array.isArray(d.candidates) ? d.candidates : []);
        setOpen(true);
      } catch { setHits([]); }
      setBusy(false);
    }, 300);
  }

  function onType(v: string) { setQ(v); onChange(v); runSearch(v); }
  function pick(h: any) {
    const label = h.city_state || h.address || h.name || q;
    setQ(label); onChange(label); setHits([]); setOpen(false);
  }

  const stAbbr = stateFromText(q);
  const sol = stAbbr ? solForState(stAbbr, { mva: true }) : null;
  const dl = sol && incidentDate ? solDeadline(incidentDate, sol.years) : null;

  return (
    <div className="cs">
      <input
        className="ic-input" autoFocus autoComplete="off" spellCheck={false}
        value={q} placeholder="Start typing a city…"
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
      />
      {busy && <div className="cs-busy">Searching…</div>}
      {open && hits.length > 0 && (
        <div className="cs-hits">
          {hits.map((h, i) => (
            <button key={i} type="button" className="cs-hit" onClick={() => pick(h)}>
              {h.city_state || h.address || h.name}
            </button>
          ))}
        </div>
      )}

      {sol && (
        <div className={`cs-sol ${dl?.status ?? "ok"}`}>
          <b>
            {stateName(stAbbr!)} — {sol.years}-year personal-injury statute of limitations
            {sol.entry.mvaYears ? " (auto)" : ""}
          </b>
          {dl && (
            <span className="cs-run">
              {dl.status === "past"
                ? `⚠ Likely EXPIRED — the ${sol.years}-year deadline was ${fmtDate(dl.deadlineISO)}`
                : `≈ ${dl.daysRemaining.toLocaleString()} days left · file by ${fmtDate(dl.deadlineISO)}`}
            </span>
          )}
          {!incidentDate && <span className="cs-run muted">Capture the incident date to see the filing deadline.</span>}
          {sol.entry.note && <span className="cs-extra">{sol.entry.note}</span>}
          <span className="cs-disc">{SOL_DISCLAIMER}</span>
        </div>
      )}

      <style>{`
        .cs { position:relative; }
        .cs-busy { font-size:12px; color:var(--ink-faint); margin-top:4px; }
        .cs-hits { display:flex; flex-direction:column; margin-top:6px; border:1px solid var(--line);
          border-radius:10px; overflow:hidden; background:var(--surface); }
        .cs-hit { text-align:left; padding:11px 14px; border:0; border-bottom:1px solid var(--line);
          background:var(--surface); font:inherit; font-size:15px; cursor:pointer; color:var(--ink); }
        .cs-hit:last-child { border-bottom:0; }
        .cs-hit:hover { background:#f5f9ff; }
        .cs-sol { display:flex; flex-direction:column; gap:3px; margin-top:12px; padding:12px 14px;
          border-radius:10px; border:1px solid var(--line); background:var(--surface-2); }
        .cs-sol b { font-size:15px; }
        .cs-run { font-size:13.5px; font-weight:700; }
        .cs-run.muted { font-weight:500; color:var(--ink-soft); }
        .cs-extra { font-size:12.5px; color:var(--ink-soft); }
        .cs-disc { font-size:11px; color:var(--ink-faint); line-height:1.4; margin-top:2px; }
        .cs-sol.ok    { border-color:#bbf7d0; background:#f0fdf4; }
        .cs-sol.soon  { border-color:#fde68a; background:#fffbeb; }
        .cs-sol.urgent{ border-color:#fdba74; background:#fff7ed; }
        .cs-sol.urgent .cs-run { color:#c2410c; }
        .cs-sol.past  { border-color:#fecaca; background:#fef2f2; }
        .cs-sol.past .cs-run { color:#b91c1c; }
      `}</style>
    </div>
  );
}
