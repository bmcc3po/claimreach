"use client";
import { useEffect, useRef, useState } from "react";
import { searchVehicles } from "@/lib/reference/vehicles";
import { searchAutoCarriers, searchHealthCarriers } from "@/lib/reference/insurers";

// ============================================================================
// TYPEAHEAD
//
// Suggests the canonical value so the same carrier or vehicle is spelled one way
// every time, while still accepting anything typed. That second half matters: a
// picker an agent cannot escape gets defeated by typing the closest wrong answer,
// which is worse than free text because it looks clean.
//
// A value chosen from the list is marked as matched, so a report can tell a
// canonical answer from a hand-typed one instead of guessing.
// ============================================================================

export type RefSource = "vehicle" | "auto_carrier" | "health_carrier";

const SEARCH: Record<RefSource, (q: string, n?: number) => string[]> = {
  vehicle: searchVehicles,
  auto_carrier: searchAutoCarriers,
  health_carrier: searchHealthCarriers,
};

const PLACEHOLDER: Record<RefSource, string> = {
  vehicle: "Start typing, e.g. corv",
  auto_carrier: "Start typing the carrier",
  health_carrier: "Start typing, or 'no health insurance'",
};

export default function Typeahead({
  source, value, onChange, placeholder, autoFocus, className,
}: {
  source: RefSource;
  value: string;
  onChange: (v: string, matched: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setQ(value ?? ""); }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function type(v: string) {
    setQ(v);
    onChange(v, false);
    const h = SEARCH[source](v, 8);
    setHits(h); setHi(0); setOpen(h.length > 0);
  }

  function pick(v: string) {
    setQ(v); onChange(v, true); setOpen(false);
  }

  return (
    <div ref={box} style={{ position: "relative" }}>
      <input
        className={className ?? "gx-in"}
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder ?? PLACEHOLDER[source]}
        onChange={(e) => type(e.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(hits.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter") { e.preventDefault(); pick(hits[hi]); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <div className="ta-pop">
          {hits.map((h, i) => (
            <button key={h} type="button" className={`ta-opt ${i === hi ? "on" : ""}`}
              onMouseEnter={() => setHi(i)} onClick={() => pick(h)}>{h}</button>
          ))}
          <div className="ta-foot">Not listed? Just type it.</div>
        </div>
      )}
      <style>{`
        .ta-pop { position:absolute; z-index:40; left:0; right:0; top:calc(100% + 4px);
          background:var(--surface); border:1px solid var(--line); border-radius:10px;
          box-shadow:0 12px 28px rgba(15,26,42,.14); overflow:hidden; }
        .ta-opt { display:block; width:100%; text-align:left; padding:10px 13px; border:0;
          background:transparent; font:inherit; font-size:14.5px; cursor:pointer; color:var(--ink); }
        .ta-opt:hover, .ta-opt.on { background:#eef5ff; }
        .ta-foot { padding:7px 13px; font-size:11.5px; color:var(--ink-faint);
          border-top:1px solid var(--line); background:var(--surface-2); }
      `}</style>
    </div>
  );
}
