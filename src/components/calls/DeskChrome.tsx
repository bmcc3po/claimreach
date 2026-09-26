"use client";
// The App on a computer gets the same spine as the rest of the site: a slim
// navy rail on the left (home, calls, leads, signed, queue) and a bar across the
// top with search, new call and the full site. On a phone neither is shown (the
// App's own back arrow and home screen do that job).
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

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
  const [path, setPath] = useState("");
  useEffect(() => { setPath(window.location.pathname + window.location.search); }, []);
  const agent = role === "agent";
  const links = [
    ...(!agent ? [{ href: "/dashboard", icon: "home", label: "Home" }] : []),
    { href: "/app", icon: "mobile", label: "Calls" },
    { href: "/leads", icon: "files", label: "Leads" },
    { href: "/signed", icon: "signed", label: "Signed" },
    { href: "/queue", icon: "queue", label: "My queue" },
  ];
  const on = (h: string) => h === "/app" ? (path === "/app" || (path.startsWith("/app") && !path.includes("new=1"))) : path.startsWith(h);
  const initials = (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <>
      <nav className="cd-rail" aria-label="Main menu">
        <a className="cd-mark" href={agent ? "/app" : "/dashboard"} aria-label="ClaimReach home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cr-mark.png" alt="" />
        </a>
        {links.map((l) => (
          <a key={l.href} href={l.href} className={`cd-ic${on(l.href) ? " cd-on" : ""}`} title={l.label} aria-label={l.label}>
            <Icon name={l.icon} size={19} /><span>{l.label}</span>
          </a>
        ))}
        <a className="cd-me" href="/profile" title={`${name || "You"}, profile`} aria-label="Your profile">{initials}</a>
      </nav>
      <header className="cc-chrome">
        <span className="cd-title">{path.includes("new=1") ? "New call" : "Calls"}</span>
        <div className="cc-chrome-search">
          <Icon name="search" size={16} />
          <input ref={box} type="search" placeholder="Search leads by name, phone or lead number" aria-label="Search leads"
            value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); box.current?.blur(); return; }
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
                    <span className="cc-lrow-n" style={{ fontSize: 14 }}>{r.claimant_name || "No name yet"}</span>
                    <span className="cc-lrow-s">{[fmtPhone(r.phone), r.campaign].filter(Boolean).join("   ")}</span>
                  </span>
                  <span className="cd-mono">{r.archived_at ? "Archived" : r.lead_no}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <a className="cc-chrome-new" href="/app?new=1"><Icon name="headset" size={16} />New call</a>
        {!agent && <a className="cc-chrome-link" href="/dashboard">Full site</a>}
      </header>
    </>
  );
}
