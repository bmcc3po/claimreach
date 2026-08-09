"use client";
import { useState, useEffect, ReactNode } from "react";

// A collapsible section that remembers each user's choice (open/closed) locally,
// so Brett can collapse the progress rail while Tony keeps his open. The `id` is
// the stable key for remembering; keep it unique per panel.
export default function CollapsiblePanel({
  id, title, sub, icon, defaultOpen = true, children,
}: {
  id: string; title: string; sub?: string; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const key = `cr_panel_${id}`;
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "open") setOpen(true);
      else if (v === "closed") setOpen(false);
    } catch {}
    setReady(true);
  }, [key]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(key, next ? "open" : "closed"); } catch {}
      return next;
    });
  }

  return (
    <div className={`panel ${open ? "" : "collapsed"}`}>
      <div className="panel-head" onClick={toggle}>
        {icon && <span className="panel-icon">{icon}</span>}
        <span className="panel-title">{title}</span>
        {sub && <span className="panel-sub">{sub}</span>}
        <span className="panel-chevron">▼</span>
      </div>
      <div className="panel-body">{ready ? children : children}</div>
    </div>
  );
}
