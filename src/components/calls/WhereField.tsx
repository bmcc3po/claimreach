"use client";
// Where the wreck happened: the city (with Google matches) and the state as its
// own pick, so the state never gets left off. Stored as one value, "City, ST",
// the same value the agreement choice and the deadline light already read
// (stateCodeOf in src/lib/mva-call/state.ts), so nothing downstream changes.
// Picking a Google match like "Las Vegas, NV" fills both. A lead that only
// told the marketer the state ("Alabama") shows up with the state picked.
import { useEffect, useRef, useState } from "react";
import PlaceField from "./PlaceField";
import { SOL, stateCodeOf } from "@/lib/mva-call/state";

function split(value: string): { city: string; st: string } {
  const t = String(value || "").trim();
  if (!t) return { city: "", st: "" };
  const comma = t.lastIndexOf(",");
  if (comma >= 0) {
    const st = stateCodeOf(t) || "";
    if (st) return { city: t.slice(0, comma).trim(), st };
    // "Las Vegas," is a city with no state picked yet.
    return { city: t.slice(comma + 1).trim() ? t : t.slice(0, comma).trim(), st: "" };
  }
  const whole = SOL.find((r) => r[0] === t.toUpperCase() || r[1].toUpperCase() === t.toUpperCase());
  return whole ? { city: "", st: whole[0] } : { city: t, st: "" };
}
// A city typed with no state yet is stored with a trailing comma ("La," not
// "La"), so a half-typed city like "La" or "Me" is never read as Louisiana or
// Maine. The comma never shows; everything that reads the state ignores it.
const join = (city: string, st: string) => {
  const c = city.trim();
  if (st) return [c, st].filter(Boolean).join(", ");
  return c ? c + "," : "";
};

export default function WhereField({ value, onChange, onDone, agreement }: {
  value: string;
  onChange: (text: string) => void;
  /** A Google match or a state was picked: the row can close. Typing never closes it. */
  onDone?: () => void;
  /** What the state picks, shown under the field ("Texas", "All other states (AL/GA)"). */
  agreement?: string | null;
}) {
  const parsed = split(value);
  // The city box keeps what was typed, so a city named like a state
  // ("New York", "Washington") never gets swallowed into the state pick.
  const [city, setCity] = useState(parsed.city);
  const sent = useRef(value);
  useEffect(() => {
    if (value !== sent.current) { setCity(split(value).city); sent.current = value; }
  }, [value]);
  const emit = (out: string) => { sent.current = out; onChange(out); };
  const st = parsed.st;

  return (
    <div className="cc-where">
      <div className="cc-where-row">
        <div className="cc-where-city">
          <PlaceField kind="city" label="City" placeholder="City" value={city}
            onPick={() => onDone?.()}
            onChange={(t) => {
              const own = t.includes(",") ? split(t) : null;
              if (own && own.st) { setCity(own.city); emit(join(own.city, own.st)); }
              else { setCity(t); emit(join(t, st)); }
            }} />
        </div>
        <select className={`cc-field cc-where-st${st ? "" : " cc-where-need"}`} aria-label="State" value={st}
          onChange={(e) => { emit(join(city, e.target.value)); if (e.target.value) onDone?.(); }}>
          <option value="">State</option>
          {SOL.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>
      <div className="cc-cue" style={{ marginTop: 6 }}>
        {st && agreement ? `Agreement: ${agreement}.` : "The state picks which agreement the PNC signs."}
      </div>
    </div>
  );
}
