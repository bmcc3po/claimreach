import { joinUsAddress } from "./us-address";
export type ParsedAddress = { addr1: string; city: string; state: string; zip: string };
export type PlaceCandidate = { place_id?: string; address?: string; city_state?: string; parsed?: ParsedAddress };

// Google often returns the building without the unit the caller typed.
export function pickedAddress(candidate: PlaceCandidate, typed: string): ParsedAddress | undefined {
  if (!candidate.parsed?.addr1) return undefined;
  const result = { ...candidate.parsed };
  const unitPattern = /(?:\b(?:apt|apartment|unit|suite|ste|bldg|floor)\b\.?\s*|#\s*)[\w-]+\b/i;
  const unit = typed.match(unitPattern)?.[0];
  if (unit && !unitPattern.test(result.addr1)) result.addr1 += `, ${unit}`;
  return result;
}

export function placeText(candidate: PlaceCandidate, kind: "address" | "city", typed: string, streetOnly = false): string {
  if (kind === "city") return candidate.city_state || "";
  const parsed = pickedAddress(candidate, typed);
  if (streetOnly) return parsed?.addr1 || "";
  return parsed ? joinUsAddress({ street: parsed.addr1, city: parsed.city, state: parsed.state, zip: parsed.zip }) : (candidate.address || "").replace(/,\s*(USA|United States)$/i, "");
}

