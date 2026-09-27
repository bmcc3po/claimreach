import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { propertyToolKeyOk } from "@/lib/property-tool";

export const runtime = "edge";

// GET /api/streetview?lat=..&lng=..              -> Street View Static image
// GET /api/streetview?photo=places/.../photos/.. -> Places photo
// Proxies imagery so the Google key stays server-side.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Signed-in people, or the LawRuler property tool with its own key (?k=).
  // Checked the cheap way first so the tool's pictures do not wait on a sign-in lookup.
  if (!propertyToolKeyOk(searchParams.get("k"))) {
    const { data: { user } } = await (await supabaseServer()).auth.getUser();
    if (!user) return new Response("sign in to see this picture", { status: 401 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return new Response("maps key missing", { status: 500 });

  const photo = searchParams.get("photo");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  let url: string;
  if (photo) {
    // Places Photo (new API): name looks like places/XXX/photos/YYY
    url = `https://places.googleapis.com/v1/${photo}/media?maxWidthPx=640&key=${key}`;
  } else if (lat && lng) {
    url = `https://maps.googleapis.com/maps/api/streetview?size=640x400&location=${lat},${lng}&fov=80&key=${key}`;
  } else {
    return new Response("need photo or lat/lng", { status: 400 });
  }

  const img = await fetch(url);
  if (!img.ok) return new Response("image fetch failed", { status: 502 });

  return new Response(img.body, {
    headers: {
      "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
