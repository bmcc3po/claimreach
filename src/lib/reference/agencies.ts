// ============================================================================
// WHO HAS THE REPORT
//
// Getting a crash report means knowing which of roughly 18,000 US agencies
// responded. There is no public API that answers "which department covers this
// point," so this infers it from the geocoded address the way a case manager
// would, and shows its work:
//
//   * on an interstate, US highway or state route  -> state police / highway patrol
//   * inside an incorporated city                  -> that city's police department
//   * otherwise (unincorporated county road)       -> the county sheriff
//
// It returns RANKED CANDIDATES, never a single answer, because the inference is
// wrong often enough that presenting one guess as fact would send a case manager
// to the wrong records window. The agent confirms with the caller, who was
// there and saw the uniform.
// ============================================================================

export interface AgencyCandidate {
  name: string;
  kind: "state" | "city" | "county";
  why: string;
  confidence: "likely" | "possible";
}

// One highway patrol per state. Hawaii has no state police force; its four
// county police departments handle everything, so it is deliberately absent.
export const STATE_PATROL: Record<string, string> = {
  AL: "Alabama State Troopers (ALEA)", AK: "Alaska State Troopers",
  AZ: "Arizona DPS Highway Patrol", AR: "Arkansas State Police",
  CA: "California Highway Patrol", CO: "Colorado State Patrol",
  CT: "Connecticut State Police", DE: "Delaware State Police",
  DC: "DC Metropolitan Police", FL: "Florida Highway Patrol",
  GA: "Georgia State Patrol", ID: "Idaho State Police",
  IL: "Illinois State Police", IN: "Indiana State Police",
  IA: "Iowa State Patrol", KS: "Kansas Highway Patrol",
  KY: "Kentucky State Police", LA: "Louisiana State Police",
  ME: "Maine State Police", MD: "Maryland State Police",
  MA: "Massachusetts State Police", MI: "Michigan State Police",
  MN: "Minnesota State Patrol", MS: "Mississippi Highway Patrol",
  MO: "Missouri State Highway Patrol", MT: "Montana Highway Patrol",
  NE: "Nebraska State Patrol", NV: "Nevada Highway Patrol",
  NH: "New Hampshire State Police", NJ: "New Jersey State Police",
  NM: "New Mexico State Police", NY: "New York State Police",
  NC: "North Carolina State Highway Patrol", ND: "North Dakota Highway Patrol",
  OH: "Ohio State Highway Patrol", OK: "Oklahoma Highway Patrol",
  OR: "Oregon State Police", PA: "Pennsylvania State Police",
  RI: "Rhode Island State Police", SC: "South Carolina Highway Patrol",
  SD: "South Dakota Highway Patrol", TN: "Tennessee Highway Patrol",
  TX: "Texas Highway Patrol (DPS)", UT: "Utah Highway Patrol",
  VT: "Vermont State Police", VA: "Virginia State Police",
  WA: "Washington State Patrol", WV: "West Virginia State Police",
  WI: "Wisconsin State Patrol", WY: "Wyoming Highway Patrol",
};

// Interstates, US routes and state routes. Matches how Google returns a route
// name ("I-15", "US-95", "State Route 160", "Hwy 160").
const HIGHWAY = /\b(I[-\s]?\d+|Interstate\s*\d+|US[-\s]?(Route\s*)?\d+|U\.S\.\s*\d+|State\s+(Route|Highway)\s*\d+|SR[-\s]?\d+|Hwy\.?\s*\d+|Highway\s*\d+|Turnpike|Freeway|Expressway|Parkway)\b/i;

export function isHighway(route: string | undefined | null): boolean {
  return !!route && HIGHWAY.test(route);
}

export function agenciesFor(opts: {
  route?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;      // two-letter
}): AgencyCandidate[] {
  const { route, city, county, state } = opts;
  const out: AgencyCandidate[] = [];
  const patrol = state ? STATE_PATROL[state.toUpperCase()] : undefined;
  const onHighway = isHighway(route);

  if (onHighway && patrol) {
    out.push({ name: patrol, kind: "state", confidence: "likely",
      why: `${route} is a highway, which is state patrol jurisdiction in most of ${state}.` });
  }

  if (city) {
    out.push({
      name: `${city} Police Department`, kind: "city",
      confidence: onHighway ? "possible" : "likely",
      why: onHighway
        ? `${city} PD may still have responded if the crash was inside city limits.`
        : `The location falls inside ${city}, so city police normally respond.`,
    });
  }

  if (county) {
    const clean = county.replace(/\s+County$/i, "");
    out.push({
      name: `${clean} County Sheriff's Office`, kind: "county",
      confidence: city ? "possible" : "likely",
      why: city
        ? `The sheriff covers unincorporated pockets near ${city} and assists on county roads.`
        : `No incorporated city at this location, so the county sheriff normally responds.`,
    });
  }

  if (!onHighway && patrol) {
    out.push({ name: patrol, kind: "state", confidence: "possible",
      why: "State patrol sometimes takes the report even off the highway, especially on a fatality." });
  }

  return out;
}

// Pull the pieces we need out of a Google Geocoding result.
export function partsFromGeocode(result: any): {
  formatted: string; route?: string; city?: string; county?: string; state?: string; zip?: string;
  lat?: number; lng?: number;
} {
  const comp: any[] = result?.address_components ?? [];
  const pick = (type: string, short = false) => {
    const c = comp.find((x) => (x.types ?? []).includes(type));
    return c ? (short ? c.short_name : c.long_name) : undefined;
  };
  return {
    formatted: result?.formatted_address ?? "",
    route: pick("route"),
    city: pick("locality") ?? pick("sublocality") ?? pick("administrative_area_level_3"),
    county: pick("administrative_area_level_2"),
    state: pick("administrative_area_level_1", true),
    zip: pick("postal_code"),
    lat: result?.geometry?.location?.lat,
    lng: result?.geometry?.location?.lng,
  };
}
