import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "edge";

// GET /api/canonical?place_id=...
// Live dedupe: does a canonical property already exist for this place_id, and
// how many claimants point at it? Drives the "this property already has N
// claimants — same one?" prompt during intake.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const place_id = new URL(req.url).searchParams.get("place_id");
  if (!place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const { data, error } = await sb
    .from("properties_canonical")
    .select("id, name, address, current_brand, claimant_count")
    .eq("place_id", place_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canonical: data ?? null });
}

// POST { place_id, name, address, city, state, lat, lng, current_brand, firm_id }
// Upsert canonical property and return its id. Uses the admin client to keep
// the claimant_count counter authoritative (system-owned write), after
// verifying the caller is an authenticated internal user.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // confirm internal role
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = await req.json();
  if (!b.place_id || !b.firm_id) {
    return NextResponse.json({ error: "place_id and firm_id required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("properties_canonical")
    .select("id, claimant_count")
    .eq("firm_id", b.firm_id)
    .eq("place_id", b.place_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, existed: true, claimant_count: existing.claimant_count });
  }

  const { data: created, error } = await admin
    .from("properties_canonical")
    .insert({
      firm_id: b.firm_id,
      place_id: b.place_id,
      name: b.name ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      state: b.state ?? null,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      current_brand: b.current_brand ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: created.id, existed: false, claimant_count: 0 });
}
