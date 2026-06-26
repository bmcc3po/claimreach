"use client";
import { useState } from "react";

export interface ResolvedProperty {
  place_id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  lat: number | null;
  lng: number | null;
  current_brand?: string;
  canonical_id?: string;
  claimant_count?: number;
}

export default function PropertyLookup({
  onResolved,
}: {
  onResolved: (p: ResolvedProperty) => void;
}) {
  const [query, setQuery] = useState("");
  const [motel6, setMotel6] = useState(true);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [dedupe, setDedupe] = useState<{ count: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setBusy(true); setErr(null); setCandidates([]); setSelected(null); setDedupe(null);
    try {
      const r = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, motel6Only: motel6 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "search failed");
      setCandidates(d.candidates || []);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function pick(c: any) {
    setSelected(c);
    // Live dedupe: does this property already have claimants?
    try {
      const r = await fetch(`/api/canonical?place_id=${encodeURIComponent(c.place_id)}`);
      const d = await r.json();
      if (d.canonical) {
        setDedupe({ count: d.canonical.claimant_count, name: d.canonical.name });
      } else {
        setDedupe(null);
      }
    } catch { setDedupe(null); }
  }

  function photoUrl(c: any) {
    if (c.photo_ref) return `/api/streetview?photo=${encodeURIComponent(c.photo_ref)}`;
    if (c.lat && c.lng) return `/api/streetview?lat=${c.lat}&lng=${c.lng}`;
    return "";
  }

  function confirm(rememberedBrand: string) {
    if (!selected) return;
    onResolved({
      place_id: selected.place_id,
      name: selected.name,
      address: selected.address,
      lat: selected.lat,
      lng: selected.lng,
      current_brand: guessBrand(selected.name),
      claimant_count: dedupe?.count ?? 0,
    });
  }

  return (
    <div className="card">
      <div className="agent-note">
        <span className="tag">Agent:</span>
        Enter cross-streets, a landmark, or city. Confirm with the building photo and Street View
        before selecting. Capture what the claimant <strong>remembers</strong> the brand as, even if
        the building shows a different flag today.
      </div>

      <div className="row">
        <input
          type="text"
          placeholder="e.g. Tropicana & Boulder Hwy, Las Vegas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button className="btn" onClick={search} disabled={busy || !query}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <label className="choice" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={motel6} onChange={(e) => setMotel6(e.target.checked)} />
        Motel 6 only (quick path)
      </label>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      <div style={{ marginTop: 12 }}>
        {candidates.map((c) => (
          <div
            key={c.place_id}
            className={`candidate ${selected?.place_id === c.place_id ? "selected" : ""}`}
          >
            {photoUrl(c) ? <img src={photoUrl(c)} alt="" /> : <div className="candidate-img" />}
            <div>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="muted">{c.address}</div>
              {c.status && c.status !== "OPERATIONAL" && (
                <span className="badge flag" style={{ marginTop: 6 }}>{c.status}</span>
              )}
            </div>
            <div>
              <button className="btn secondary" onClick={() => pick(c)}>
                {selected?.place_id === c.place_id ? "Selected" : "This one"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: 8 }}>
          {dedupe && (
            <div className="dedupe-note">
              This property already has <strong>{dedupe.count}</strong> claimant
              {dedupe.count === 1 ? "" : "s"} on file ({dedupe.name}). If this is the same building,
              selecting it links them together for the attorney's cluster view.
            </div>
          )}
          <ConfirmBrand defaultBrand={guessBrand(selected.name)} onConfirm={confirm} />
        </div>
      )}
    </div>
  );
}

function ConfirmBrand({
  defaultBrand,
  onConfirm,
}: {
  defaultBrand: string;
  onConfirm: (remembered: string) => void;
}) {
  const [remembered, setRemembered] = useState("Motel 6");
  return (
    <div className="card" style={{ marginTop: 10, background: "#fbfcfe" }}>
      <div className="field">
        <label>Brand the claimant remembers it as</label>
        <input type="text" value={remembered} onChange={(e) => setRemembered(e.target.value)} />
      </div>
      <div className="field">
        <label>Current flag (from lookup)</label>
        <input type="text" value={defaultBrand} readOnly />
      </div>
      {remembered && defaultBrand && remembered.toLowerCase() !== defaultBrand.toLowerCase() && (
        <div className="agent-note">
          <span className="tag">Flagged:</span>
          Remembered brand differs from the current flag. This is the brand-on-date case — captured
          and flagged for the attorney, not a disqualifier.
        </div>
      )}
      <button className="btn" onClick={() => onConfirm(remembered)}>
        Add this property to the case
      </button>
    </div>
  );
}

// Lightweight current-brand guess from the Places display name.
function guessBrand(name: string): string {
  const n = (name || "").toLowerCase();
  const brands = [
    "Motel 6", "Red Roof", "Super 8", "Days Inn", "Best Western", "Econo Lodge",
    "Travelodge", "Rodeway", "Quality Inn", "Comfort Inn", "Knights Inn", "Howard Johnson",
    "Extended Stay", "La Quinta", "Budget Inn", "Americas Best Value",
  ];
  for (const b of brands) if (n.includes(b.toLowerCase())) return b;
  return "";
}
