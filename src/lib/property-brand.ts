// Current-brand guess from a Places display name. One list so intake
// PropertyLookup and the LawRuler property tool cannot drift.
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

export function brandsMismatch(
  remembered: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const a = (remembered || "").trim();
  const b = (current || "").trim();
  if (!a || !b) return false;
  return a.toLowerCase() !== b.toLowerCase();
}
