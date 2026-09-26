// ============================================================================
// One definition of "which state was the wreck in". The agreement (TX, FL,
// everything else AL/GA) and the SOL light both read it, on the phone and on
// the server. Takes "Houston, TX" or "Houston, Texas".
// ============================================================================
// Injury deadline in years by state, from the Sept 2026 CarCure table. Only what the SOL light needs.
// Florida and Louisiana branch on the crash date, see injuryYears(). Kentucky is the 2 year MVA rule, Tennessee 1.
export const SOL: [string, string, number][] = [
  ['AL', 'Alabama', 2], ['AK', 'Alaska', 2], ['AZ', 'Arizona', 2], ['AR', 'Arkansas', 3], ['CA', 'California', 2],
  ['CO', 'Colorado', 3], ['CT', 'Connecticut', 2], ['DE', 'Delaware', 2], ['DC', 'District of Columbia', 3], ['FL', 'Florida', 2],
  ['GA', 'Georgia', 2], ['HI', 'Hawaii', 2], ['ID', 'Idaho', 2], ['IL', 'Illinois', 2], ['IN', 'Indiana', 2],
  ['IA', 'Iowa', 2], ['KS', 'Kansas', 2], ['KY', 'Kentucky', 2], ['LA', 'Louisiana', 2], ['ME', 'Maine', 6],
  ['MD', 'Maryland', 3], ['MA', 'Massachusetts', 3], ['MI', 'Michigan', 3], ['MN', 'Minnesota', 6], ['MS', 'Mississippi', 3],
  ['MO', 'Missouri', 5], ['MT', 'Montana', 3], ['NE', 'Nebraska', 4], ['NV', 'Nevada', 2], ['NH', 'New Hampshire', 3],
  ['NJ', 'New Jersey', 2], ['NM', 'New Mexico', 3], ['NY', 'New York', 3], ['NC', 'North Carolina', 3], ['ND', 'North Dakota', 6],
  ['OH', 'Ohio', 2], ['OK', 'Oklahoma', 2], ['OR', 'Oregon', 2], ['PA', 'Pennsylvania', 2], ['RI', 'Rhode Island', 3],
  ['SC', 'South Carolina', 3], ['SD', 'South Dakota', 3], ['TN', 'Tennessee', 1], ['TX', 'Texas', 2], ['UT', 'Utah', 4],
  ['VT', 'Vermont', 3], ['VA', 'Virginia', 2], ['WA', 'Washington', 3], ['WV', 'West Virginia', 2], ['WI', 'Wisconsin', 3],
  ['WY', 'Wyoming', 4]
];

export function stateCodeOf(city: string | null | undefined): string | null {
  const t = String(city || "").trim();
  if (!t) return null;
  const tail = (t.indexOf(",") >= 0 ? t.slice(t.lastIndexOf(",") + 1) : t).trim().toUpperCase();
  let hit = SOL.find((r) => r[0] === tail || r[1].toUpperCase() === tail);
  if (!hit) hit = SOL.find((r) => tail.endsWith(" " + r[0]) || tail.endsWith(r[1].toUpperCase()));
  return hit ? hit[0] : null;
}


/** Years to file an injury claim in a state, for a crash on this date. Florida and Louisiana changed their rules. */
export function injuryYears(code: string | null | undefined, when: Date | null | undefined): number | null {
  if (code === "FL") return when && when < new Date("2023-03-24T00:00:00") ? 4 : 2;
  if (code === "LA") return when && when < new Date("2024-07-01T00:00:00") ? 1 : 2;
  const r = SOL.find((x) => x[0] === code);
  return r ? r[2] : null;
}

/** The deadline and days left, or null when the state or date is missing. */
export function injuryDeadline(code: string | null | undefined, when: Date | null | undefined, now: number = Date.now()): { years: number; deadline: Date; daysLeft: number } | null {
  if (!code || !when) return null;
  const years = injuryYears(code, when);
  if (years == null) return null;
  const deadline = new Date(when.getTime()); deadline.setFullYear(deadline.getFullYear() + years);
  return { years, deadline, daysLeft: Math.floor((deadline.getTime() - now) / 86400000) };
}

// Main time zone for each state, for "what time is it for her". A few states
// span two zones; this is the one most of the state is in.
export const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago",
  WY: "America/Denver",
};
