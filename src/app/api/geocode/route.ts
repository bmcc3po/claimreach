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

// Second mode: fetch the phone number and hours for one station the agent picked.
async function stationDetails(placeId: string, key: string) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website&key=${key}`;
  const r = await fetch(url);
  const d: any = await r.json();
  if (d.status !== "OK") return null;
  return {
    name: d.result?.name, address: d.result?.formatted_address,
    phone: d.result?.formatted_phone_number ?? null, website: d.result?.website ?? null,
  };
}

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

  const body: any = await req.json().catch(() => ({}));
  const { query, near, station_place_id } = body;

  if (station_place_id) {
    const det = await stationDetails(String(station_place_id), key);
    return NextResponse.json({ station: det });
  }

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

    const results = await Promise.all(d.results.slice(0, 3).map(async (res: any) => {
      const p = partsFromGeocode(res);
      const agencies = agenciesFor(p);

      // Naming an agency is not enough: the client needs somewhere to actually
      // call for the report. Places IS the right tool here, because a precinct
      // is a real place with an address and a phone number, unlike the
      // intersection that got us here.
      let stations: any[] = [];
      if (p.lat != null && p.lng != null) {
        try {
          const nurl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${p.lat},${p.lng}&radius=12000&type=police&key=${key}`;
          const nr = await fetch(nurl);
          const nd: any = await nr.json();
          if (nd.status === "OK") {
            stations = (nd.results ?? []).slice(0, 4).map((st: any) => ({
              name: st.name,
              address: st.vicinity ?? st.formatted_address ?? "",
              place_id: st.place_id,
              open_now: st.opening_hours?.open_now ?? null,
              distance_hint: st.vicinity ?? "",
            }));
          }
        } catch { /* the agency inference still stands without stations */ }
      }
      return { ...p, agencies, stations };
    }));
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "lookup failed" }, { status: 502 });
  }
}
