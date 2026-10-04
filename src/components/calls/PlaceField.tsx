"use client";
import { useEffect, useId, useRef, useState } from "react";
import { pickedAddress, placeText, type ParsedAddress, type PlaceCandidate } from "@/lib/place-address";

// Shared by full addresses, split mailing fields and cities. Manual entry always works.
export default function PlaceField({ kind, value, onChange, onPick, onAddress, onBlur, placeholder, label, id, near, streetOnly = false, className }: {
  kind: "address" | "city"; value: string; onChange: (text: string) => void;
  onPick?: (text: string) => void; onAddress?: (address: ParsedAddress) => void;
  onBlur?: (text: string) => void; placeholder?: string; label: string;
  id?: string; near?: string; streetOnly?: boolean; className?: string;
}) {
  const uid = useId();
  const listId = `${id || uid}-matches`;
  const [hits, setHits] = useState<PlaceCandidate[]>([]);
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const generation = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const min = kind === "city" ? 3 : 4;
  useEffect(() => {
    const q = value.trim();
    const current = ++generation.current;
    setHits([]); setActive(-1); setBusy(false); setNote("");
    if (!focus || !typed.current || q.length < min) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const completeLocation = q.includes(",") || /\b[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(q);
        const query = near && !completeLocation && !q.toLowerCase().includes(near.toLowerCase()) ? `${q}, ${near}` : q;
        const response = await fetch("/api/places", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, kind }), signal: controller.signal });
        const data = await response.json();
        if (current !== generation.current) return;
        if (!response.ok) throw new Error("lookup unavailable");
        const seen = new Set<string>();
        const rows = (Array.isArray(data.candidates) ? data.candidates : []).filter((c: PlaceCandidate) => {
          const text = placeText(c, kind, q);
          if (!placeText(c, kind, q, streetOnly) || seen.has(text)) return false;
          seen.add(text); return true;
        }).slice(0, 5);
        setHits(rows);
        if (!rows.length) setNote("No match yet. You can keep typing.");
      } catch {
        if (current === generation.current && !controller.signal.aborted) setNote("Suggestions unavailable. You can type it in.");
      } finally { if (current === generation.current) setBusy(false); }
    }, 450);
    return () => { ++generation.current; clearTimeout(timer); controller.abort(); };
  }, [value, focus, kind, near, streetOnly, min]);

  function pick(candidate: PlaceCandidate) {
    const text = placeText(candidate, kind, value, streetOnly);
    const parsed = pickedAddress(candidate, value);
    typed.current = false; ++generation.current; setHits([]); setActive(-1); setBusy(false); setNote("");
    onChange(text);
    if (parsed) onAddress?.(parsed);
    onPick?.(text);
  }
  const show = focus && hits.length > 0;
  useEffect(() => { if (show) listRef.current?.scrollIntoView({ block: "nearest" }); }, [show]);
  return <div className="cr-place">
    <input id={id} className={className || "cc-field"} type="text" autoComplete="off" placeholder={placeholder} aria-label={label}
      role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={show ? listId : undefined} aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
      value={value || ""} onChange={e => { typed.current = true; ++generation.current; setHits([]); setActive(-1); onChange(e.target.value); }}
      onFocus={() => setFocus(true)} onBlur={e => { setFocus(false); onBlur?.(e.target.value); }}
      onKeyDown={e => {
        if (e.key === "Escape") { ++generation.current; typed.current = false; setHits([]); setBusy(false); setNote(""); }
        if (show && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setActive(n => n < 0 ? (e.key === "ArrowDown" ? 0 : hits.length - 1) : (n + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length); }
        if (show && e.key === "Enter" && active >= 0) { e.preventDefault(); pick(hits[active]); }
      }} />
    {show && <div ref={listRef} id={listId} role="listbox" aria-label={`${label} matches`} className="cr-place-list">
      {hits.map((hit, i) => <button type="button" id={`${listId}-${i}`} key={hit.place_id || i} role="option" tabIndex={-1} aria-selected={i === active}
        onMouseDown={e => e.preventDefault()} onClick={() => pick(hit)}>{placeText(hit, kind, value)}</button>)}
      <small>Matches from Google</small>
    </div>}
    {focus && (busy || note) && <small className="cr-place-status" role="status">{busy ? "Finding addresses…" : note}</small>}
    <style>{`.cr-place{position:relative;min-width:0;width:100%}.cr-place>input{width:100%;box-sizing:border-box;min-width:0}.cr-place-list{margin-top:5px;border:1px solid #bdcbd5;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 5px 14px #172d4212}.cr-place-list>button{display:block!important;width:100%;border:0!important;border-bottom:1px solid #e5ebef!important;border-radius:0!important;padding:12px!important;background:white!important;color:#172d42!important;text-align:left;font:inherit;line-height:1.4;cursor:pointer;overflow-wrap:anywhere}.cr-place-list>button:hover,.cr-place-list>button[aria-selected=true]{background:#edf7f3!important}.cr-place-list>small,.cr-place-status{display:block;padding:6px 10px;color:#586b79;font-size:12px}`}</style>
  </div>;
}

