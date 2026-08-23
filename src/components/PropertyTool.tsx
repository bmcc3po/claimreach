"use client";
import { useEffect, useState } from "react";
import { brandsMismatch, guessBrand } from "@/lib/property-brand";
import { lawrulerPasteBlock, stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";

const RADII = [1, 5, 10, 25];
const REMEMBERED = ["Motel 6", "Studio 6", "Other"];

type Candidate = {
  place_id: string;
  name: string;
  address: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  photo_ref: string | null;
  status: string | null;
  current_brand: string;
};

export default function PropertyTool({ toolKey, leadid }: { toolKey: string; leadid: string }) {
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(5);
  const [motel6, setMotel6] = useState(true);
  const [studio6, setStudio6] = useState(true);
  const [anyChain, setAnyChain] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [remembered, setRemembered] = useState("Motel 6");
  const [rememberedOther, setRememberedOther] = useState("");
  const [stayFrom, setStayFrom] = useState("");
  const [stayTo, setStayTo] = useState("");
  const [saved, setSaved] = useState<IdentifiedProperty[]>([]);
  const [justSaved, setJustSaved] = useState<IdentifiedProperty | null>(null);
  const [copied, setCopied] = useState(false);

  const qs = `k=${encodeURIComponent(toolKey)}`;

  useEffect(() => {
    if (!leadid) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/tools/property?${qs}&leadid=${encodeURIComponent(leadid)}`);
        if (r.status === 404) return;
        const d = await r.json();
        if (!cancelled && Array.isArray(d.properties)) setSaved(d.properties);
      } catch { /* list is optional; search still works */ }
    })();
    return () => { cancelled = true; };
  }, [leadid, qs]);

  function rememberValue() {
    if (remembered === "Other") return rememberedOther.trim();
    return remembered;
  }

  async function search() {
    setBusy("search"); setErr(""); setCandidates([]); setSelected(null); setJustSaved(null);
    try {
      const r = await fetch(`/api/tools/property?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "search",
          location,
          radiusMiles: radius,
          motel6, studio6, anyChain,
        }),
      });
      if (r.status === 404) { setErr("This tool is not available."); return; }
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Search failed."); return; }
      setCandidates(d.candidates || []);
      if (!(d.candidates || []).length) setErr("No properties in that radius. Widen the circle or try Any chain.");
    } catch {
      setErr("Could not reach search. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!selected || !leadid) return;
    setBusy("save"); setErr("");
    const current = selected.current_brand || guessBrand(selected.name);
    const rememberedBrand = rememberValue();
    try {
      const r = await fetch(`/api/tools/property?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          leadid,
          place_id: selected.place_id,
          name: selected.name,
          street: selected.street,
          city: selected.city,
          state: selected.state,
          zip: selected.zip,
          address: selected.address,
          lat: selected.lat,
          lng: selected.lng,
          current_brand: current,
          remembered_brand: rememberedBrand,
          stay_from: stayFrom,
          stay_to: stayTo,
        }),
      });
      if (r.status === 404) { setErr("This tool is not available."); return; }
      const d = await r.json();
      if (!r.ok || d.error || !d.property) {
        setErr(d.error || "That did not save. Try again.");
        return;
      }
      const row = d.property as IdentifiedProperty;
      setSaved((prev) => {
        const rest = prev.filter((p) => p.id !== row.id);
        return [...rest, row];
      });
      setJustSaved(row);
      setSelected(null);
      setCopied(false);
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  async function copyPaste(p: IdentifiedProperty) {
    const text = lawrulerPasteBlock(p);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
    }
  }

  function pickChain(next: "motel6" | "studio6" | "any") {
    if (next === "any") { setAnyChain(true); setMotel6(false); setStudio6(false); return; }
    if (next === "motel6") {
      const on = !motel6;
      setMotel6(on);
      setStudio6(studio6);
      setAnyChain(!on && !studio6);
      return;
    }
    const on = !studio6;
    setStudio6(on);
    setMotel6(motel6);
    setAnyChain(!on && !motel6);
  }

  const mismatch = selected && brandsMismatch(rememberValue(), selected.current_brand || guessBrand(selected.name));
  const pasteOf = justSaved ?? null;

  return (
    <div className="pt">
      <header className="pt-head">
        <p className="pt-kicker">Property lookup</p>
        <h1>{leadid ? `File #${leadid}` : "File # —"}</h1>
        {!leadid && (
          <p className="pt-warn">Open this from the LawRuler file so the number is filled in. You can still search.</p>
        )}
      </header>

      {saved.length > 0 && (
        <section className="pt-saved">
          <h2>On this file</h2>
          <ul>
            {saved.map((p) => (
              <li key={p.id}>
                <strong>{p.name || "Property"}</strong>
                <span>{[p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(", ")}</span>
                <span>
                  {p.remembered_brand || "brand not noted"}
                  {p.brand_mismatch ? " · flag: remembered ≠ current" : ""}
                  {stayRangeLabel(p.stay_from, p.stay_to) ? ` · ${stayRangeLabel(p.stay_from, p.stay_to)}` : ""}
                </span>
                <button type="button" className="pt-copy" onClick={() => { setJustSaved(p); void copyPaste(p); }}>
                  Copy for LawRuler
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pasteOf && (
        <section className="pt-confirm">
          <p className="pt-ok">Saved. Paste this into the LawRuler property fields, then add another if you need to.</p>
          <pre>{lawrulerPasteBlock(pasteOf)}</pre>
          <button type="button" className="pt-btn primary" onClick={() => void copyPaste(pasteOf)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </section>
      )}

      <section className="pt-search">
        <label className="pt-field">
          <span>City, intersection, or landmark</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
            placeholder="e.g. Tropicana & Boulder Hwy, Las Vegas"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <div className="pt-chips" role="group" aria-label="Radius">
          {RADII.map((n) => (
            <button key={n} type="button" className={radius === n ? "on" : ""} onClick={() => setRadius(n)}>
              {n} mi
            </button>
          ))}
        </div>

        <div className="pt-chips" role="group" aria-label="Brand filter">
          <button type="button" className={!anyChain && motel6 ? "on" : ""} onClick={() => pickChain("motel6")}>
            Motel 6
          </button>
          <button type="button" className={!anyChain && studio6 ? "on" : ""} onClick={() => pickChain("studio6")}>
            Studio 6
          </button>
          <button type="button" className={anyChain ? "on" : ""} onClick={() => pickChain("any")}>
            Any chain
          </button>
        </div>

        <button
          type="button"
          className="pt-btn primary"
          disabled={!!busy || !location.trim()}
          onClick={() => void search()}
        >
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </section>

      {err && <p className="pt-err">{err}</p>}

      <ul className="pt-cards">
        {candidates.map((c) => {
          const brand = c.current_brand || guessBrand(c.name);
          const maps = c.lat && c.lng
            ? `https://maps.google.com/?q=${c.lat},${c.lng}`
            : `https://maps.google.com/?q=${encodeURIComponent(c.address || c.name)}`;
          const photo = c.photo_ref
            ? `/api/streetview?photo=${encodeURIComponent(c.photo_ref)}`
            : (c.lat && c.lng ? `/api/streetview?lat=${c.lat}&lng=${c.lng}` : "");
          const active = selected?.place_id === c.place_id;
          return (
            <li key={c.place_id} className={active ? "on" : ""}>
              <button type="button" className="pt-card" onClick={() => { setSelected(c); setJustSaved(null); }}>
                {photo ? <img src={photo} alt="" /> : <div className="pt-ph" />}
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.address}</span>
                  {brand && <em>Current brand: {brand}</em>}
                  {c.status && c.status !== "OPERATIONAL" && <em className="flag">{c.status}</em>}
                </div>
              </button>
              <a className="pt-pin" href={maps} target="_blank" rel="noreferrer" aria-label="Open in Maps">
                Pin
              </a>
            </li>
          );
        })}
      </ul>

      {selected && (
        <section className="pt-sheet">
          <h2>This one</h2>
          <p className="pt-sheet-name">{selected.name}</p>
          <p className="pt-muted">{selected.address}</p>

          <p className="pt-label">Brand they remember</p>
          <div className="pt-chips">
            {REMEMBERED.map((b) => (
              <button key={b} type="button" className={remembered === b ? "on" : ""} onClick={() => setRemembered(b)}>
                {b}
              </button>
            ))}
          </div>
          {remembered === "Other" && (
            <input
              className="pt-other"
              value={rememberedOther}
              onChange={(e) => setRememberedOther(e.target.value)}
              placeholder="Brand as remembered"
            />
          )}

          {mismatch && (
            <p className="pt-flag">
              Remembered brand differs from the current flag. That is the rebrand case — save it. Not a disqualifier.
            </p>
          )}

          <div className="pt-dates">
            <label className="pt-field">
              <span>From (month/year)</span>
              <input value={stayFrom} onChange={(e) => setStayFrom(e.target.value)} placeholder="3/2019" inputMode="numeric" />
            </label>
            <label className="pt-field">
              <span>To (month/year)</span>
              <input value={stayTo} onChange={(e) => setStayTo(e.target.value)} placeholder="11/2021" inputMode="numeric" />
            </label>
          </div>

          <button
            type="button"
            className="pt-btn primary"
            disabled={!!busy || !leadid}
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save to this file"}
          </button>
          {!leadid && <p className="pt-warn">Need a File # from LawRuler before this can save.</p>}
        </section>
      )}
    </div>
  );
}
