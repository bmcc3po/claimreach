// Places-only search. No Supabase. POST op=search must stay on this
// module so a missing service-role key cannot crash the edge handler.

import { guessBrand } from "@/lib/property-brand";
import { geocodeLocation, mapsApiKey, milesToMeters, searchLodgingAround } from "@/lib/places-search";

export const MAPS_NOT_CONFIGURED =
  "Maps is not configured on this site. Search cannot run until GOOGLE_MAPS_API_KEY is in Pages.";

function placesUserError(code: string): string {
  if (code === "maps key missing") return MAPS_NOT_CONFIGURED;
  if (code === "places unreachable" || code.startsWith("places error")) {
    return "Google Places did not answer. Try again in a minute.";
  }
  if (code === "no location") return "Could not find that location. Try a city and state.";
  return code;
}

export async function searchProperties(b: Record<string, unknown>) {
  const location = typeof b.location === "string" ? b.location.trim() : "";
  if (!location) return { status: 400 as const, error: "Enter a city, intersection, or landmark." };
  if (!mapsApiKey()) return { status: 503 as const, error: MAPS_NOT_CONFIGURED };

  const radiusMiles = typeof b.radiusMiles === "number" ? b.radiusMiles : Number(b.radiusMiles) || 5;
  const anyChain = b.anyChain === true;
  const motel6 = anyChain ? false : b.motel6 !== false;
  const studio6 = anyChain ? false : b.studio6 !== false;

  try {
    const center = await geocodeLocation(location);
    if (!center.ok) {
      return {
        status: (center.status === 503 ? 503 : center.status === 400 ? 400 : 502) as 400 | 502 | 503,
        error: placesUserError(center.error),
      };
    }
    const found = await searchLodgingAround({
      lat: center.lat,
      lng: center.lng,
      radiusMeters: milesToMeters(radiusMiles),
      motel6,
      studio6,
      anyChain,
    });
    if (!found.ok) {
      return {
        status: (found.error === "maps key missing" ? 503 : 502) as 502 | 503,
        error: placesUserError(found.error),
      };
    }
    const candidates = found.candidates.map((c) => ({
      ...c,
      current_brand: guessBrand(c.name),
    }));
    return { status: 200 as const, candidates, center: { lat: center.lat, lng: center.lng } };
  } catch {
    return { status: 502 as const, error: "Search did not finish. Try again." };
  }
}
