"use client";
import { useState } from "react";
import { guessBrand, isG6Property } from "@/lib/property-brand";
import { brandHistoryForYear, type BrandHistoryEntry } from "@/lib/property-tool";
import { huntQueries, openCorporatesPublicSearchUrl, OPENCORPORATES_PUBLIC_SEARCH, type HuntHit } from "@/lib/property-hunt";

type Candidate = {
  place_id: string;
  name: string;
  address: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  current_brand: string;
};

function persistG6(on: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set("g6", on ? "1" : "0");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function BrandOwner({ g6Only: g6Start = true }: { g6Only?: boolean }) {
  const [location, setLocation] = useState("");
  const [g6Only, setG6Only] = useState(g6Start);
  const [year, setYear] = useState("2014");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [recorded, setRecorded] = useState<BrandHistoryEntry | null>(null);
  const [historicalBrand, setHistoricalBrand] = useState("");
  const [llc, setLlc] = useState("");
  const [owner, setOwner] = useState("");
  const [llcAddress, setLlcAddress] = useState("");
  const [hits, setHits] = useState<HuntHit[]>([]);
  const [pickedHit, setPickedHit] = useState<string>("");
  const [huntNote, setHuntNote] = useState("");

  async function search(lock = g6Only) {
    setBusy("search"); setErr(""); setOk(""); setCandidates([]); setSelected(null); setRecorded(null);
    setHits([]); setPickedHit(""); setHuntNote("");
    try {
      const r = await fetch("/api/m6/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lock
          ? { op: "search", location, radiusMiles: 5, g6Only: true, motel6: true, studio6: true, anyChain: false }
          : { op: "search", location, radiusMiles: 5, g6Only: false, motel6: false, studio6: false, anyChain: true }),
      });
      const raw = await r.text();
      let d: any = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { setErr("Search did not finish. Try again."); return; }
      if (!r.ok) { setErr(d.error || "Search failed."); return; }
      const found = (d.candidates || []) as Candidate[];
      const next = lock ? found.filter((c) => isG6Property(c)) : found;
      setCandidates(next);
      if (!next.length) {
        setErr(lock
          ? "No Motel 6 or Studio 6 in that radius. Uncheck Only Motel 6 / G6 to see other flags."
          : "No properties in that radius. Widen the city or try another landmark.");
      }
    } catch {
      setErr("Could not reach search. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  async function pick(c: Candidate) {
    setSelected(c);
    setOk("");
    const y = Number(year);
    try {
      const r = await fetch(`/api/m6/property?place_id=${encodeURIComponent(c.place_id)}`);
      const d = await r.json().catch(() => ({}));
      const hit = brandHistoryForYear(d.history, y);
      setRecorded(hit);
      setHistoricalBrand(hit?.brand || "");
      setLlc(hit?.llc || "");
      setOwner(hit?.owner || "");
      setLlcAddress(hit?.address || "");
      setHits([]);
      setPickedHit("");
      setHuntNote("");
    } catch {
      setRecorded(null);
    }
  }

  function applyHit(h: HuntHit) {
    setPickedHit(h.id);
    if (h.brand) setHistoricalBrand(h.brand);
    if (h.llc) setLlc(h.llc);
    if (h.owner) setOwner(h.owner);
    if (h.address) setLlcAddress(h.address);
    setOk("");
    setHuntNote("Review the boxes, then save. Hunt fills. Save writes.");
  }

  async function hunt() {
    if (!selected) return;
    setBusy("hunt"); setErr(""); setOk(""); setHuntNote(""); setHits([]); setPickedHit("");
    try {
      const r = await fetch("/api/m6/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "hunt",
          place_id: selected.place_id,
          name: selected.name,
          city: selected.city,
          state: selected.state,
          year: Number(year),
        }),
      });
      const d = await r.json().catch(() => ({}));
      const next = Array.isArray(d.hits) ? (d.hits as HuntHit[]) : [];
      setHits(next);
      if (d.recorded) setRecorded(d.recorded);
      if (next[0]) applyHit(next[0]);
      const hint = typeof d.emptyMessage === "string" && d.emptyMessage.trim()
        ? d.emptyMessage
        : null;
      if (hint) setHuntNote(hint);
      else if (!next.length) {
        setHuntNote(`No filing found for this building in ${year}. You can type one if you have it.`);
      }
      if (!r.ok && r.status === 400) {
        setErr(typeof d.error === "string" && d.error ? d.error : "Hunt needs a stay year.");
      }
    } catch {
      setHuntNote("Hunt could not finish. Type the LLC if you have it.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!selected) return;
    setBusy("save"); setErr(""); setOk("");
    try {
      const r = await fetch("/api/m6/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "history",
          place_id: selected.place_id,
          name: selected.name,
          street: selected.street,
          city: selected.city,
          state: selected.state,
          zip: selected.zip,
          address: selected.address,
          current_brand: selected.current_brand || guessBrand(selected.name),
          year: Number(year),
          historical_brand: historicalBrand,
          llc, owner, llc_address: llcAddress,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setErr(d.error || "That did not save."); return; }
      setRecorded(d.recorded);
      setOk("Recorded on this building. This is desk history, not a live Secretary of State filing.");
    } catch {
      setErr("That did not save. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  const liveBrand = selected ? (selected.current_brand || guessBrand(selected.name) || "unknown today") : "";
  const huntQuery = selected
    ? (huntQueries({ name: selected.name, city: selected.city, state: selected.state })[0] || selected.name)
    : "";
  const ocPublicUrl = huntQuery
    ? openCorporatesPublicSearchUrl(huntQuery)
    : OPENCORPORATES_PUBLIC_SEARCH;

  return (
    <div className="pt pt-embed">
      <p className="m6-hint">
        Search the building as it stands today. Then Hunt looks up the LLC for that stay year. You review and save. We never invent a filing.
      </p>
      <label className="pt-field">
        <span>City or motel</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="e.g. Gary, IN" />
      </label>
      <label className="pt-field">
        <span>Stay year</span>
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2014" />
      </label>
      <label className="pt-check">
        <input
          type="checkbox"
          checked={g6Only}
          onChange={(e) => {
            const on = e.target.checked;
            setG6Only(on);
            persistG6(on);
            setSelected(null);
            setRecorded(null);
            if (location.trim()) void search(on);
            else setCandidates([]);
          }}
        />
        <span>
          <strong>Only Motel 6 / G6</strong>
          <em>Studio 6 and Motel 6 count. Other flags stay hidden.</em>
        </span>
      </label>
      <button type="button" className="pt-btn primary" disabled={!!busy || !location.trim()} onClick={() => void search()}>
        {busy === "search" ? "Searching…" : "Search"}
      </button>
      {err && <p className="pt-err">{err}</p>}
      {ok && <p className="pt-ok">{ok}</p>}

      <ul className="pt-cards">
        {candidates.map((c) => (
          <li key={c.place_id} className={selected?.place_id === c.place_id ? "on" : ""}>
            <button type="button" className="pt-card" onClick={() => void pick(c)}>
              <div className="pt-ph" />
              <div>
                <strong>{c.name}</strong>
                <span>{c.address}</span>
                <em>Live Google brand: {c.current_brand || guessBrand(c.name) || "unknown"}</em>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <section className="pt-sheet">
          <h2>This building in {year || "that year"}</h2>
          <p className="pt-sheet-name">{selected.name}</p>
          <p className="pt-muted">{selected.address}</p>
          <p className="m6-hint">Live Google (today): {liveBrand}</p>
          {recorded && (
            <p className="m6-hint">
              Already recorded for {year}: {recorded.brand || "brand not noted"}
              {recorded.llc ? ` · ${recorded.llc}` : ""}
            </p>
          )}
          <button type="button" className="pt-btn primary" disabled={!!busy || year.length !== 4} onClick={() => void hunt()}>
            {busy === "hunt" ? "Hunting…" : `Hunt for ${year || "that year"}`}
          </button>
          <a className="pt-btn" href={ocPublicUrl} target="_blank" rel="noopener noreferrer">
            Search OpenCorporates
          </a>
          {year.length === 4 && (
            <p className="m6-hint">Look for filings around {year}.</p>
          )}
          {huntNote && <p className="m6-hint">{huntNote}</p>}
          {hits.length > 0 && (
            <ul className="pt-hunt">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className={pickedHit === h.id ? "pt-hunt-card on" : "pt-hunt-card"}
                    onClick={() => applyHit(h)}
                  >
                    <strong>{h.llc || h.owner || "Named on the filing"}</strong>
                    <span>{[h.status, h.jurisdiction, h.companyNumber].filter(Boolean).join(" · ")}</span>
                    {h.address && <span>{h.address}</span>}
                    <em>{[h.sourceLabel, h.url ? h.url.replace(/^https?:\/\//, "") : ""].filter(Boolean).join(" · ")}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="pt-field">
            <span>Brand that year (recorded)</span>
            <input value={historicalBrand} onChange={(e) => setHistoricalBrand(e.target.value)} placeholder="Motel 6" />
          </label>
          <label className="pt-field">
            <span>LLC / registered owner (recorded)</span>
            <input value={llc} onChange={(e) => setLlc(e.target.value)} placeholder="Motels of Indiana LLC" />
          </label>
          <label className="pt-field">
            <span>Owner name if different (recorded)</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <label className="pt-field">
            <span>Last known address (recorded)</span>
            <input value={llcAddress} onChange={(e) => setLlcAddress(e.target.value)} placeholder="123 Happy St, Gary IN" />
          </label>
          <button type="button" className="pt-btn" disabled={!!busy} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : "Save recorded history"}
          </button>
        </section>
      )}
    </div>
  );
}
