// ============================================================================
// SUBTYPE DERIVATION
//
// The agent never classifies the case. They mark what the caller described, in
// the caller's own words, and the subtype falls out of it.
//
// Asking an agent to pick "Negligent Security" or "Premises Liability" mid-call
// is asking them to make a legal call under time pressure, and they will get it
// wrong in both directions: a parking-lot assault filed as a slip and fall, a
// store fall filed as general premises. Both land in the wrong bucket at
// Lexamica, and a wrong bucket is never referred out.
//
// So there are two plain questions. What happened, and where. Everything else
// is computed.
//
//   what_happened_type   what the caller experienced
//   incident_setting     where it happened (only asked when it changes the answer)
//   -> case_subtype      computed, never typed
//
// case_subtype then drives which branch of questions appears AND what goes in
// Lexamica's PracticeArea, so the two can never disagree.
// ============================================================================

export type Subtype =
  | "mva" | "general" | "dogbite" | "workplace" | "workcomp" | "pedestrian"
  | "commprop" | "construct" | "medmal" | "prodliab" | "nursing" | "referout";

/** Caller-language options for "what happened". No legal terms. */
export const INCIDENT_TYPES = [
  { value: "vehicle",     label: "I was in a vehicle that was hit, or I hit something" },
  { value: "struck_ped",  label: "I was hit by a vehicle while walking, running, or on a bicycle" },
  { value: "dog",         label: "A dog or other animal bit or attacked me" },
  { value: "fall",        label: "I slipped, tripped, or fell" },
  { value: "falling_obj", label: "Something fell on me, or I was struck by an object" },
  { value: "attacked",    label: "I was attacked, robbed, or assaulted by a person" },
  { value: "drunk",       label: "Someone who had been drinking caused this" },
  { value: "work",        label: "I was hurt while working, on the job" },
  { value: "medical",     label: "A doctor, hospital, or medical provider caused harm" },
  { value: "product",     label: "A product broke, malfunctioned, or caused an injury" },
  { value: "facility",    label: "Someone in a nursing home or care facility was harmed" },
  { value: "other",       label: "None of these" },
];

/** Where it happened. Only asked when the setting changes the subtype. */
export const INCIDENT_SETTINGS = [
  { value: "business",    label: "At a store, restaurant, hotel, gas station, or other business" },
  { value: "apartment",   label: "At an apartment complex or rental property" },
  { value: "residence",   label: "At a private home or residence" },
  { value: "construction",label: "On a construction site" },
  { value: "workplace",   label: "At my own workplace, while working" },
  { value: "public",      label: "On public or government property, including a sidewalk or park" },
  { value: "other",       label: "Somewhere else" },
];

/** The setting question only appears when it would actually change the routing. */
export const SETTING_APPLIES = ["fall", "falling_obj", "attacked", "drunk"];

/**
 * The whole routing table, in one place.
 *
 * A note on two that look surprising:
 *
 * An ASSAULT is not its own subtype. It is a premises case, because the claim is
 * against the property owner for inadequate security, not against the attacker.
 * The negligent security questions live on the general branch and open from
 * general_incident_kind.
 *
 * WORK is routed to `workplace`, never straight to `workcomp`. Whether it is a
 * comp claim or a third-party claim depends on who else was involved, which is
 * question W6 on that branch. Deciding it here would pre-empt the question that
 * exists to decide it.
 */
export function deriveSubtype(a: Record<string, unknown>): Subtype | null {
  const what = String(a.what_happened_type ?? "").trim();
  const where = String(a.incident_setting ?? "").trim();
  if (!what) return null;

  switch (what) {
    case "vehicle":    return "mva";
    case "struck_ped": return "pedestrian";
    case "dog":        return "dogbite";
    case "medical":    return "medmal";
    case "product":    return "prodliab";
    case "facility":   return "nursing";
    case "work":       return "workplace";
    case "other":      return "referout";

    case "fall":
    case "falling_obj":
    case "attacked":
    case "drunk": {
      if (!where) return null;                 // cannot route yet, ask the setting
      if (where === "construction") return "construct";
      if (where === "workplace")    return "workplace";
      if (where === "business")     return what === "fall" || what === "falling_obj"
                                              ? "commprop" : "general";
      return "general";                        // apartment, residence, public, other
    }
    default: return null;
  }
}

/**
 * Which block of the general branch to open. The general branch carries three
 * distinct question sets and only one of them belongs on any given call.
 */
export function deriveGeneralBlock(a: Record<string, unknown>): string | null {
  const what = String(a.what_happened_type ?? "").trim();
  if (what === "fall" || what === "falling_obj") return "fall_or_hazard";
  if (what === "attacked") return "assault";
  if (what === "drunk") return "dram_shop";
  return null;
}

/** Human label for a computed subtype, for the agent-facing confirmation line. */
export const SUBTYPE_LABEL: Record<Subtype, string> = {
  mva: "Motor vehicle accident",
  general: "Personal injury",
  dogbite: "Dog bite",
  workplace: "Workplace injury",
  workcomp: "Workers compensation",
  pedestrian: "Pedestrian injury",
  commprop: "Commercial property injury",
  construct: "Construction accident",
  medmal: "Medical malpractice",
  prodliab: "Product liability",
  nursing: "Nursing home injury",
  referout: "Not a case type we handle",
};
