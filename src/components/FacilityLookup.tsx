"use client";
import { useState } from "react";

// Google-verified facility lookup for medical malpractice intake. Searches Places
// for hospitals/clinics/offices and returns the verified name + city/state.
export default function FacilityLookup({ value, cityState, onPick }: {
  value?: string; cityState?: string; onPick: (name: string, loc: string) => void;
}) {
  const [q, setQ] = useState(value ?? "");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(!!value);

  async function search() {
    if (!q.trim()) return;
    setBusy(true); setOpen(true);
    try {
      const r = await fetch("/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, kind: "facility" }) });
      const d = await r.json();
      setResults(r.ok ? (d.candidates ?? []) : []);
    } catch { setResults([]); }
    setBusy(false);
  }

  function pick(c: any) {
    const loc = c.address ?? "";
    // Extract a rough "City, ST" from the formatted address.
    const parts = (loc as string).split(",").map((s) => s.trim());
    const cs = parts.length >= 3 ? `${parts[parts.length - 3]}, ${parts[parts.length - 2].split(" ")[0]}` : loc;
    setQ(c.name); setVerified(true); setOpen(false);
    onPick(c.name, cs);
  }

  return (
    <div className="field" style={{ position: "relative" }}>
      <div className="row" style={{ gap: 8 }}>
        <input value={q} placeholder="Hospital, clinic, or office name"
          onChange={(e) => { setQ(e.target.value); setVerified(false); }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
        <button type="button" className="btn ghost" onClick={search} disabled={busy}>{busy ? "…" : "Verify"}</button>
      </div>
      {verified && <span className="badge signed" style={{ marginTop: 6 }}>✓ Google verified{cityState ? ` · ${cityState}` : ""}</span>}
      {open && results.length > 0 && (
        <div className="lookup-pop">
          {results.map((c) => (
            <button type="button" key={c.place_id} className="lookup-item" onClick={() => pick(c)}>
              <strong>{c.name}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{c.address}</span>
            </button>
          ))}
        </div>
      )}
      {open && !busy && results.length === 0 && <div className="lookup-pop"><div className="lookup-item muted">No matches. You can type it manually.</div></div>}
    </div>
  );
}
