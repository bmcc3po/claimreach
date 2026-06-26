import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// POST { query, lat?, lng?, motel6Only? }
// Returns candidate properties with address, place_id, location, and a photo
// reference. The Google key stays server-side; the browser never sees it.
export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "maps key missing" }, { status: 500 });

  const { query, lat, lng, motel6Only } = await req.json();
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const textQuery = motel6Only ? `Motel 6 ${query}` : query;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 10,
    includedType: "lodging",
  };
  if (typeof lat === "number" && typeof lng === "number") {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 8000 },
    };
  }

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.businessStatus",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return NextResponse.json({ error: "places error", detail: t }, { status: 502 });
  }

  const data = await resp.json();
  const candidates = (data.places || []).map((p: any) => ({
    place_id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_ref: p.photos?.[0]?.name ?? null,
    status: p.businessStatus ?? null,
  }));

  return NextResponse.json({ candidates });
}
