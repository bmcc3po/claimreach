import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { agenciesFor, partsFromGeocode } from "@/lib/reference/agencies";
export const runtime = "edge";

// Geocoding, not Places. An intersection is not a business, so the Places
// search that finds hotels would hand back the nearest gas station and the
// agent would pick it because the screen asked them to pick something.
// Geocoding resolves "Sahara and Rainbow, Las Vegas" to a real point with a
// county attached, which is what actually matters: county drives venue, and
// the road type tells you who wrote the crash report.

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const g = await gateUser(sb);
  if (!g) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({
      error: "Location lookup is not configured. Add GOOGLE_MAPS_API_KEY in Cloudflare Pages settings.",
    }, { status: 501 });
  }

  const { query, near } = await req.json().catch(() => ({}) as any);
  if (!query || String(query).trim().length < 3) {
    return NextResponse.json({ results: [] });
  }

  // "near" is the city/state we already captured, which keeps "Main and 3rd"
  // from resolving to a Main Street two thousand miles away.
  const q = near ? `${query}, ${near}` : String(query);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:US&key=${key}`;

  try {
    const r = await fetch(url);
    const d: any = await r.json();
    if (d.status !== "OK" || !Array.isArray(d.results) || d.results.length === 0) {
      // Say what actually happened. "It doesn't work" is unfixable; "Geocoding
      // API is not enabled on this project" is a thirty second fix.
      const explain: Record<string, string> = {
        ZERO_RESULTS: "No match. Add the city, or try a nearby cross street.",
        REQUEST_DENIED: "Google refused the request. The Geocoding API is probably not enabled on the same project as your Places key: Google Cloud Console, APIs and Services, enable Geocoding API.",
        OVER_QUERY_LIMIT: "Google rate limited or billing is not enabled on the project.",
        INVALID_REQUEST: "The search text was empty or malformed.",
      };
      return NextResponse.json({
        results: [],
        note: explain[d.status] ?? `Google returned ${d.status}.`,
        google_status: d.status,
        google_message: d.error_message ?? null,
      });
    }

    const results = d.results.slice(0, 4).map((res: any) => {
      const p = partsFromGeocode(res);
      return { ...p, agencies: agenciesFor(p) };
    });
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "lookup failed" }, { status: 502 });
  }
}
