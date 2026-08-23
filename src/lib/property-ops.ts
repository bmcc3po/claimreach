// Shared search/save for the token-gated /tools/property route and the
// session-gated /m6/property rail. One property stack.

import { supabaseAdmin } from "@/lib/supabase-server";
import { applyM6LeadFilters } from "@/lib/m6-scope";
import { isM6LeadShape, TMP_SLUG } from "@/lib/m6";
import { guessBrand } from "@/lib/property-brand";
import {
  cleanLeadid, flattenIdentification, lawrulerPasteBlock, normalizeStay,
} from "@/lib/property-tool";
import { geocodeLocation, milesToMeters, searchLodgingAround } from "@/lib/places-search";

const CANON_SELECT = "name, street, city, state, zip, address, lat, lng, current_brand";
const LINK_SELECT = `id, remembered_brand, current_brand, brand_mismatch, stay_from, stay_to, properties_canonical (${CANON_SELECT})`;

export async function tmpPropertyFirmId(): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
  return data?.id ?? null;
}

export async function listPropertiesForLead(firmId: string, leadid: string | string[]) {
  const keys = (Array.isArray(leadid) ? leadid : [leadid]).map(cleanLeadid).filter(Boolean);
  if (!keys.length) return { error: null, rows: [] as ReturnType<typeof flattenIdentification>[] };
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("property_identifications")
    .select(LINK_SELECT)
    .eq("firm_id", firmId)
    .in("lawruler_leadid", keys)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, rows: [] as ReturnType<typeof flattenIdentification>[] };
  return { error: null, rows: (data ?? []).map((r: any) => flattenIdentification(r)) };
}

const LEAD_RESOLVE = "id, firm_id, campaign, case_type, archived_at, external_id, lawruler_ref_no, property_name, property_street, property_city, property_state, property_zip";

export async function resolveM6PropertyLead(firmId: string, raw: string | null | undefined) {
  const id = cleanLeadid(raw);
  if (!id) return null;
  const admin = supabaseAdmin();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (isUuid) {
    const { data } = await applyM6LeadFilters(admin.from("leads").select(LEAD_RESOLVE), firmId)
      .eq("id", id).maybeSingle();
    return data ?? null;
  }
  const { data } = await admin.from("leads").select(LEAD_RESOLVE)
    .eq("firm_id", firmId)
    .is("archived_at", null)
    .or(`external_id.eq.${id},lawruler_ref_no.eq.${id}`)
    .maybeSingle();
  return data && isM6LeadShape(data) ? data : null;
}

export async function stampLeadProperty(
  firmId: string,
  leadId: string,
  p: { name?: string | null; street?: string | null; city?: string | null; state?: string | null; zip?: string | null },
) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("leads").update({
    property_name: p.name || null,
    property_street: p.street || null,
    property_city: p.city || null,
    property_state: p.state || null,
    property_zip: p.zip || null,
  }).eq("id", leadId).eq("firm_id", firmId);
  return error?.message ?? null;
}

export async function searchProperties(b: Record<string, unknown>) {
  const location = typeof b.location === "string" ? b.location.trim() : "";
  if (!location) return { status: 400 as const, error: "Enter a city, intersection, or landmark." };
  const radiusMiles = typeof b.radiusMiles === "number" ? b.radiusMiles : Number(b.radiusMiles) || 5;
  const anyChain = b.anyChain === true;
  const motel6 = anyChain ? false : b.motel6 !== false;
  const studio6 = anyChain ? false : b.studio6 !== false;

  const center = await geocodeLocation(location);
  if (!center) {
    return { status: 400 as const, error: "Could not find that location. Try a city and state." };
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
    const mapsMissing = found.error === "maps key missing";
    return {
      status: (mapsMissing ? 503 : 502) as 502 | 503,
      error: mapsMissing
        ? "Maps is not configured on this site. Search cannot run until GOOGLE_MAPS_API_KEY is in Pages."
        : found.error.startsWith("places error")
          ? "Google Places did not answer. Try again in a minute."
          : found.error,
    };
  }
  const candidates = found.candidates.map((c) => ({
    ...c,
    current_brand: guessBrand(c.name),
  }));
  return { status: 200 as const, candidates, center };
}

export async function savePropertyIdentification(firmId: string, b: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const leadid = cleanLeadid(typeof b.leadid === "string" ? b.leadid : "");
  if (!leadid) return { status: 400 as const, error: "File # is missing." };
  const placeId = typeof b.place_id === "string" ? b.place_id.trim() : "";
  if (!placeId) return { status: 400 as const, error: "Pick a property." };

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
      name: name || null, address: address || null, street: street || null,
      city: city || null, state: state || null, zip: zip || null,
      lat, lng, current_brand: currentBrand,
    }).eq("id", existing.id);
    if (error) return { status: 500 as const, error: error.message };
    canonicalId = existing.id;
  } else {
    const { data: created, error } = await admin.from("properties_canonical").insert({
      firm_id: firmId, place_id: placeId, name: name || null, address: address || null,
      street: street || null, city: city || null, state: state || null, zip: zip || null,
      lat, lng, current_brand: currentBrand,
    }).select("id").single();
    if (error || !created) return { status: 500 as const, error: error?.message || "Could not save the property." };
    canonicalId = created.id;
  }

  const { data: link, error: linkErr } = await admin.from("property_identifications").upsert({
    firm_id: firmId, lawruler_leadid: leadid, canonical_id: canonicalId,
    remembered_brand: remembered || null, current_brand: currentBrand,
    stay_from: stayFrom || null, stay_to: stayTo || null,
  }, { onConflict: "firm_id,lawruler_leadid,canonical_id" })
    .select(LINK_SELECT)
    .single();
  if (linkErr || !link) {
    return { status: 500 as const, error: linkErr?.message || "Could not link this property to the file." };
  }
  const property = flattenIdentification(link as any);
  return { status: 200 as const, ok: true as const, property, paste: lawrulerPasteBlock(property) };
}
