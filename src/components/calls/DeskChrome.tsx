"use client";
// The bar across the top of the App on a computer: home, search any file, new
// call, and the full site. On a phone it is not shown (the App's own back arrow
// and home screen do that job).
import { useEffect, useRef, useState } from "react";

const fmtPhone = (raw?: string | null) => {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
};

export default function DeskChrome({ name, role }: { name: string; role: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/calls/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        if (alive) { setHits(d.results || []); setSel(0); }
      } catch { if (alive) setHits([]); }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  // Cmd/Ctrl+K jumps to search from anywhere in the App.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); box.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: any) => { window.location.href = `/app/${encodeURIComponent(r.lead_no || r.id)}`; };
  const first = (name || "").split(" ")[0];
  return (
    <header className="cc-chrome">
      <a className="cc-chrome-home" href="/app" aria-label="App home">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"></path><path d="M5 10v10h14V10"></path></svg>
        <span>Home</span>
      </a>
      <div className="cc-chrome-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
        <input ref={box} type="search" placeholder="Search leads by name, phone or lead number" aria-label="Search leads"
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={(e) => {
            if (!hits?.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
          }} />
        <kbd>Ctrl K</kbd>
        {open && hits && (
          <div className="cc-chrome-hits" role="listbox" aria-label="Matching leads">
            {hits.length === 0 && <div className="cc-cue" style={{ padding: "10px 14px", marginTop: 0 }}>Nothing matches that.</div>}
            {hits.slice(0, 12).map((r, i) => (
              <button key={r.id} role="option" aria-selected={i === sel} className={`cc-chrome-hit${i === sel ? " cc-on" : ""}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setSel(i)}>
                <span className="cc-lrow-main">
                  <span className="cc-lrow-n" style={{ fontSize: 15 }}>{r.claimant_name || "No name yet"}</span>
                  <span className="cc-lrow-s">{[fmtPhone(r.phone), r.lead_no, r.campaign].filter(Boolean).join("  ")}</span>
                </span>
                <span className="cc-lrow-t">{r.archived_at ? "Archived" : String(r.status || "").replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <a className="cc-chrome-new" href="/app?new=1">New call</a>
      {role !== "agent" && <a className="cc-chrome-link" href="/dashboard">Full site</a>}
      <span className="cc-chrome-me">{first}</span>
    </header>
  );
}
