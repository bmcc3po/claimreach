"use client";
import { useState } from "react";
import { Logo } from "./Logo";
import Icon from "./ui/Icon";
const BUILD_STAMP = "2026.07.19.1611";

// Maturity, marked in the nav so nobody has to remember which screens are real.
//
//   live     wired end to end and safe to use on a call
//   partial  works, but a piece of it is not connected yet
//   roadmap  the screen exists, the feature behind it does not
//
// Anything roadmap moves OUT of the working menus into its own section at the
// bottom. The point is that a menu should not be able to imply something works.
type Maturity = "live" | "partial" | "roadmap";
type NavItem = { href: string; icon: string; label: string; adminOnly?: boolean; qaOnly?: boolean; staffOnly?: boolean; maturity?: Maturity; why?: string };
type NavGroup = { id: string; label: string | null; items: NavItem[]; staffOnly?: boolean };

const STAFF_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/dashboard", icon: "home", label: "Home", maturity: "live" },
    { href: "/console", icon: "phone", label: "Take a call", maturity: "live" },
    { href: "/leads", icon: "files", label: "Leads", maturity: "live" },
    { href: "/signed", icon: "files", label: "Signed", maturity: "live" },
    { href: "/intake", icon: "plus", label: "Add lead", staffOnly: true, maturity: "live" },
    { href: "/queue", icon: "phone", label: "My queue", maturity: "live" },
    { href: "/qa", icon: "shield", label: "QA queue", qaOnly: true, maturity: "live" },
  ]},
  { id: "ai", label: "AI tools", items: [
    { href: "/crissi", icon: "life", label: "Crissi", maturity: "partial",
      why: "The doctrine and SOP work offline. Live answers need the AI relay up." },
    { href: "/maverick", icon: "spark", label: "Maverick", maturity: "partial",
      why: "Coaching needs the AI relay. Blank when it is down." },
  ]},
  { id: "admin", label: "Settings", items: [
    { href: "/team", icon: "people", label: "Team", staffOnly: true, maturity: "live" },
    { href: "/users", icon: "user", label: "Users", adminOnly: true, maturity: "live" },
    { href: "/firms", icon: "building", label: "Firms", adminOnly: true, maturity: "live" },
    { href: "/templates", icon: "layout", label: "Templates", adminOnly: true, maturity: "live" },
    { href: "/integrations", icon: "plug", label: "Integrations", adminOnly: true, maturity: "partial",
      why: "API keys, inbound and outbound webhooks, JustCall and e-sign setup all work. Only the timed automations (drips, delayed steps) do not run, because nothing is scheduled to drain the queue." },
    { href: "/settings", icon: "gear", label: "Settings", staffOnly: true, maturity: "live" },
    { href: "/profile", icon: "user", label: "Profile", maturity: "live" },
  ]},
  // Screens that exist but are not doing the job their label implies. Kept
  // reachable on purpose, because hiding them makes them easy to forget, but
  // out of the working menus so they cannot be mistaken for finished.
  { id: "roadmap", label: "Roadmap", staffOnly: true, items: [
    { href: "/reports", icon: "chart", label: "Reports", maturity: "roadmap",
      why: "Reads live data but the saved views and scheduled sends are not built." },
    { href: "/board", icon: "chart", label: "Delivery Board", maturity: "roadmap",
      why: "Renders, but nothing feeds the SLA clocks yet." },
    { href: "/grievous", icon: "shield", label: "Grievous", maturity: "roadmap",
      why: "The QA pipeline runs outside the app. This screen does not drive it." },
  ]},
];

const FIRM_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/portal", icon: "home", label: "Home" },
    { href: "/portal/cases", icon: "files", label: "Cases" },
    { href: "/portal/reports", icon: "chart", label: "Reports" },
  ]},
  { id: "resources", label: "Resources", items: [
    { href: "/portal/resources", icon: "toolbox", label: "Resources", maturity: "live" },
    { href: "/portal/sop", icon: "book", label: "SOP", maturity: "live" },
    { href: "/portal/crissi", icon: "life", label: "Crissi", maturity: "partial",
      why: "Doctrine works offline. Live answers need the AI relay up." },
  ]},
  { id: "account", label: "Account", items: [
    { href: "/portal/profile", icon: "user", label: "Profile", maturity: "live" },
  ]},
  { id: "roadmap", label: "Roadmap", staffOnly: true, items: [
    { href: "/portal/reports", icon: "chart", label: "Reports", maturity: "roadmap",
      why: "Reads live data. Exports and scheduled sends are not built." },
  ]},
];

export default function SideNav({
  active, userName, role, topRight, children, variant = "staff",
}: {
  active: string;
  userName: string;
  role: string;
  topRight?: React.ReactNode;
  children?: React.ReactNode;
  variant?: "staff" | "firm";
}) {
  const [min, setMin] = useState(false);
  // Mobile: the sidebar is an off-canvas drawer, closed by default, so it never
  // eats the screen. `open` controls it; on desktop the hamburger still minimizes.
  const [open, setOpen] = useState(false);
  const GROUPS = variant === "firm" ? FIRM_GROUPS : STAFF_GROUPS;
  const homeHref = variant === "firm" ? "/portal" : "/dashboard";
  // Collapse labeled groups by default; auto-expand the group containing the
  // active page so you always see where you are.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of GROUPS) {
      if (!g.label) continue; // unlabeled main group stays open
      const hasActive = g.items.some((n) => n.href === active);
      init[g.id] = !hasActive; // collapsed unless it holds the active page
    }
    return init;
  });
  const toggleGroup = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  // Hamburger: on mobile toggle the drawer; on desktop keep the minimize rail.
  const onHamburger = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches) setOpen((o) => !o);
    else setMin((m) => !m);
  };

  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className={`sidenav ${min ? "min" : ""}`}>
        <div className="brandrow">
          <a href={homeHref} aria-label="Home" style={{ lineHeight: 0 }}>
            <Logo height={min ? 30 : 32} wordmark={!min} onDark />
          </a>
        </div>
        <nav className="navlinks">
          {GROUPS.filter((g) => !g.staffOnly || role !== "agent").map((g) => {
            const items = g.items.filter((n) => {
              if (n.adminOnly && !["owner", "admin"].includes(role)) return false;
              if (n.qaOnly && !["owner", "admin", "qa"].includes(role)) return false;
              if (n.staffOnly && role === "agent") return false;
              return true;
            });
            if (items.length === 0) return null;
            const isCollapsed = collapsed[g.id];
            return (
              <div key={g.id} className="navgroup">
                {g.label && !min && (
                  <button className="navgroup-head" onClick={() => toggleGroup(g.id)}>
                    <span>{g.label}</span>
                    <span className={`navgroup-chev ${isCollapsed ? "closed" : ""}`}>⌄</span>
                  </button>
                )}
                {!isCollapsed && items.map((n) => (
                  <a key={n.href} href={n.href}
                     className={`nl ${active === n.href ? "active" : ""} ${n.maturity && n.maturity !== "live" ? "nl-" + n.maturity : ""}`}
                     title={n.why ? `${n.label}: ${n.why}` : n.label}
                     onClick={() => setOpen(false)}>
                    <span className="ico"><Icon name={n.icon} /></span>
                    <span className="nl-label">{n.label}</span>
                    {n.maturity === "partial" && <span className="nl-tag nl-tag-partial" title={n.why}>partial</span>}
                    {n.maturity === "roadmap" && <span className="nl-tag nl-tag-roadmap" title={n.why}>not wired</span>}
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="navfoot">
          <button className="minbtn" onClick={() => setMin(!min)} aria-label="Toggle menu">
            {min ? "»" : "« Minimize"}
          </button>
          {!min && <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", padding: "6px 14px 0", letterSpacing: ".04em" }}>build {BUILD_STAMP}</div>}
        </div>
      </aside>

      {open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}

      <div className="shell-main">
        <div className="topstrip">
          <button className="minbtn" onClick={onHamburger} aria-label="Toggle menu" style={{ fontSize: 18 }}>☰</button>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13 }}>{userName} · {role}</span>
          {topRight}
        </div>
        <div className="shell-body">{children}</div>
      </div>
    </div>
  );
}
