"use client";
import { useState } from "react";

const CATEGORIES = [
  { id: "police", label: "Police", icon: "🚓" },
  { id: "fire", label: "Fire / EMS", icon: "🚒" },
  { id: "hospital", label: "Hospital", icon: "🏥" },
  { id: "addiction", label: "Addiction recovery", icon: "🫶" },
  { id: "dv", label: "Domestic violence", icon: "🛡️" },
  { id: "shelter", label: "Shelter", icon: "🏠" },
  { id: "mental", label: "Mental health", icon: "🧠" },
  { id: "trafficking", label: "Trafficking services", icon: "💛" },
];

export default function ResourceFinder({ defaultAddress = "" }: { defaultAddress?: string }) {
  const [near, setNear] = useState(defaultAddress);
  const [cat, setCat] = useState("police");
  const [results, setResults] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState({ name: "", phone: "", address: "" });

  async function search(category = cat) {
    if (!near.trim()) return;
    setCat(category); setLoading(true);
    const r = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, near }) });
    const d = await r.json();
    setResults(r.ok ? (d.results ?? []) : []); setLoading(false);
  }
  function star(item: any) { setSaved((s) => s.find((x) => x.place_id === item.place_id) ? s : [...s, { ...item, category: cat }]); }
  function addCustom() {
    if (!custom.name.trim()) return;
    setSaved((s) => [...s, { ...custom, place_id: `custom-${Date.now()}`, category: "custom" }]);
    setCustom({ name: "", phone: "", address: "" });
  }

  return (
    <div className="lead-grid">
      <div>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <label>Client address or city</label>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <input placeholder="123 Main St, Las Vegas NV" value={near} onChange={(e) => setNear(e.target.value)} />
            <button className="btn" onClick={() => search()} disabled={loading}>{loading ? "…" : "Search"}</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? "active" : ""}`} onClick={() => search(c.id)}>{c.icon} {c.label}</button>
            ))}
          </div>
        </div>

        {results.map((r) => (
          <div key={r.place_id} className="qcard" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{r.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{r.address}</div>
              {r.phone && <div style={{ fontSize: 13, marginTop: 2 }}>{r.phone}</div>}
            </div>
            <button className="btn ghost sm" onClick={() => star(r)}>★ Save</button>
          </div>
        ))}
        {!loading && results.length === 0 && <p className="muted">Search a category to see nearby resources.</p>}
      </div>

      <div>
        <div className="side-card">
          <h3>★ Saved resources</h3>
          {saved.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Star resources to keep them handy for this area.</p>}
          {saved.map((s) => (
            <div key={s.place_id} className="vrow" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{s.phone || s.address}</span>
            </div>
          ))}
        </div>
        <div className="side-card">
          <h3>Add your own</h3>
          <input placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} style={{ marginBottom: 6 }} />
          <input placeholder="Phone" value={custom.phone} onChange={(e) => setCustom({ ...custom, phone: e.target.value })} style={{ marginBottom: 6 }} />
          <input placeholder="Address / notes" value={custom.address} onChange={(e) => setCustom({ ...custom, address: e.target.value })} style={{ marginBottom: 8 }} />
          <button className="btn ghost" onClick={addCustom}>+ Add resource</button>
        </div>
      </div>
    </div>
  );
}
