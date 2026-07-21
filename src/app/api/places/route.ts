import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// POST { query, lat?, lng?, motel6Only? }
// Returns candidate properties with address, place_id, location, and a photo
// reference. The Google key stays server-side; the browser never sees it.
export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "maps key missing" }, { status: 500 });

  const { query, lat, lng, motel6Only, kind } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const textQuery = motel6Only ? `Motel 6 ${query}` : query;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 10,
  };
  // Default to lodging (trafficking property lookup); allow other types.
  if (kind === "city") {
    body.includedType = "locality"; // cities/towns for the incident city-state lookup
  } else if (kind === "address") {
    // No includedType filter — street addresses match (paperwork address matching).
  } else if (kind === "facility") {
    // No includedType filter — hospitals, clinics, surgery centers, offices all match.
  } else {
    body.includedType = "lodging";
  }
  if (typeof lat === "number" && typeof lng === "number") {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 8000 },
    };
  }

  const fieldMask =
    "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.businessStatus" +
    (kind === "city" || kind === "address" ? ",places.addressComponents" : "");
  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return NextResponse.json({ error: "places error", detail: t }, { status: 502 });
  }

  // Build a clean "City, ST" from Google's address components (city lookup only).
  const cityStateFrom = (p: any): string => {
    const comps: any[] = p.addressComponents || [];
    const find = (t: string) => comps.find((c) => (c.types || []).includes(t));
    const city =
      find("locality")?.longText || find("postal_town")?.longText ||
      find("administrative_area_level_3")?.longText || find("administrative_area_level_2")?.longText ||
      p.displayName?.text || "";
    const st = find("administrative_area_level_1")?.shortText || "";
    return city && st ? `${city}, ${st}` : (p.formattedAddress || p.displayName?.text || "");
  };

  // Break Google's address components into the paperwork fields (address matching).
  const addressFrom = (p: any): { addr1: string; city: string; state: string; zip: string } => {
    const comps: any[] = p.addressComponents || [];
    const find = (t: string) => comps.find((c) => (c.types || []).includes(t));
    const addr1 = [find("street_number")?.longText, find("route")?.longText].filter(Boolean).join(" ").trim();
    const city = find("locality")?.longText || find("postal_town")?.longText || find("sublocality")?.longText || "";
    const state = find("administrative_area_level_1")?.shortText || "";
    const zip = find("postal_code")?.longText || "";
    return { addr1, city, state, zip };
  };

  const data = await resp.json();
  const candidates = (data.places || []).map((p: any) => ({
    place_id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_ref: p.photos?.[0]?.name ?? null,
    status: p.businessStatus ?? null,
    ...(kind === "city" ? { city_state: cityStateFrom(p) } : {}),
    ...(kind === "address" ? { parsed: addressFrom(p) } : {}),
  }));

  return NextResponse.json({ candidates });
}
