import { NextRequest, NextResponse } from "next/server";
export const runtime = "edge";

// POST { category, near } — searches Places for a resource category near an address/area.
const CATEGORY_QUERY: Record<string, string> = {
  police: "police station",
  fire: "fire station",
  hospital: "hospital emergency room",
  addiction: "drug and alcohol addiction treatment center",
  dv: "domestic violence shelter",
  shelter: "homeless shelter",
  mental: "mental health crisis center",
  trafficking: "human trafficking victim services",
};

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "maps key missing" }, { status: 500 });
  const { category, near } = await req.json();
  if (!near) return NextResponse.json({ error: "address required" }, { status: 400 });
  const cat = CATEGORY_QUERY[category] ?? category;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating",
    },
    body: JSON.stringify({ textQuery: `${cat} near ${near}`, maxResultCount: 8 }),
  });
  if (!resp.ok) return NextResponse.json({ error: "places error", detail: await resp.text() }, { status: 502 });
  const data = await resp.json();
  const results = (data.places || []).map((p: any) => ({
    place_id: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress ?? "",
    phone: p.nationalPhoneNumber ?? "", rating: p.rating ?? null,
    lat: p.location?.latitude, lng: p.location?.longitude,
  }));
  return NextResponse.json({ results });
}
