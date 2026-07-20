// ============================================================================
// INSURANCE CARRIER REFERENCE
//
// Free text made "State Farm", "Statefarm", "St. Farm" and "State Farm Mutual
// Automobile Insurance Company" four different carriers, which makes any report
// on who you are up against worthless. These are the canonical names; anything
// off-list can still be typed.
//
// Bundled rather than fetched: no public carrier API is reliable enough to sit
// in the middle of a live call.
// ============================================================================

// Auto and general liability carriers, roughly by US market presence.
export const AUTO_CARRIERS: string[] = [
  "State Farm", "GEICO", "Progressive", "Allstate", "USAA", "Liberty Mutual",
  "Farmers Insurance", "Nationwide", "American Family", "Travelers",
  "Erie Insurance", "Auto-Owners Insurance", "Kemper", "Mercury Insurance",
  "The Hartford", "Safeco", "Esurance", "The General", "Root Insurance",
  "Dairyland", "Bristol West", "Infinity Insurance", "Direct Auto",
  "Elephant Insurance", "National General", "Plymouth Rock", "Amica Mutual",
  "Chubb", "AAA / CSAA", "Auto Club (ACSC)", "Country Financial",
  "Shelter Insurance", "Westfield Insurance", "Grange Insurance",
  "Cincinnati Insurance", "Hanover Insurance", "Sentry Insurance",
  "Acuity Insurance", "Selective Insurance", "Utica National",
  "Zurich North America", "AIG", "CNA", "Berkshire Hathaway GUARD",
  "Old Republic", "Federated Mutual", "EMC Insurance", "Penn National",
  "Encompass Insurance", "Foremost Insurance", "Hallmark Insurance",
  "Gainsco", "Safeway Insurance", "Titan Insurance", "21st Century",
  "MetLife Auto", "Farm Bureau Insurance", "NJM Insurance", "Wawanesa",
  "Clearcover", "Lemonade", "Hippo", "Sun Coast General",
];

// Commercial and trucking carriers, which is what a CMV file usually hits.
export const COMMERCIAL_CARRIERS: string[] = [
  "Great West Casualty", "Canal Insurance", "Northland Insurance",
  "Baldwin & Lyons / Protective", "Sentry Casualty", "Carolina Casualty",
  "Lancer Insurance", "James River Insurance", "Prime Insurance",
  "Knight Specialty", "Hallmark Specialty", "RLI Insurance",
  "Scottsdale Insurance", "Markel", "Nautilus Insurance", "Arch Insurance",
];

export const HEALTH_CARRIERS: string[] = [
  "UnitedHealthcare", "Anthem Blue Cross Blue Shield", "Blue Cross Blue Shield",
  "Aetna", "Cigna", "Humana", "Kaiser Permanente", "Centene", "Molina Healthcare",
  "Medicare", "Medicaid", "TRICARE", "Veterans Affairs (VA)", "Ambetter",
  "Oscar Health", "Bright Health", "Health Net", "HCSC", "Highmark",
  "Independence Blue Cross", "CareFirst", "Premera Blue Cross", "Regence",
  "EmblemHealth", "Fidelis Care", "WellCare", "Devoted Health", "Clover Health",
  "No health insurance",
];

export const ALL_CARRIERS = Array.from(new Set([...AUTO_CARRIERS, ...COMMERCIAL_CARRIERS])).sort();

function search(pool: string[], q: string, limit: number): string[] {
  const s = (q || "").trim().toLowerCase();
  if (s.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const c of pool) {
    const lc = c.toLowerCase();
    if (lc.startsWith(s)) starts.push(c);
    else if (lc.includes(s)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function searchAutoCarriers(q: string, limit = 8) { return search(ALL_CARRIERS, q, limit); }
export function searchHealthCarriers(q: string, limit = 8) { return search(HEALTH_CARRIERS, q, limit); }
