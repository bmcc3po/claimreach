"use client";
import { useState } from "react";
import { Logo } from "./Logo";

type NavItem = { href: string; icon: string; label: string; adminOnly?: boolean };
type NavGroup = { id: string; label: string | null; items: NavItem[] };

const STAFF_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/dashboard", icon: "🏠", label: "Home" },
    { href: "/leads", icon: "📁", label: "Leads" },
    { href: "/intake", icon: "➕", label: "Add lead" },
    { href: "/queue", icon: "📞", label: "My Queue" },
    { href: "/reports", icon: "📊", label: "Reports" },
  ]},
  { id: "ai", label: "AI", items: [
    { href: "/crissi", icon: "🆘", label: "Crissi" },
    { href: "/maverick", icon: "⚡", label: "Maverick" },
    { href: "/grievous", icon: "🛡️", label: "Grievous" },
  ]},
  { id: "admin", label: "Settings", items: [
    { href: "/team", icon: "👥", label: "Team" },
    { href: "/users", icon: "👤", label: "Users", adminOnly: true },
    { href: "/templates", icon: "🧱", label: "Intake templates", adminOnly: true },
    { href: "/forms", icon: "🧩", label: "Form builder", adminOnly: true },
    { href: "/integrations", icon: "🔌", label: "Integrations", adminOnly: true },
    { href: "/settings", icon: "⚙️", label: "Settings" },
    { href: "/profile", icon: "🙋", label: "Profile" },
  ]},
];

const FIRM_GROUPS: NavGroup[] = [
  { id: "main", label: null, items: [
    { href: "/portal", icon: "🏠", label: "Home" },
    { href: "/portal/cases", icon: "📁", label: "Cases" },
    { href: "/portal/reports", icon: "📊", label: "Reports" },
  ]},
  { id: "resources", label: "Resources", items: [
    { href: "/portal/resources", icon: "🧰", label: "Resources" },
    { href: "/portal/sop", icon: "📘", label: "SOP" },
    { href: "/portal/crissi", icon: "🆘", label: "Crissi" },
  ]},
  { id: "account", label: "Account", items: [
    { href: "/portal/profile", icon: "🙋", label: "Profile" },
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
                    <span className="ico">{n.icon}</span>
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
