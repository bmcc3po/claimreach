"use client";
import { useState } from "react";
import { Logo } from "./Logo";
import Icon from "./ui/Icon";

type NavItem = { href: string; icon: string; label: string; adminOnly?: boolean };
type NavGroup = { id: string; label: string | null; items: NavItem[] };

const STAFF_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/dashboard", icon: "home", label: "Home" },
    { href: "/leads", icon: "files", label: "Leads" },
    { href: "/intake", icon: "plus", label: "Add lead" },
    { href: "/queue", icon: "phone", label: "My queue" },
    { href: "/reports", icon: "chart", label: "Reports" },
  ]},
  { id: "ai", label: "AI tools", items: [
    { href: "/crissi", icon: "life", label: "Crissi" },
    { href: "/maverick", icon: "spark", label: "Maverick" },
    { href: "/grievous", icon: "shield", label: "Grievous" },
  ]},
  { id: "admin", label: "Settings", items: [
    { href: "/team", icon: "people", label: "Team" },
    { href: "/users", icon: "user", label: "Users", adminOnly: true },
    { href: "/templates", icon: "layout", label: "Intake templates", adminOnly: true },
    { href: "/forms", icon: "puzzle", label: "Form builder", adminOnly: true },
    { href: "/integrations", icon: "plug", label: "Integrations", adminOnly: true },
    { href: "/settings", icon: "gear", label: "Settings" },
    { href: "/profile", icon: "user", label: "Profile" },
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
  { id: "account", label: "Account", items: [
    { href: "/portal/profile", icon: "user", label: "Profile" },
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const GROUPS = variant === "firm" ? FIRM_GROUPS : STAFF_GROUPS;
  const homeHref = variant === "firm" ? "/portal" : "/dashboard";
  const toggleGroup = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="shell">
      <aside className={`sidenav ${min ? "min" : ""}`}>
        <div className="brandrow">
          <a href={homeHref} aria-label="Home" style={{ lineHeight: 0 }}>
            <Logo height={min ? 30 : 32} wordmark={!min} onDark />
          </a>
        </div>
        <nav className="navlinks">
          {GROUPS.map((g) => {
            const items = g.items.filter((n) => !n.adminOnly || ["owner", "admin"].includes(role));
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
                  <a key={n.href} href={n.href} className={`nl ${active === n.href ? "active" : ""}`} title={n.label}>
                    <span className="ico"><Icon name={n.icon} /></span>
                    <span className="nl-label">{n.label}</span>
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
        </div>
      </aside>

      <div className="shell-main">
        <div className="topstrip">
          <button className="minbtn" onClick={() => setMin(!min)} aria-label="Toggle menu" style={{ fontSize: 18 }}>☰</button>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13 }}>{userName} · {role}</span>
          {topRight}
        </div>
        <div className="shell-body">{children}</div>
      </div>
    </div>
  );
}
