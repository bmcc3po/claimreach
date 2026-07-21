// ============================================================================
// Motel property phase — the SPINE of a trafficking case.
//
// The guided intake runs this loop the moment the caller confirms they can
// identify a specific hotel/motel. Each property is chosen from the real-world
// property picker (so the firm names the right defendant), then questioned. The
// depth of questioning depends on the property's tier:
//
//   g6       Motel 6 / Studio 6 (G6 brand) — the FULL Hotel-Knowledge battery.
//            Capped at 4 fully-detailed G6 properties.
//   g6_name  A 5th+ G6 property — chooser only, we just capture the name/address.
//   nong6    A non-G6 motel where acts occurred — chooser + an ABBREVIATED set.
//
// Between properties the agent is gated: "was there another Motel 6 / Studio 6?"
// and, once G6 is done, "any non-G6 motels?". Answering the gate adds the next
// property (see the tier rules in nextTierOnG6More / handlers in GuidedIntake).
//
// buildPropertyPhase is PURE (no React) so the whole branching sequence can be
// unit-tested without a browser.
// ============================================================================

export type PropTier = "g6" | "g6_name" | "nong6";

// The abbreviated question set for a non-G6 property: enough to pin the property,
// when, how long, where, how many acts, and minor status — not the full battery.
export const ABBREV_PROPERTY_IDS = [
  "name_as_recalled", "stay_month", "stay_duration", "room_floor", "acts_count_here", "under_18",
];

export const MAX_G6_FULL = 4;

export type PhaseItem =
  | { t: "chooser"; row: number; tier: PropTier }
  | { t: "field"; row: number; fieldId: string }
  | { t: "gate"; id: "g6_more" | "g6_more_name" | "nong6_more"; label: string };

export interface PhaseFlags { g6_done?: boolean; nong6_done?: boolean }

// Tier of the property that a "yes" on the G6 gate should add: full until we hit
// the cap, then name-only.
export function nextTierOnG6More(tiers: PropTier[]): PropTier {
  const fullCount = tiers.filter((t) => t === "g6").length;
  return fullCount < MAX_G6_FULL ? "g6" : "g6_name";
}

// The ordered items of the property phase for the current property list + gate
// flags. `fullIds` is the full property-field order; `abbrevIds` the non-G6 set.
export function buildPropertyPhase(
  tiers: PropTier[],
  fullIds: string[],
  abbrevIds: string[],
  flags: PhaseFlags,
): PhaseItem[] {
  const items: PhaseItem[] = [];
  const g6Rows: number[] = [];
  const nonRows: number[] = [];
  tiers.forEach((t, i) => { (t === "nong6" ? nonRows : g6Rows).push(i); });

  // ---- G6 properties (full battery, or name-only past the cap) ----
  for (const ri of g6Rows) {
    items.push({ t: "chooser", row: ri, tier: tiers[ri] });
    if (tiers[ri] === "g6") for (const fid of fullIds) items.push({ t: "field", row: ri, fieldId: fid });
    // g6_name: chooser only, no questions.
  }

  const fullCount = tiers.filter((t) => t === "g6").length;
  if (!flags.g6_done) {
    // Still gathering G6 properties — offer the next one and stop here until the
    // agent says there are no more.
    if (fullCount < MAX_G6_FULL) {
      items.push({ t: "gate", id: "g6_more",
        label: "Was there any other Motel 6 or Studio 6 property you were forced to stay at?" });
    } else {
      items.push({ t: "gate", id: "g6_more_name",
        label: "Any other Motel 6 or Studio 6 property? We'll just note the name and location." });
    }
    return items;
  }

  // ---- Non-G6 properties (abbreviated) ----
  for (const ri of nonRows) {
    items.push({ t: "chooser", row: ri, tier: "nong6" });
    for (const fid of abbrevIds) items.push({ t: "field", row: ri, fieldId: fid });
  }
  if (!flags.nong6_done) {
    items.push({ t: "gate", id: "nong6_more",
      label: nonRows.length === 0
        ? "Are there any other motels — NOT Motel 6 brand — where you were forced to engage in acts?"
        : "Another non-Motel-6 motel where you were forced to engage in acts?" });
  }
  return items;
}
