import { NextRequest, NextResponse } from "next/server";
import { SPINE, CASE_PRESETS } from "@/lib/canonical-fields";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// Serves the canonical dictionary for the Integrations docs + mapping UI.
export async function GET() {
  return NextResponse.json({
    spine: SPINE.map((f) => ({ id: f.id, label: f.label, kind: f.kind, group: f.group, sensitive: !!f.sensitive })),
    presets: CASE_PRESETS.map((p) => ({ key: p.key, label: p.label, family: p.family, defaultGates: p.defaultGates, extras: p.extras.map((f) => ({ id: f.id, label: f.label, kind: f.kind })) })),
  });
}

// POST { place_id, name, address, lat, lng, current_brand, firm_id }
// Upsert a resolved property into properties_canonical (one row per firm+place)
// and return its stable canonical id, which the intake links each claimant to.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const firmId = b.firm_id || me.firm_id;
  if (!firmId) return NextResponse.json({ error: "firm_id required" }, { status: 400 });
  if (!b.place_id) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const admin = supabaseAdmin();
  // Existing canonical row for this firm + place?
  const { data: existing } = await admin.from("properties_canonical")
    .select("id").eq("firm_id", firmId).eq("place_id", b.place_id).maybeSingle();
  if (existing?.id) return NextResponse.json({ id: existing.id });

  const { data: created, error } = await admin.from("properties_canonical").insert({
    firm_id: firmId, place_id: b.place_id, name: b.name ?? null, address: b.address ?? null,
    lat: b.lat ?? null, lng: b.lng ?? null, current_brand: b.current_brand ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: created.id });
}
