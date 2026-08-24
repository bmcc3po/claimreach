// Shared search/save for the token-gated /tools/property route and the
// session-gated /m6/property rail. One property stack.

import { supabaseAdmin } from "@/lib/supabase-server";
import { applyM6LeadFilters } from "@/lib/m6-scope";
import { isM6LeadShape, TMP_SLUG } from "@/lib/m6";
import { guessBrand } from "@/lib/property-brand";
import {
  cleanLeadid, flattenIdentification, lawrulerPasteBlock, normalizeStay,
  propertyLookupKeys, type BrandHistoryEntry, type IdentifiedProperty,
} from "@/lib/property-tool";
import { runBrandHunt } from "@/lib/property-hunt";
export { searchProperties } from "@/lib/property-search";

const CANON_SELECT = "name, street, city, state, zip, address, lat, lng, current_brand, brand_history";
const LINK_SELECT = `id, remembered_brand, current_brand, brand_mismatch, stay_from, stay_to, properties_canonical (${CANON_SELECT})`;

export async function tmpPropertyFirmId(): Promise<string | null> {
  try {
    const admin = supabaseAdmin();
    const { data } = await admin.from("firms").select("id").eq("slug", TMP_SLUG).maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadCanonicalByPlaceId(firmId: string, placeId: string) {
  try {
    const admin = supabaseAdmin();
    const { data } = await admin.from("properties_canonical")
      .select("id, name, street, city, state, zip, address, current_brand, brand_history")
      .eq("firm_id", firmId)
      .eq("place_id", placeId)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function listPropertiesForLead(firmId: string, leadid: string | string[]) {
  const keys = (Array.isArray(leadid) ? leadid : [leadid]).map(cleanLeadid).filter(Boolean);
  if (!keys.length) return { error: null, rows: [] as IdentifiedProperty[] };
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.from("property_identifications")
      .select(LINK_SELECT)
      .eq("firm_id", firmId)
      .in("lawruler_leadid", keys)
      .order("created_at", { ascending: true });
    if (error) return { error: error.message, rows: [] as IdentifiedProperty[] };
    return { error: null, rows: (data ?? []).map((r: any) => flattenIdentification(r)) };
  } catch (e: any) {
    return { error: e?.message || "Could not load properties.", rows: [] as IdentifiedProperty[] };
  }
}

// Same rows /m6 writes. Staff /leads/[id] and the m6 file both call this.
export async function loadIdentifiedForLead(
  sb: any,
  firmId: string | null | undefined,
  lead: { id?: string | null; external_id?: string | null; lawruler_ref_no?: string | null },
): Promise<IdentifiedProperty[]> {
  const keys = propertyLookupKeys(lead);
  if (!firmId || !keys.length) return [];
  try {
    const { data, error } = await sb.from("property_identifications")
      .select(LINK_SELECT)
      .eq("firm_id", firmId)
      .in("lawruler_leadid", keys)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map((r: any) => flattenIdentification(r));
  } catch {
    return [];
  }
}

const LEAD_RESOLVE = "id, firm_id, campaign, case_type, archived_at, external_id, lawruler_ref_no, lead_no, property_name, property_street, property_city, property_state, property_zip";

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
    .or(`external_id.eq.${id},lawruler_ref_no.eq.${id},lead_no.eq.${id}`)
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

export async function saveBrandHistory(firmId: string, b: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const placeId = typeof b.place_id === "string" ? b.place_id.trim() : "";
  if (!placeId) return { status: 400 as const, error: "Pick a property." };
  const year = Number(b.year);
  if (!Number.isFinite(year) || year < 1980 || year > 2100) {
    return { status: 400 as const, error: "Enter a stay year." };
  }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const street = typeof b.street === "string" ? b.street.trim() : "";
  const city = typeof b.city === "string" ? b.city.trim() : "";
  const state = typeof b.state === "string" ? b.state.trim() : "";
  const zip = typeof b.zip === "string" ? b.zip.trim() : "";
  const address = typeof b.address === "string" ? b.address.trim() : [street, city, state, zip].filter(Boolean).join(", ");
  const currentBrand = (typeof b.current_brand === "string" && b.current_brand.trim()) || guessBrand(name) || null;
  const entry: BrandHistoryEntry = {
    brand: typeof b.historical_brand === "string" ? b.historical_brand.trim() : "",
    from: year,
    to: year,
    llc: typeof b.llc === "string" ? b.llc.trim() : "",
    owner: typeof b.owner === "string" ? b.owner.trim() : "",
    address: typeof b.llc_address === "string" ? b.llc_address.trim() : "",
    source: "desk",
  };
  if (!entry.brand && !entry.llc && !entry.owner && !entry.address) {
    return { status: 400 as const, error: "Add the brand, LLC, or address you recorded." };
  }

  const { data: existing } = await admin.from("properties_canonical")
    .select("id, brand_history")
    .eq("firm_id", firmId)
    .eq("place_id", placeId)
    .maybeSingle();

  const prev = Array.isArray(existing?.brand_history) ? existing.brand_history as any[] : [];
  const next = [
    ...prev.filter((h) => !(Number(h?.from) === year && (h?.to == null || Number(h.to) === year))),
    entry,
  ];

  let canonicalId: string;
  if (existing?.id) {
    const { error } = await admin.from("properties_canonical").update({
      name: name || null, address: address || null, street: street || null,
      city: city || null, state: state || null, zip: zip || null,
      current_brand: currentBrand, brand_history: next,
    }).eq("id", existing.id);
    if (error) return { status: 500 as const, error: error.message };
    canonicalId = existing.id;
  } else {
    const { data: created, error } = await admin.from("properties_canonical").insert({
      firm_id: firmId, place_id: placeId, name: name || null, address: address || null,
      street: street || null, city: city || null, state: state || null, zip: zip || null,
      current_brand: currentBrand, brand_history: next,
    }).select("id").single();
    if (error || !created) return { status: 500 as const, error: error?.message || "Could not save the history." };
    canonicalId = created.id;
  }

  return {
    status: 200 as const,
    property: { id: canonicalId, name, street, city, state, zip, address, current_brand: currentBrand },
    history: next,
    recorded: entry,
    liveGoogleBrand: currentBrand,
  };
}

export async function huntBrandOwner(firmId: string, b: Record<string, unknown>) {
  const placeId = typeof b.place_id === "string" ? b.place_id.trim() : "";
  if (!placeId) return { status: 400 as const, error: "Pick a property first." };
  const year = Number(b.year);
  if (!Number.isFinite(year) || year < 1980 || year > 2100) {
    return { status: 400 as const, error: "Enter a stay year." };
  }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const city = typeof b.city === "string" ? b.city.trim() : "";
  const state = typeof b.state === "string" ? b.state.trim() : "";
  const existing = await loadCanonicalByPlaceId(firmId, placeId);
  const found = await runBrandHunt({
    year,
    name: name || existing?.name || "",
    city: city || existing?.city || "",
    state: state || existing?.state || "",
    history: existing?.brand_history,
    token: process.env.OPENCORPORATES_API_KEY,
  });
  return { status: 200 as const, ...found };
}
