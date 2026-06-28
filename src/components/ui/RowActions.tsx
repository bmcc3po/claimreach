"use client";
import { useState, useRef, useEffect } from "react";

// One collapsed action menu (the ▾) replacing rows of scattered buttons.
export interface RowAction { label: string; icon?: string; onClick: () => void; danger?: boolean; }

export default function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="rowmenu" ref={ref}>
      <button className="rowmenu-trigger" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label="Actions">⋯</button>
      {open && (
        <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()}>
          {actions.map((a, i) => (
            a.label === "—" ? <div key={i} className="rowmenu-sep" /> :
            <button key={i} className={`rowmenu-item ${a.danger ? "danger" : ""}`} onClick={() => { a.onClick(); setOpen(false); }}>
              {a.icon && <span>{a.icon}</span>}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
