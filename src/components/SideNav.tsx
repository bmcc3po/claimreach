"use client";
import { useState } from "react";
import { Logo } from "./Logo";
import Crissi from "./Crissi";

const STAFF_NAV = [
  { href: "/dashboard", icon: "🏠", label: "Home" },
  { href: "/leads", icon: "📁", label: "Leads" },
  { href: "/intake", icon: "➕", label: "Add lead" },
  { href: "/queue", icon: "📞", label: "My Queue" },
  { href: "/reports", icon: "📊", label: "Reports" },
  { href: "/team", icon: "👥", label: "Team" },
  { href: "/maverick", icon: "⚡", label: "Grievous" },
  { href: "/crissi", icon: "🆘", label: "Crissi" },
  { href: "/settings", icon: "⚙️", label: "Settings" },
  { href: "/profile", icon: "👤", label: "Profile" },
];

const FIRM_NAV = [
  { href: "/portal", icon: "🏠", label: "Home" },
  { href: "/portal/cases", icon: "📁", label: "Cases" },
  { href: "/portal/reports", icon: "📊", label: "Reports" },
  { href: "/portal/resources", icon: "🧰", label: "Resources" },
  { href: "/portal/sop", icon: "📘", label: "SOP" },
  { href: "/portal/crissi", icon: "🆘", label: "Crissi" },
  { href: "/portal/profile", icon: "👤", label: "Profile" },
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
  const NAV = variant === "firm" ? FIRM_NAV : STAFF_NAV;
  const homeHref = variant === "firm" ? "/portal" : "/dashboard";

  return (
    <div className="shell">
      <aside className={`sidenav ${min ? "min" : ""}`}>
        <div className="brandrow">
          <a href={homeHref} aria-label="Home" style={{ lineHeight: 0 }}>
            <Logo height={min ? 30 : 32} wordmark={!min} onDark />
          </a>
        </div>
        <nav className="navlinks">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`nl ${active === n.href ? "active" : ""}`}>
              <span className="ico">{n.icon}</span>
              <span className="nl-label">{n.label}</span>
            </a>
          ))}
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

      <Crissi trigger="fab" />
    </div>
  );
}
