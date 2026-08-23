import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { TMP_SLUG } from "@/lib/m6";
import { guessBrand } from "@/lib/property-brand";
import {
  cleanLeadid, flattenIdentification, lawrulerPasteBlock,
  normalizeStay, propertyToolKeyOk,
} from "@/lib/property-tool";
import { geocodeLocation, milesToMeters, searchLodgingAround } from "@/lib/places-search";

export const runtime = "edge";

function deny() {
  return new NextResponse(null, { status: 404 });
}

function keyFrom(req: NextRequest, body?: Record<string, unknown>): string | null {
  const q = new URL(req.url).searchParams.get("k");
  if (q) return q;
  const header = req.headers.get("x-property-tool-key");
  if (header) return header;
  const fromBody = body?.k;
  return typeof fromBody === "string" ? fromBody : null;
}

async function tmpFirmId(admin: ReturnType<typeof supabaseAdmin>): Promise<string | null> {
  const { data } = await admin.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
  return data?.id ?? null;
}

const CANON_SELECT = "name, street, city, state, zip, address, lat, lng, current_brand";
const LINK_SELECT = `id, remembered_brand, current_brand, brand_mismatch, stay_from, stay_to, properties_canonical (${CANON_SELECT})`;

async function listForLead(admin: ReturnType<typeof supabaseAdmin>, firmId: string, leadid: string) {
  const { data, error } = await admin.from("property_identifications")
    .select(LINK_SELECT)
    .eq("firm_id", firmId)
    .eq("lawruler_leadid", leadid)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, rows: [] as ReturnType<typeof flattenIdentification>[] };
  return { error: null, rows: (data ?? []).map((r: any) => flattenIdentification(r)) };
}

export async function GET(req: NextRequest) {
  if (!propertyToolKeyOk(keyFrom(req))) return deny();
  const leadid = cleanLeadid(new URL(req.url).searchParams.get("leadid"));
  if (!leadid) return NextResponse.json({ error: "File # is missing." }, { status: 400 });

  const admin = supabaseAdmin();
  const firmId = await tmpFirmId(admin);
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });

  const { error, rows } = await listForLead(admin, firmId, leadid);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ properties: rows });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  if (!propertyToolKeyOk(keyFrom(req, b))) return deny();

  const op = b.op === "save" ? "save" : "search";
  const admin = supabaseAdmin();
  const firmId = await tmpFirmId(admin);
  if (!firmId) return NextResponse.json({ error: "This tool is not available." }, { status: 503 });

  if (op === "search") {
    const location = typeof b.location === "string" ? b.location.trim() : "";
    if (!location) return NextResponse.json({ error: "Enter a city, intersection, or landmark." }, { status: 400 });
    const radiusMiles = typeof b.radiusMiles === "number" ? b.radiusMiles : Number(b.radiusMiles) || 5;
    const anyChain = b.anyChain === true;
    const motel6 = anyChain ? false : b.motel6 !== false;
    const studio6 = anyChain ? false : b.studio6 !== false;

    const center = await geocodeLocation(location);
    if (!center) {
      return NextResponse.json({ error: "Could not find that location. Try a city and state." }, { status: 400 });
    }
    const found = await searchLodgingAround({
      lat: center.lat,
      lng: center.lng,
      radiusMeters: milesToMeters(radiusMiles),
      motel6,
      studio6,
      anyChain,
    });
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: 502 });
    const candidates = found.candidates.map((c) => ({
      ...c,
      current_brand: guessBrand(c.name),
    }));
    return NextResponse.json({ candidates, center });
  }

  const leadid = cleanLeadid(typeof b.leadid === "string" ? b.leadid : "");
  if (!leadid) return NextResponse.json({ error: "File # is missing. Open this from the LawRuler file." }, { status: 400 });
  const placeId = typeof b.place_id === "string" ? b.place_id.trim() : "";
  if (!placeId) return NextResponse.json({ error: "Pick a property." }, { status: 400 });

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const street = typeof b.street === "string" ? b.street.trim() : "";
  const city = typeof b.city === "string" ? b.city.trim() : "";
  const state = typeof b.state === "string" ? b.state.trim() : "";
  const zip = typeof b.zip === "string" ? b.zip.trim() : "";
  const address = typeof b.address === "string" ? b.address.trim() : [street, city, state, zip].filter(Boolean).join(", ");
  const lat = typeof b.lat === "number" ? b.lat : null;
  const lng = typeof b.lng === "number" ? b.lng : null;
  const currentBrand = (typeof b.current_brand === "string" && b.current_brand.trim())
    || guessBrand(name)
    || null;
  const remembered = typeof b.remembered_brand === "string" ? b.remembered_brand.trim() : "";
  const stayFrom = normalizeStay(typeof b.stay_from === "string" ? b.stay_from : "");
  const stayTo = normalizeStay(typeof b.stay_to === "string" ? b.stay_to : "");

  const { data: existing } = await admin.from("properties_canonical")
    .select("id")
    .eq("firm_id", firmId)
    .eq("place_id", placeId)
    .maybeSingle();

  let canonicalId: string;
  if (existing?.id) {
    const { error } = await admin.from("properties_canonical").update({
      name: name || null,
      address: address || null,
      street: street || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      lat, lng,
      current_brand: currentBrand,
    }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    canonicalId = existing.id;
  } else {
    const { data: created, error } = await admin.from("properties_canonical").insert({
      firm_id: firmId,
      place_id: placeId,
      name: name || null,
      address: address || null,
      street: street || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      lat, lng,
      current_brand: currentBrand,
    }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message || "Could not save the property." }, { status: 500 });
    canonicalId = created.id;
  }

  const { data: link, error: linkErr } = await admin.from("property_identifications").upsert({
    firm_id: firmId,
    lawruler_leadid: leadid,
    canonical_id: canonicalId,
    remembered_brand: remembered || null,
    current_brand: currentBrand,
    stay_from: stayFrom || null,
    stay_to: stayTo || null,
  }, { onConflict: "firm_id,lawruler_leadid,canonical_id" })
    .select(LINK_SELECT)
    .single();
  if (linkErr || !link) {
    return NextResponse.json({ error: linkErr?.message || "Could not link this property to the file." }, { status: 500 });
  }

  const property = flattenIdentification(link as any);
  return NextResponse.json({
    ok: true,
    property,
    paste: lawrulerPasteBlock(property),
  });
}
