// Google Places (New) searchText + address-component parse.
// Used by the LawRuler property tool. /api/places stays as the intake
// surface; this helper is the one Places call shape for radius + parsed
// street/city/state/zip.

export type ParsedAddress = { street: string; city: string; state: string; zip: string };

function componentText(c: any, short = false): string {
  if (!c) return "";
  if (short) return String(c.shortText || c.short_name || c.longText || c.long_name || "").trim();
  return String(c.longText || c.long_name || c.shortText || c.short_name || "").trim();
}

export function parseAddressComponents(comps: any[] | null | undefined): ParsedAddress {
  const list: any[] = comps || [];
  const find = (t: string) => list.find((c) => (c.types || []).includes(t));
  const street = [componentText(find("street_number")), componentText(find("route"))].filter(Boolean).join(" ").trim();
  const city = componentText(find("locality"))
    || componentText(find("postal_town"))
    || componentText(find("sublocality"))
    || "";
  const state = componentText(find("administrative_area_level_1"), true);
  const zip = componentText(find("postal_code"));
  return { street, city, state, zip };
}

export function parseFormattedAddress(formatted: string | null | undefined): ParsedAddress {
  const s = String(formatted || "").replace(/,\s*USA$/i, "").trim();
  const empty = { street: "", city: "", state: "", zip: "" };
  if (!s) return empty;
  const m = s.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (!m) return empty;
  return { street: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] };
}

export function mergeParsedAddress(parsed: ParsedAddress, formatted?: string | null): ParsedAddress {
  const fb = parseFormattedAddress(formatted);
  return {
    street: parsed.street || fb.street,
    city: parsed.city || fb.city,
    state: parsed.state || fb.state,
    zip: parsed.zip || fb.zip,
  };
}

// CSV / LawRuler often parked the stay in case_description. Same shape the
// 0094 backfill looks for. Do not invent a second address vocabulary.
export function parseStayAddressFromNarrative(text: string | null | undefined): ParsedAddress & { name: string } {
  const s = String(text || "");
  const name = /studio\s*6/i.test(s) ? "Studio 6" : /motel\s*6/i.test(s) ? "Motel 6" : "";
  const comma = s.match(/(\d{1,6}\s+[A-Za-z0-9 .#'/-]+),\s*([A-Za-z .]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (comma) {
    return { name, street: comma[1].trim(), city: comma[2].trim(), state: comma[3], zip: comma[4] };
  }
  const loose = s.match(/(\d{1,6}\s+[A-Za-z0-9 .#'/-]+)\s+([A-Za-z][A-Za-z .]+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (loose) {
    return { name, street: loose[1].trim(), city: loose[2].trim(), state: loose[3], zip: loose[4] };
  }
  return { name, street: "", city: "", state: "", zip: "" };
}

export function milesToMeters(miles: number): number {
  const n = Number.isFinite(miles) ? miles : 5;
  const m = n * 1609.34;
  return Math.max(200, Math.min(m, 50000));
}

const LODGING_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.businessStatus,places.addressComponents";

export type PlaceCandidate = {
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
};

function mapPlace(p: any): PlaceCandidate {
  const parsed = mergeParsedAddress(parseAddressComponents(p.addressComponents), p.formattedAddress);
  return {
    place_id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_ref: p.photos?.[0]?.name ?? null,
    status: p.businessStatus ?? null,
  };
}

export async function googlePlacesSearchText(opts: {
  textQuery: string;
  includedType?: string;
  lat?: number | null;
  lng?: number | null;
  radiusMeters?: number;
  restrict?: boolean;
  maxResultCount?: number;
  fieldMask?: string;
}): Promise<{ ok: true; places: any[] } | { ok: false; status: number; error: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, status: 503, error: "maps key missing" };

  const body: Record<string, unknown> = {
    textQuery: opts.textQuery,
    maxResultCount: opts.maxResultCount ?? 10,
  };
  if (opts.includedType) body.includedType = opts.includedType;
  if (typeof opts.lat === "number" && typeof opts.lng === "number") {
    const circle = {
      center: { latitude: opts.lat, longitude: opts.lng },
      radius: opts.radiusMeters ?? 8000,
    };
    if (opts.restrict) body.locationRestriction = { circle };
    else body.locationBias = { circle };
  }

  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": opts.fieldMask ?? LODGING_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return { ok: false, status: 502, error: `places error ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, places: data.places || [] };
  } catch {
    return { ok: false, status: 502, error: "places unreachable" };
  }
}

export async function geocodeLocation(query: string): Promise<{ lat: number; lng: number } | null> {
  const r = await googlePlacesSearchText({
    textQuery: query,
    maxResultCount: 1,
    fieldMask: "places.id,places.displayName,places.location,places.formattedAddress",
  });
  if (!r.ok || !r.places.length) return null;
  const lat = r.places[0].location?.latitude;
  const lng = r.places[0].location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

export async function searchLodgingAround(opts: {
  lat: number;
  lng: number;
  radiusMeters: number;
  motel6: boolean;
  studio6: boolean;
  anyChain: boolean;
}): Promise<{ ok: true; candidates: PlaceCandidate[] } | { ok: false; error: string }> {
  const queries: string[] = [];
  if (opts.anyChain || (!opts.motel6 && !opts.studio6)) {
    queries.push("motel");
  } else {
    if (opts.motel6) queries.push("Motel 6");
    if (opts.studio6) queries.push("Studio 6");
  }

  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  let lastError: string | null = null;

  const passes: { restrict: boolean; includedType?: string }[] = [
    { restrict: true, includedType: "lodging" },
    { restrict: false, includedType: "lodging" },
    { restrict: false },
  ];

  for (const pass of passes) {
    for (const textQuery of queries) {
      const r = await googlePlacesSearchText({
        textQuery,
        includedType: pass.includedType,
        lat: opts.lat,
        lng: opts.lng,
        radiusMeters: opts.radiusMeters,
        restrict: pass.restrict,
        maxResultCount: 10,
      });
      if (!r.ok) { lastError = r.error; continue; }
      for (const p of r.places) {
        const c = mapPlace(p);
        if (!c.place_id || seen.has(c.place_id)) continue;
        seen.add(c.place_id);
        out.push(c);
      }
    }
    if (out.length) break;
  }
  if (!out.length && lastError) return { ok: false, error: lastError };
  return { ok: true, candidates: out };
}
