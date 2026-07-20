import type { Field } from "./questionnaire";

// ============================================================================
// THE SPINE
//
// Every intake in ClaimReach is the same backbone with a different middle. Before
// this existed, the Motel intake had 21 sections, the generic fallback had 2, and
// the MVA form had 1 — three intakes with three unrelated skeletons, so nothing
// was reportable across case types and every new campaign was authored from
// scratch.
//
// A case type composes its form as: spine blocks + its own criteria. Where a case
// type asks a spine topic its own way (the MVA tree asks injuries and treatment
// inside its criteria), it SKIPS that block rather than asking twice.
//
// `group` marks fields that belong on one screen in the guided runner. Capture
// blocks (address, insurance, vehicle) are grouped; criteria questions never are,
// because those must be asked one at a time, in order, verbatim.
// ============================================================================

export type SpineBlockKey =
  | "opening" | "gates" | "injured_party" | "caller" | "address"
  | "emergency" | "incident" | "injuries" | "insurance" | "history" | "closing";

const S = (id: string, label: string): Field => ({ id, scope: "lead", kind: "section", label });

export const SPINE_BLOCKS: Record<SpineBlockKey, Field[]> = {
  opening: [
    S("s_opening", "Opening"),
    { id: "script_open", scope: "lead", kind: "script", label: "Intro (read verbatim)",
      script: "Thank you. My name is ___. I'm calling from the law firm handling your claim. Is now a good time to go through this with you?",
      agentNote: "If now is not a good time, schedule the callback and stop here." },
    { id: "ok_to_proceed", scope: "lead", kind: "bool", label: "Is now a good time to proceed?",
      agentNote: "If no, schedule the callback. Do not run the intake." },
  ],

  // The three questions that decide whether there is a file at all.
  gates: [
    S("s_gates", "Mandatory gates"),
    { id: "g_represented", scope: "lead", kind: "gate", gateType: "dq", vital: true,
      label: "Are you already represented by another attorney for this matter?",
      agentNote: "If YES this is a disqualifier. Do not proceed." },
    { id: "g_injured_party", scope: "lead", kind: "bool", vital: true,
      label: "Am I speaking with the injured party?" },
    { id: "g_authority", scope: "lead", kind: "bool", vital: true,
      label: "Do you have legal authority to act on their behalf?",
      agentNote: "Power of attorney, parent, legal guardian, or executor.",
      showIf: { match: "all", rules: [{ fieldId: "g_injured_party", op: "is", value: "no" }] } },
  ],

  injured_party: [
    S("s_injured_party", "Injured party"),
    { id: "ip_first_name", scope: "lead", kind: "text", label: "Injured party's legal first name", vital: true },
    { id: "ip_last_name", scope: "lead", kind: "text", label: "Injured party's legal last name", vital: true },
    { id: "ip_dob", scope: "lead", kind: "date", label: "Injured party's date of birth", vital: true },
    { id: "ip_phone", scope: "lead", kind: "phone", label: "Best phone number", vital: true },
    { id: "ip_email", scope: "lead", kind: "email", label: "Email address" },
  ],

  // Only asked when the caller is not the injured party.
  caller: [
    S("s_caller", "Caller"),
    { id: "caller_name", scope: "lead", kind: "text", label: "Caller's full name", group: "caller",
      showIf: { match: "all", rules: [{ fieldId: "g_injured_party", op: "is", value: "no" }] } },
    { id: "caller_phone", scope: "lead", kind: "phone", label: "Caller's phone", group: "caller",
      showIf: { match: "all", rules: [{ fieldId: "g_injured_party", op: "is", value: "no" }] } },
    { id: "caller_relationship", scope: "lead", kind: "text", label: "Relationship to the injured party", group: "caller",
      showIf: { match: "all", rules: [{ fieldId: "g_injured_party", op: "is", value: "no" }] } },
  ],

  address: [
    S("s_address", "Mailing address"),
    { id: "mail_addr1", scope: "lead", kind: "text", label: "Street address", group: "address" },
    { id: "mail_city", scope: "lead", kind: "text", label: "City", group: "address" },
    { id: "mail_state", scope: "lead", kind: "text", label: "State", group: "address" },
    { id: "mail_zip", scope: "lead", kind: "text", label: "ZIP", group: "address" },
  ],

  emergency: [
    S("s_emergency", "Emergency contact"),
    { id: "ec_name", scope: "lead", kind: "text", label: "Emergency contact name", group: "emergency" },
    { id: "ec_phone", scope: "lead", kind: "phone", label: "Emergency contact phone", group: "emergency" },
    { id: "ec_relationship", scope: "lead", kind: "text", label: "Relationship", group: "emergency" },
  ],

  incident: [
    S("s_incident", "The incident"),
    { id: "incident_date", scope: "lead", kind: "date", label: "What date did this happen?", vital: true },
    { id: "incident_state", scope: "lead", kind: "text", label: "What state did this happen in?", vital: true },
    { id: "incident_narrative", scope: "lead", kind: "longtext",
      label: "In your own words, tell me what happened.",
      agentNote: "Capture it in their words. Do not lead, do not summarize for them." },
  ],

  injuries: [
    S("s_injuries", "Injuries and treatment"),
    { id: "injury_desc", scope: "lead", kind: "longtext", label: "What injuries are you dealing with?" },
    { id: "treatment_status", scope: "lead", kind: "select", label: "Where are you at with treatment?",
      options: ["Never been seen", "Been seen once", "Still treating", "Finished treatment", "Stopped treating"] },
    { id: "medical_bills", scope: "lead", kind: "select", label: "Roughly what are your medical bills so far?",
      agentNote: "Do not read these ranges aloud. Ask open, then tap the range.",
      options: ["Nothing yet", "Under $10,000", "$10,000 to $50,000", "Over $50,000", "Not sure"] },
  ],

  insurance: [
    S("s_insurance", "Insurance"),
    { id: "health_insurance", scope: "lead", kind: "text", label: "Health insurance carrier", group: "insurance", ref: "health_carrier" },
    { id: "own_carrier", scope: "lead", kind: "text", label: "Their own insurance carrier", group: "insurance", ref: "auto_carrier" },
    { id: "other_carrier", scope: "lead", kind: "text", label: "The other party's carrier", group: "insurance", ref: "auto_carrier" },
  ],

  history: [
    S("s_history", "History"),
    { id: "prior_claims", scope: "lead", kind: "bool", label: "Have you made a personal injury claim before?" },
    { id: "prior_attorney", scope: "lead", kind: "text", label: "Which firm handled it?",
      showIf: { match: "all", rules: [{ fieldId: "prior_claims", op: "is", value: "yes" }] } },
  ],

  closing: [
    S("s_closing", "Closing"),
    { id: "best_time", scope: "lead", kind: "text", label: "Best time to reach you" },
    { id: "ok_to_leave_message", scope: "lead", kind: "bool", label: "Is it okay to leave a voicemail at this number?" },
    { id: "script_close", scope: "lead", kind: "script", label: "Close (read verbatim)",
      script: "That is everything I need. Thank you for your time today, and take care of yourself." },
  ],
};

// Default order. A campaign can reorder or skip, but this is the shape.
export const DEFAULT_SPINE_ORDER: SpineBlockKey[] = [
  "opening", "gates", "injured_party", "caller", "address", "emergency",
  "incident", "injuries", "insurance", "history", "closing",
];

export interface ComposeOptions {
  criteria?: Field[];                 // the case-specific middle
  criteriaAfter?: SpineBlockKey;      // where the middle slots in (default: emergency)
  skip?: SpineBlockKey[];             // blocks this case type handles inside its own criteria
  order?: SpineBlockKey[];
}

// Assemble a complete intake: spine + this case type's criteria.
export function composeForm(opts: ComposeOptions = {}): Field[] {
  const order = opts.order ?? DEFAULT_SPINE_ORDER;
  const skip = new Set(opts.skip ?? []);
  const after = opts.criteriaAfter ?? "emergency";
  const out: Field[] = [];
  for (const key of order) {
    if (!skip.has(key)) out.push(...SPINE_BLOCKS[key]);
    if (key === after && opts.criteria?.length) out.push(...opts.criteria);
  }
  return out;
}

// Which spine blocks a case type's own criteria already cover.
export const CASE_TYPE_SKIPS: Record<string, SpineBlockKey[]> = {
  // The MVA tree asks injuries, treatment and bills itself, in a specific order
  // that drives routing, so the generic block would ask them a second time.
  mva: ["injuries"],
  prem: ["injuries"],
};
