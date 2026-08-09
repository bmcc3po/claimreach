"use client";
import { useState, useEffect } from "react";

// Google-matched mailing address for the paperwork. The agent can always type
// freely (onText keeps the street line in sync), and "Find" offers standardized
// candidates that fill street, city, state, and ZIP in one tap so those three
// downstream fields are never keyed by hand.

export interface ParsedAddress { addr1: string; city: string; state: string; zip: string }

export default function AddressLookup({
  value, near, onText, onPick,
}: {
  value?: string;
  near?: string;                          // optional city/state bias
  onText: (addr1: string) => void;        // raw typing → street line only
  onPick: (a: ParsedAddress) => void;     // chosen match → all four fields
}) {
  const [q, setQ] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<any[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => { setQ(value ?? ""); }, [value]);

  async function look() {
    if (q.trim().length < 4) return;
    setBusy(true); setNote(""); setHits([]);
    try {
      const query = near && !q.toLowerCase().includes(near.toLowerCase()) ? `${q}, ${near}` : q;
      const r = await fetch("/api/places", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, kind: "address" }),
      });
      const d = await r.json();
      if (!r.ok) { setNote(d.error || "Lookup failed."); setBusy(false); return; }
      const cands = (d.candidates ?? []).filter((c: any) => c.parsed?.addr1);
      setHits(cands);
      if (!cands.length) setNote("No match. Check the number and street, or just type it in.");
    } catch { setNote("Could not reach the lookup."); }
    setBusy(false);
  }

  function choose(c: any) {
    const p: ParsedAddress = {
      addr1: c.parsed.addr1 || "", city: c.parsed.city || "",
      state: c.parsed.state || "", zip: c.parsed.zip || "",
    };
    setQ(p.addr1); setHits([]); onPick(p);
  }

  return (
    <div className="al">
      <div className="al-row">
        <input
          className="al-in"
          value={q}
          placeholder="Start the street address…"
          onChange={(e) => { setQ(e.target.value); onText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void look(); } }}
        />
        <button type="button" className="al-btn" disabled={busy || q.trim().length < 4} onClick={() => void look()}>
          {busy ? "…" : "Find"}
        </button>
      </div>
      {note && <p className="al-note">{note}</p>}
      {hits.length > 0 && (
        <div className="al-hits">
          {hits.map((c, i) => (
            <button type="button" key={i} className="al-hit" onClick={() => choose(c)}>
              <b>{c.parsed.addr1}</b>
              <span>{[c.parsed.city, c.parsed.state, c.parsed.zip].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
      <style>{`
        .al { display:block; }
        .al-row { display:flex; gap:8px; }
        .al-in { flex:1; padding:10px 12px; border:1px solid var(--line,#d7dee7); border-radius:8px;
          font:inherit; font-size:15px; background:var(--surface-2,#f8fafc); color:var(--ink,#0d1420); }
        .al-btn { padding:10px 14px; border-radius:8px; border:1px solid #0f1a2a; background:#0f1a2a;
          color:#fff; font:inherit; font-weight:700; cursor:pointer; }
        .al-btn:disabled { opacity:.4; cursor:not-allowed; }
        .al-note { font-size:12px; color:#a16207; margin:6px 0 0; }
        .al-hits { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
        .al-hit { text-align:left; padding:9px 11px; border:1px solid var(--line,#d7dee7); border-radius:8px;
          background:#fff; cursor:pointer; display:flex; flex-direction:column; gap:2px; font:inherit; }
        .al-hit:hover { border-color:#1d4ed8; background:#f5f9ff; }
        .al-hit b { font-size:14px; }
        .al-hit span { font-size:12px; color:var(--ink-faint,#6b7a90); }
      `}</style>
    </div>
  );
}
