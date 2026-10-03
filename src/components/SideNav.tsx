"use client";
// The site shell: a navy side menu and a quiet top bar with search.
//
// Everyday work sits at the top of the menu with no heading. Everything else
// lives in labeled sections that fold away (click the heading); the section
// holding the page you are on always opens. Screens that exist but are not
// finished sit in "More", folded by default, so a menu never implies that
// something works when it does not.
//
// The menu can shrink to an icon rail (the button left of the page name), and
// on a phone it slides in from the left. Both choices are remembered per
// computer. Search (Ctrl K) finds any lead by name, phone or lead number.
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./ui/Icon";
import { supabaseBrowser } from "@/lib/supabase-browser";

type NavItem = { href: string; icon: string; label: string; adminOnly?: boolean; ownerOnly?: boolean; qaOnly?: boolean; staffOnly?: boolean; why?: string };
type NavGroup = { id: string; label: string | null; items: NavItem[]; staffOnly?: boolean; folded?: boolean };

const STAFF_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/dashboard", icon: "home", label: "Dashboard" },
    { href: "/leads", icon: "files", label: "Leads" },
    { href: "/signed", icon: "signed", label: "Signed" },
    { href: "/packets", icon: "files", label: "Signed packets to firm", ownerOnly: true },
    { href: "/call-activity", icon: "chart", label: "Call activity" },
    { href: "/queue", icon: "queue", label: "My queue" },
    { href: "/app/help", icon: "book", label: "Agent guides" },
    { href: "/qa", icon: "shield", label: "QA queue", qaOnly: true },
  ]},
  { id: "calls", label: "Desk", items: [
    { href: "/app", icon: "mobile", label: "ClaimReach Desk" },
    { href: "/app?new=1", icon: "headset", label: "Take a call" },
    { href: "/intake", icon: "userplus", label: "Add lead", staffOnly: true },
  ]},
  { id: "ai", label: "AI tools", items: [
    { href: "/crissi", icon: "life", label: "Crissi", why: "Live answers need the AI relay up." },
    { href: "/maverick", icon: "spark", label: "Maverick", why: "Coaching needs the AI relay." },
  ]},
  { id: "admin", label: "Admin", staffOnly: true, items: [
    { href: "/team", icon: "people", label: "Team", staffOnly: true },
    { href: "/users", icon: "user", label: "Users", adminOnly: true },
    { href: "/firms", icon: "building", label: "Firms", adminOnly: true },
    { href: "/templates", icon: "layout", label: "Templates", adminOnly: true },
    { href: "/integrations", icon: "plug", label: "Integrations", adminOnly: true, why: "Timed automations (drips, delayed steps) do not run yet." },
    { href: "/settings", icon: "gear", label: "Settings", staffOnly: true },
  ]},
  // Screens that exist but are not doing the job their label implies. Kept
  // reachable, folded away so they cannot be mistaken for finished.
  { id: "more", label: "More", staffOnly: true, folded: true, items: [
    { href: "/reports", icon: "chart", label: "Reports", why: "Reads live data. Saved views and scheduled sends are not built." },
    { href: "/board", icon: "chart", label: "Delivery Board", why: "Nothing feeds the clocks yet." },
    { href: "/grievous", icon: "shield", label: "Grievous", why: "The QA pipeline runs outside the app." },
  ]},
];

const PILOT_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/dashboard", icon: "home", label: "Dashboard" },
    { href: "/queue", icon: "queue", label: "My queue" },
    { href: "/app/help", icon: "book", label: "Agent guides" },
  ]},
  { id: "calls", label: "Desk", items: [
    { href: "/app", icon: "mobile", label: "ClaimReach Desk" },
    { href: "/app?new=1", icon: "headset", label: "Take a call" },
  ]},
];

const FIRM_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/portal", icon: "home", label: "Home" },
    { href: "/portal/cases", icon: "files", label: "Cases" },
    { href: "/portal/reports", icon: "chart", label: "Reports" },
  ]},
  { id: "resources", label: "Resources", items: [
    { href: "/portal/resources", icon: "toolbox", label: "Resources" },
    { href: "/portal/sop", icon: "book", label: "SOP" },
    { href: "/portal/crissi", icon: "life", label: "Crissi" },
  ]},
];

// Role titles as people say them. The owner account is the Operator.
const ROLE_TITLE: Record<string, string> = { owner: "Operator", admin: "Admin", manager: "Manager", qa: "QA", agent: "Agent" };

function navMatch(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (href.includes("?")) return false;
  if (pathname === path) return true;
  return path !== "/" && pathname.startsWith(path + "/");
}
function bestHref(pathname: string, hrefs: string[]) {
  const m = hrefs.filter((h) => navMatch(pathname, h));
  m.sort((a, b) => b.length - a.length);
  return m[0] ?? "";
}
const initials = (name: string) => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const fmtPhone = (raw?: string | null) => {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
};
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export default function SideNav({
  userName, role, topRight, children, variant = "staff",
}: {
  userName: string;
  role: string;
  topRight?: React.ReactNode;
  children?: React.ReactNode;
  variant?: "staff" | "firm";
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const isFirm = variant === "firm";
  const pilot = !isFirm && role !== "owner";
  const GROUPS = isFirm ? FIRM_GROUPS : pilot ? PILOT_GROUPS : STAFF_GROUPS;
  const homeHref = isFirm ? "/portal" : "/dashboard";
  const allItems = GROUPS.flatMap((g) => g.items);
  const current = bestHref(pathname, allItems.map((n) => n.href));
  const currentLabel = allItems.find((n) => n.href === current)?.label ?? "";

  const [min, setMin] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [closed, setClosed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of GROUPS) if (g.folded) init[g.id] = true;
    return init;
  });

  // Remembered choices load after the first paint so the server and the
  // browser draw the same menu first.
  useEffect(() => {
    if (read("cr-nav-min") === "1") setMin(true);
    try {
      const saved = JSON.parse(read("cr-nav-closed") || "null");
      if (saved && typeof saved === "object") setClosed((c) => ({ ...c, ...saved }));
    } catch { /* ignore */ }
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);
  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);

  const toggleGroup = (id: string) => setClosed((c) => { const n = { ...c, [id]: !c[id] }; write("cr-nav-closed", JSON.stringify(n)); return n; });
  const toggleMin = () => setMin((m) => { write("cr-nav-min", m ? "0" : "1"); return !m; });
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    write("cr-theme", next);
  };
  async function signOut() {
    try { await supabaseBrowser().auth.signOut(); } finally { router.push(isFirm ? "/firm-login" : "/login"); }
  }

  const allowed = (n: NavItem) => {
    if (n.ownerOnly && role !== "owner") return false;
    if (n.adminOnly && !["owner", "admin"].includes(role)) return false;
    if (n.qaOnly && !["owner", "admin", "manager", "qa"].includes(role)) return false;
    if (n.staffOnly && role === "agent") return false;
    return true;
  };
  const roleTitle = isFirm ? role : (ROLE_TITLE[role] ?? role);

  return (
    <div className={`cl-shell${min ? " cl-min" : ""}${open ? " cl-open" : ""}`}>
      <aside className="cl-side" aria-label="Main menu">
        <a className="cl-brand" href={homeHref} aria-label="ClaimReach home">
          <span className="cl-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cr-mark.png" alt="" />
          </span>
          <span className="cl-word">Claim<b>Reach</b></span>
        </a>
        <nav className="cl-nav">
          {GROUPS.filter((g) => !(g.staffOnly && (isFirm || role === "agent"))).map((g) => {
            const items = g.items.filter(allowed);
            if (!items.length) return null;
            const holdsCurrent = items.some((n) => n.href === current);
            const isClosed = !!g.label && !!closed[g.id] && !holdsCurrent && !min;
            return (
              <div key={g.id} className="cl-sec">
                {g.label && (
                  <button className={`cl-sec-h${isClosed ? " cl-closed" : ""}`} onClick={() => toggleGroup(g.id)} aria-expanded={!isClosed}>
                    <span>{g.label}</span>
                    <Icon name="chevron" size={14} />
                  </button>
                )}
                {!isClosed && items.map((n) => (
                  <a key={n.href} href={n.href} className={`cl-nl${current === n.href ? " cl-on" : ""}`}
                    title={n.why ? `${n.label}. ${n.why}` : n.label} aria-current={current === n.href ? "page" : undefined}>
                    <span className="cl-ico"><Icon name={n.icon} /></span>
                    <span className="cl-nl-l">{n.label}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="cl-side-foot">
          {menu && (
            <div className="cl-menu" role="menu">
              <a role="menuitem" href={isFirm ? "/portal/profile" : "/profile"}><Icon name="user" size={16} />Profile</a>
              <button role="menuitem" onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} size={16} />{theme === "light" ? "Dark mode" : "Light mode"}</button>
              {!isFirm && <a role="menuitem" href="/app"><Icon name="mobile" size={16} />ClaimReach Desk</a>}
              <div className="cl-menu-sep" />
              <button role="menuitem" onClick={signOut}><Icon name="logout" size={16} />Sign out</button>
            </div>
          )}
          <button className="cl-me-b" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Your account">
            <span className="cl-av">{initials(userName)}</span>
            <span className="cl-me-t"><span className="cl-me-n">{userName}</span><span className="cl-me-r">{roleTitle}</span></span>
            <Icon name="updown" size={14} />
          </button>
        </div>
      </aside>
      <div className="cl-scrim" onClick={() => setOpen(false)} />

      <div className="cl-main">
        <header className="cl-top">
          <button className="cl-iconbtn cl-burger" onClick={() => setOpen((o) => !o)} aria-label="Open the menu"><Icon name="menu" size={20} /></button>
          <button className="cl-iconbtn cl-collapse" onClick={toggleMin} aria-label={min ? "Show the full menu" : "Shrink the menu"} title={min ? "Show the full menu" : "Shrink the menu"}><Icon name="sidebar" size={18} /></button>
          <span className="cl-crumb">{currentLabel}</span>
          {!isFirm ? <LeadSearch basePath={pilot ? "/app" : "/leads"} /> : <span style={{ flex: 1 }} />}
          <div className="cl-top-r">
            {!isFirm && role !== "firm" && (
              <a className="cl-btn cl-gold" href="/app?new=1"><Icon name="headset" size={16} /><span className="cl-hide-sm">CREATE NEW LEAD</span></a>
            )}
            {topRight}
          </div>
        </header>
        <main className="cl-body">{children}</main>
      </div>
    </div>
  );
}

function LeadSearch({ basePath }: { basePath: "/app" | "/leads" }) {
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
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); box.current?.focus(); box.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: any) => { window.location.href = `${basePath}/${encodeURIComponent(r.lead_no || r.id)}`; };
  return (
    <div className="cl-search">
      <Icon name="search" size={16} />
      <input ref={box} type="search" placeholder="Search leads by name, phone or lead number" aria-label="Search leads"
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); box.current?.blur(); return; }
          if (!hits?.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
        }} />
      <span className="cl-kbd">Ctrl K</span>
      {open && hits && (
        <div className="cl-hits" role="listbox" aria-label="Matching leads">
          {hits.length === 0 && <div className="cl-hit-empty">Nothing matches that.</div>}
          {hits.slice(0, 10).map((r, i) => (
            <button key={r.id} role="option" aria-selected={i === sel} className={`cl-hit${i === sel ? " cl-on" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} onMouseEnter={() => setSel(i)}>
              <span style={{ minWidth: 0 }}>
                <span className="cl-hit-n">{r.claimant_name || "No name yet"}</span>
                <span className="cl-hit-s" style={{ display: "block" }}>{[fmtPhone(r.phone), r.campaign].filter(Boolean).join("   ")}</span>
              </span>
              <span className="cl-mono">{r.archived_at ? "Archived" : r.lead_no}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
