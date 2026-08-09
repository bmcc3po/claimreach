"use client";
import { useState, useEffect, useRef } from "react";

// Look up a person by name/phone BEFORE starting a new file.
// Surfaces existing people and the claims they already hold (dedupe / serial-filer catch).
export default function PersonSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/person-search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResults(d.results ?? []);
        setSearched(true);
      } catch { setResults([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="side-card">
      <h3>Look up a person first</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Search by name or phone before opening a new file. Catches duplicates and serial filers.
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone…" />

      {busy && <p className="muted" style={{ marginTop: 10 }}>Searching…</p>}

      {searched && !busy && results.length === 0 && (
        <div className="paneflag info" style={{ marginTop: 12 }}>
          No existing person matches. Safe to start a new file.
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="paneflag" style={{ marginBottom: 10 }}>
            {results.length} existing {results.length === 1 ? "person" : "people"} found — check before creating a duplicate.
          </div>
          {results.map((p) => (
            <a key={p.id} href={`/leads/${p.id}`} className="post" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <strong>{p.claimant_name ?? "Unnamed"}</strong> <span className="muted">· {p.lead_no}</span>
              <div className="pmeta">{p.phone ?? "no phone"}{p.email ? ` · ${p.email}` : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {(p.claims ?? []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>no claims yet</span>}
                {(p.claims ?? []).map((c: any) => (
                  <span key={c.id} className={`badge ${c.status === "dq" ? "dq" : c.status === "signed" ? "signed" : "stage"}`}>
                    {(c.campaign || c.claim_type)} · {c.status}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
