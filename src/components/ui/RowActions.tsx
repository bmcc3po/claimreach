"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";

// One collapsed action menu (the ⋯) replacing rows of scattered buttons. The
// popup is rendered fixed-position from the trigger's screen coordinates so it
// floats ABOVE the table scroll container instead of being clipped by it (which
// was causing a stray scrollbar instead of a dropdown).
export interface RowAction { label: string; icon?: string; onClick: () => void; danger?: boolean; }

export default function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onScroll() { setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    }
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); };
  }, [open]);

  useLayoutEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuW = 190;
      let left = r.right - menuW;
      if (left < 8) left = 8;
      let top = r.bottom + 4;
      if (top + 240 > window.innerHeight) top = Math.max(8, r.top - 240);
      setPos({ top, left });
    }
  }, [open]);

  return (
    <div className="rowmenu" ref={ref}>
      <button ref={btnRef} className="rowmenu-trigger" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label="Actions">⋯</button>
      {open && pos && (
        <div className="rowmenu-pop-fixed" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
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
