"use client";
// Type, pick the Google match. Works like the phone's own address fill: after
// a few letters the matches drop down under the field, one tap fills it. The
// agent can always ignore the list and type it all by hand. The Google key
// stays on the server (/api/places).
import { useEffect, useRef, useState } from "react";

type Kind = "address" | "city";

export default function PlaceField({ kind, value, onChange, placeholder, label }: {
  kind: Kind;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  label: string;
}) {
  const [hits, setHits] = useState<string[]>([]);
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const typed = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const last = useRef("");
  const min = kind === "city" ? 3 : 6;

  useEffect(() => {
    const q = String(value || "").trim();
    if (!focus || !typed.current || q.length < min || q === last.current) { if (q.length < min) setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      last.current = q;
      setBusy(true);
      try {
        const r = await fetch("/api/places", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, kind }) });
        const d = await r.json();
        if (!alive || !r.ok) return;
        const list: string[] = (d.candidates || [])
          .map((c: any) => kind === "city" ? String(c.city_state || "") : String(c.address || "").replace(/,\s*(USA|United States)$/i, ""))
          .filter(Boolean);
        setHits(Array.from(new Set(list)).slice(0, 5));
      } catch { /* the field still types by hand */ }
      finally { if (alive) setBusy(false); }
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [value, focus, kind, min]);

  function pick(text: string) {
    typed.current = false;
    last.current = text;
    setHits([]);
    onChange(text);
  }

  const show = focus && hits.length > 0;
  // On a phone the field can sit right above the bottom bar; bring the matches into view.
  useEffect(() => { if (show) listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [show]);
  return (
    <div className="cc-place">
      <input
        className="cc-field" type="text" autoComplete="off" placeholder={placeholder} aria-label={label}
        aria-autocomplete="list" aria-expanded={show}
        value={value ?? ""}
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 180)}
      />
      {busy && focus && !show && <div className="cc-place-busy" aria-hidden="true" />}
      {show && (
        <div ref={listRef} className="cc-place-list" role="listbox" aria-label={`${label} matches`}>
          {hits.map((h) => (
            <button key={h} type="button" role="option" aria-selected={false} className="cc-place-row"
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>
              <span>{h}</span>
            </button>
          ))}
          <div className="cc-place-foot">Matches from Google</div>
        </div>
      )}
    </div>
  );
}
