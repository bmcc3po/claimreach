"use client";
import { useState } from "react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/dashboard", icon: "🏠", label: "Home" },
  { href: "/leads", icon: "📁", label: "Leads" },
  { href: "/intake", icon: "➕", label: "Add lead" },
  { href: "/queue", icon: "📞", label: "My Queue" },
  { href: "/team", icon: "👥", label: "Team" },
  { href: "/maverick", icon: "⚡", label: "Grievous" },
];

export default function SideNav({
  active, userName, role, topRight, children,
}: {
  active: string;
  userName: string;
  role: string;
  topRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [min, setMin] = useState(false);
  const [crisis, setCrisis] = useState(false);

  return (
    <div className="shell">
      <aside className={`sidenav ${min ? "min" : ""}`}>
        <div className="brandrow">
          <a href="/dashboard" aria-label="Home" style={{ lineHeight: 0 }}>
            <Logo height={min ? 34 : 40} wordmark={!min} onDark />
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

      <button className="crisis-fab" onClick={() => setCrisis(true)}>🆘 Crisis help</button>
      {crisis && <CrisisModal onClose={() => setCrisis(false)} />}
    </div>
  );
}

function CrisisModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Crisis support</h3>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <div className="modal-b">
          <p className="muted">If the claimant is in immediate danger, call 911 first.</p>
          <div className="board" style={{ marginBottom: 14 }}>
            <div className="board-body">
              <div className="post"><strong>988 Suicide &amp; Crisis Lifeline</strong><div className="pmeta">Call or text 988</div></div>
              <div className="post"><strong>National Human Trafficking Hotline</strong><div className="pmeta">1-888-373-7888 · text 233733</div></div>
              <div className="post"><strong>Internal escalation</strong><div className="pmeta">Flag a supervisor in the file and notify the floor.</div></div>
            </div>
          </div>
          <p className="muted">In-the-moment coaching bot is coming next, it will help you find the right words for a claimant in distress.</p>
        </div>
      </div>
    </div>
  );
}
