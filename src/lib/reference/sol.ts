// ============================================================================
// Personal-injury statute of limitations (SOL) by state — reference data.
//
// PURPOSE: an on-screen guardrail during intake so an agent (and a single-event
// file that skips QA) can see the filing clock immediately. Same reference-data
// pattern as agencies.ts / insurers.ts / vehicles.ts.
//
// ⚠️ NOT LEGAL ADVICE. This is a GENERAL guideline for ordinary
// negligence / auto personal-injury claims. Statutes change, and real deadlines
// turn on facts this table does not know: the discovery rule, tolling for minors
// or incapacity, wrongful-death vs. injury, medical-malpractice caps, and — most
// dangerously — claims against a government entity, which often carry a NOTICE
// deadline of just a few months. Always verify against current state law and the
// specific facts before relying on it. The attorney of record owns the deadline.
//
// SOURCE: Nolo "Statutes of Limitations for Civil Cases" (injury-to-person
// column). VERIFY-BY date below so it is obvious when this needs a refresh.
// ============================================================================

export const SOL_SOURCE = "Nolo — Statutes of Limitations for Civil Cases (injury to person)";
export const SOL_VERIFIED = "2026-07-19"; // last checked; re-verify periodically
export const SOL_DISCLAIMER =
  "General guideline for standard negligence/auto claims — not legal advice. " +
  "Exceptions apply (minors, discovery rule, wrongful death, and government claims " +
  "with short notice deadlines). Verify before relying.";

export interface SolEntry {
  years: number;        // general personal-injury SOL
  mvaYears?: number;    // motor-vehicle-accident SOL when it differs from `years`
  note?: string;        // brief caveat surfaced in the UI
}

// Keyed by USPS state abbreviation. Values are the standard PI limitations period.
export const SOL_PI: Record<string, SolEntry> = {
  AL: { years: 2 }, AK: { years: 2 }, AZ: { years: 2 }, AR: { years: 3 },
  CA: { years: 2 }, CO: { years: 2, mvaYears: 3, note: "Auto accidents: 3 years." },
  CT: { years: 2 }, DE: { years: 2 }, DC: { years: 3 }, FL: { years: 2, note: "Reduced from 4 to 2 years by 2023 tort reform." },
  GA: { years: 2 }, HI: { years: 2 }, ID: { years: 2 }, IL: { years: 2 },
  IN: { years: 2 }, IA: { years: 2 }, KS: { years: 2 },
  KY: { years: 1, mvaYears: 2, note: "Auto accidents: 2 years (from injury or last PIP payment)." },
  LA: { years: 1, note: "One-year prescriptive period — verify; recent legislation moved toward 2 years." },
  ME: { years: 6 }, MD: { years: 3 }, MA: { years: 3 }, MI: { years: 3 },
  MN: { years: 2 }, MS: { years: 3 }, MO: { years: 5 }, MT: { years: 3 },
  NE: { years: 4 }, NV: { years: 2 }, NH: { years: 3 }, NJ: { years: 2 },
  NM: { years: 3 }, NY: { years: 3 }, NC: { years: 3 }, ND: { years: 6 },
  OH: { years: 2 }, OK: { years: 2 }, OR: { years: 2 }, PA: { years: 2 },
  RI: { years: 3 }, SC: { years: 3 }, SD: { years: 3 }, TN: { years: 1 },
  TX: { years: 2 }, UT: { years: 4 }, VT: { years: 3 }, VA: { years: 2 },
  WA: { years: 3 }, WV: { years: 2 }, WI: { years: 3 }, WY: { years: 4 },
};

export const US_STATES: { abbr: string; name: string }[] = [
  { abbr: "AL", name: "Alabama" }, { abbr: "AK", name: "Alaska" }, { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" }, { abbr: "CA", name: "California" }, { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" }, { abbr: "DE", name: "Delaware" }, { abbr: "DC", name: "District of Columbia" },
  { abbr: "FL", name: "Florida" }, { abbr: "GA", name: "Georgia" }, { abbr: "HI", name: "Hawaii" },
  { abbr: "ID", name: "Idaho" }, { abbr: "IL", name: "Illinois" }, { abbr: "IN", name: "Indiana" },
  { abbr: "IA", name: "Iowa" }, { abbr: "KS", name: "Kansas" }, { abbr: "KY", name: "Kentucky" },
  { abbr: "LA", name: "Louisiana" }, { abbr: "ME", name: "Maine" }, { abbr: "MD", name: "Maryland" },
  { abbr: "MA", name: "Massachusetts" }, { abbr: "MI", name: "Michigan" }, { abbr: "MN", name: "Minnesota" },
  { abbr: "MS", name: "Mississippi" }, { abbr: "MO", name: "Missouri" }, { abbr: "MT", name: "Montana" },
  { abbr: "NE", name: "Nebraska" }, { abbr: "NV", name: "Nevada" }, { abbr: "NH", name: "New Hampshire" },
  { abbr: "NJ", name: "New Jersey" }, { abbr: "NM", name: "New Mexico" }, { abbr: "NY", name: "New York" },
  { abbr: "NC", name: "North Carolina" }, { abbr: "ND", name: "North Dakota" }, { abbr: "OH", name: "Ohio" },
  { abbr: "OK", name: "Oklahoma" }, { abbr: "OR", name: "Oregon" }, { abbr: "PA", name: "Pennsylvania" },
  { abbr: "RI", name: "Rhode Island" }, { abbr: "SC", name: "South Carolina" }, { abbr: "SD", name: "South Dakota" },
  { abbr: "TN", name: "Tennessee" }, { abbr: "TX", name: "Texas" }, { abbr: "UT", name: "Utah" },
  { abbr: "VT", name: "Vermont" }, { abbr: "VA", name: "Virginia" }, { abbr: "WA", name: "Washington" },
  { abbr: "WV", name: "West Virginia" }, { abbr: "WI", name: "Wisconsin" }, { abbr: "WY", name: "Wyoming" },
];

const NAME_TO_ABBR: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.name.toLowerCase(), s.abbr])
);
const ABBR_SET = new Set(US_STATES.map((s) => s.abbr));

// Pull a state abbreviation out of a free or standardized "City, ST" / "City, State"
// string. Returns null if nothing recognizable is present.
export function stateFromText(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  // "..., NV" or "... NV" — trailing 2-letter code
  const tail = s.match(/\b([A-Za-z]{2})\b\s*$/);
  if (tail && ABBR_SET.has(tail[1].toUpperCase())) return tail[1].toUpperCase();
  // full state name anywhere
  const lower = s.toLowerCase();
  for (const name of Object.keys(NAME_TO_ABBR)) {
    if (lower.includes(name)) return NAME_TO_ABBR[name];
  }
  return null;
}

export function stateName(abbr: string): string {
  return US_STATES.find((s) => s.abbr === abbr.toUpperCase())?.name ?? abbr;
}

// The applicable limitations period for a state. `mva: true` prefers the
// motor-vehicle figure where a state sets a different one.
export function solForState(abbr: string | null | undefined, opts?: { mva?: boolean }): { years: number; entry: SolEntry } | null {
  if (!abbr) return null;
  const entry = SOL_PI[abbr.toUpperCase()];
  if (!entry) return null;
  const years = opts?.mva && entry.mvaYears ? entry.mvaYears : entry.years;
  return { years, entry };
}

export type SolStatus = "ok" | "soon" | "urgent" | "past" | "unknown";

// Given an incident date (ISO or parseable) and a limitations period in years,
// compute the filing deadline and how much runway is left. Deliberately simple
// calendar math: it is a heads-up, not a legal calculation.
export function solDeadline(
  incidentDate: string | null | undefined,
  years: number | null | undefined,
  now: Date = new Date()
): { deadlineISO: string; daysRemaining: number; status: SolStatus } | null {
  if (!incidentDate || !years) return null;
  const start = new Date(incidentDate);
  if (isNaN(start.getTime())) return null;
  const deadline = new Date(start);
  deadline.setFullYear(deadline.getFullYear() + years);
  const daysRemaining = Math.floor((deadline.getTime() - now.getTime()) / 86_400_000);
  const status: SolStatus =
    daysRemaining < 0 ? "past" : daysRemaining <= 90 ? "urgent" : daysRemaining <= 365 ? "soon" : "ok";
  return { deadlineISO: deadline.toISOString().slice(0, 10), daysRemaining, status };
}
