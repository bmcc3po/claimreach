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
