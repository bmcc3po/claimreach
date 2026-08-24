// Current-brand guess from a Places display name. One list so intake
// PropertyLookup (intake) and /m6/property cannot drift.
// Studio 6 is a G6 flag of its own — check it, not only Motel 6.

const BRANDS = [
  "Motel 6",
  "Studio 6",
  "Red Roof",
  "Super 8",
  "Days Inn",
  "Best Western",
  "Econo Lodge",
  "Travelodge",
  "Rodeway",
  "Quality Inn",
  "Comfort Inn",
  "Knights Inn",
  "Howard Johnson",
  "Extended Stay",
  "La Quinta",
  "Budget Inn",
  "Americas Best Value",
];

export function guessBrand(name: string | null | undefined): string {
  const n = (name || "").toLowerCase();
  if (!n) return "";
  for (const b of BRANDS) if (n.includes(b.toLowerCase())) return b;
  return "";
}

// Motel 6 campaign lock. Studio 6 is a G6 flag. Do not treat every motel as a hit.
const G6_RE = /(?:motel\s*6|studio\s*6|\bg6(?:\s*hospitality)?\b)/i;

export function isG6Property(p: {
  name?: string | null;
  address?: string | null;
  current_brand?: string | null;
  brand?: string | null;
  types?: string[] | null;
}): boolean {
  const bits = [p.name, p.address, p.current_brand, p.brand, ...(p.types ?? [])]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ");
  return G6_RE.test(bits);
}

export function brandsMismatch(
  remembered: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const a = (remembered || "").trim();
  const b = (current || "").trim();
  if (!a || !b) return false;
  return a.toLowerCase() !== b.toLowerCase();
}
