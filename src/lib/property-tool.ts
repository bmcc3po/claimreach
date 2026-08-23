// Token gate + LawRuler paste helpers for /tools/property.
// Fail closed: empty env or missing/wrong k is a miss. Constant-time compare
// matches the LawRuler webhook so a length mismatch cannot short-circuit
// into a leak of the configured key.

import { joinStayMonth, splitStayMonth } from "@/lib/claim-properties";

export const PROPERTY_TOOL_ENV = "PROPERTY_TOOL_KEY";

export function propertyToolKeyOk(got: string | null | undefined, want = process.env.PROPERTY_TOOL_KEY): boolean {
  if (!want) return false;
  if (!got) return false;
  const accepted = want.split(",").map((s) => s.trim()).filter(Boolean);
  let ok = false;
  for (const a of accepted) {
    if (a.length !== got.length) continue;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ got.charCodeAt(i);
    if (diff === 0) ok = true;
  }
  return ok;
}

export function cleanLeadid(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).trim().replace(/^[#{}]+|[}]+$/g, "").slice(0, 80);
}

export function propertyLookupKeys(lead: {
  id?: string | null;
  external_id?: string | null;
  lawruler_ref_no?: string | null;
}): string[] {
  return [...new Set(
    [lead.external_id, lead.lawruler_ref_no, lead.id]
      .map((v) => cleanLeadid(v))
      .filter(Boolean),
  )];
}

export function propertyFileHref(lead: {
  id: string;
  external_id?: string | null;
  lawruler_ref_no?: string | null;
}): string {
  const key = cleanLeadid(lead.external_id || lead.lawruler_ref_no || lead.id);
  return `/m6/property?leadid=${encodeURIComponent(key)}`;
}

export function normalizeStay(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const { month, year } = splitStayMonth(trimmed);
  return joinStayMonth(month, year) || trimmed;
}

export function lawrulerPasteBlock(p: {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [
    `Property name: ${p.name ?? ""}`,
    `Street: ${p.street ?? ""}`,
    `City: ${p.city ?? ""}`,
    `State: ${p.state ?? ""}`,
    `Zip: ${p.zip ?? ""}`,
  ].join("\n");
}

export function stayRangeLabel(from: string | null | undefined, to: string | null | undefined): string {
  const a = (from || "").trim();
  const b = (to || "").trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}

export type IdentifiedProperty = {
  id: string;
  remembered_brand: string | null;
  current_brand: string | null;
  brand_mismatch: boolean;
  stay_from: string | null;
  stay_to: string | null;
  name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export function flattenIdentification(row: {
  id: string;
  remembered_brand: string | null;
  current_brand: string | null;
  brand_mismatch: boolean | null;
  stay_from: string | null;
  stay_to: string | null;
  properties_canonical?: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    current_brand?: string | null;
  } | {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    current_brand?: string | null;
  }[] | null;
}): IdentifiedProperty {
  const canon = Array.isArray(row.properties_canonical)
    ? row.properties_canonical[0]
    : row.properties_canonical;
  return {
    id: row.id,
    remembered_brand: row.remembered_brand,
    current_brand: row.current_brand ?? canon?.current_brand ?? null,
    brand_mismatch: !!row.brand_mismatch,
    stay_from: row.stay_from,
    stay_to: row.stay_to,
    name: canon?.name ?? null,
    street: canon?.street ?? null,
    city: canon?.city ?? null,
    state: canon?.state ?? null,
    zip: canon?.zip ?? null,
    address: canon?.address ?? null,
    lat: canon?.lat ?? null,
    lng: canon?.lng ?? null,
  };
}
