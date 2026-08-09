// Dual-grade tiering.
// Trafficking: letter A-F = severity (A worst), number 1-5 = motel knowledge (1 strongest).
// Med Mal: number 1-5 = combined strength (1 strongest), no letter.

export const SEVERITY_LETTERS = ["A", "B", "C", "D", "E", "F"];
export const EVIDENCE_NUMBERS = [1, 2, 3, 4, 5];

export const SEVERITY_DESC: Record<string, string> = {
  A: "Catastrophic — e.g. underage, multiple perpetrators, prolonged physical & sexual abuse",
  B: "Severe",
  C: "Serious",
  D: "Moderate",
  E: "Limited",
  F: "Minimal",
};
export const EVIDENCE_DESC: Record<number, string> = {
  1: "Strongest — overt signs staff knew (lobby assault, police called, men at all hours)",
  2: "Strong",
  3: "Moderate",
  4: "Generic / weak",
  5: "Minimal property knowledge",
};

export function isTrafficking(claimType?: string) {
  const t = (claimType || "").toLowerCase();
  return t.includes("traffick") || t.includes("motel") || t.includes("hotel");
}

export function tierLabel(letter?: string | null, number?: number | null, claimType?: string): string {
  if (isTrafficking(claimType)) {
    if (!letter && !number) return "—";
    return `${letter ?? "?"}${number ?? "?"}`;
  }
  return number ? `T${number}` : "—";
}

// Color by overall strength (best = green, weak = grey/red).
export function tierTone(letter?: string | null, number?: number | null): string {
  const sev = letter ? SEVERITY_LETTERS.indexOf(letter) : 2; // 0=A best
  const ev = number ? number - 1 : 2; // 0=1 best
  const score = sev + ev; // lower = stronger
  if (score <= 1) return "signed";   // green — top case
  if (score <= 3) return "gold";     // gold — strong
  if (score <= 5) return "stage";    // neutral
  return "flag";                      // weak
}
