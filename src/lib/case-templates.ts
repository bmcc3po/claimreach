// ============================================================================
// ClaimReach — Case template definitions. Each case type's OPENING/CLOSING
// scripts + case-specific extras layered on the canonical spine via the engine.
// These are the prebuilt intakes agents get by default (so nobody hand-rolls
// text-field intakes). Spine + 3 mandatory gates come from the engine.
// ============================================================================
import { buildTemplate, type TemplateField } from "@/lib/template-engine";

// ---------------------------------------------------------------------------
// MVA — rebuilt from the Turnbull Law Firm intake + script (canonical-baked).
// ---------------------------------------------------------------------------
const MVA_OPENING = `"Hey [First Name], this is [Your Name] over at Turnbull Law Firm calling about the accident. I have your form right in front of me, let's get you taken care of. Just need to let you know this call may be recorded for quality assurance."

"Perfect. I'm going to walk through some questions to get your file built out, won't take long."`;

const MVA_CLOSING = `"Alright [First Name], you're in good hands. Turnbull Law Firm handles these every day. The firm works on contingency so it's zero out of pocket for you, and you only pay if there's a recovery. No retainer, no hourly bill, no invoice, ever. I'm going to send you an esign document now. I have your cell phone # as [____]. Do I have your permission to text this #? This just gets us in your corner so you don't have to deal with insurance adjusters after this call. We handle it all for you."

THREE THINGS BEFORE YOU LET THEM GO:
1. "Do not talk to the other driver's insurance company. If they call, take their name and number and tell them to contact your attorney. That's us now."
2. "Keep going to the doctor. If you're hurting, get treated. Documentation matters."
3. "Do not post anything about the accident on social media. The insurance companies look. Always."

PASSENGER REFERRAL (if someone else was in the vehicle):
"You mentioned [passenger name] was in the car with you. Are they working with an attorney yet? [If NO] Mind if I get their number and reach out? They went through the same accident, they should have the same protection. What's the best number to reach them?"`;

// MVA-specific extras NOT already in the canonical spine/preset.
// (spine already covers names, contact, dob, ssn, EC, represented gate, injuries,
//  treatment, ambulance, provider, photos, insurance carrier, etc.)
const MVA_EXTRAS: TemplateField[] = [
  { id: "mva_at_fault_self", scope: "lead", kind: "gate", gateType: "dq", label: "Were you at fault?", agentNote: "MUST BE NO. If client was at fault, DQ.", origin: "preset", vital: true },
  { id: "mva_were_injured", scope: "lead", kind: "gate", gateType: "dq", label: "Were you injured?", agentNote: "MUST BE YES. No injury = DQ.", origin: "preset", vital: true },
  { id: "mva_passengers", scope: "lead", kind: "longtext", label: "Anyone else in the vehicle? (names)", agentNote: "If yes, capture names for passenger referral after signing.", origin: "preset" },
  { id: "mva_other_driver_cited", scope: "lead", kind: "bool", label: "Was the other driver cited at fault?", origin: "preset" },
  { id: "mva_other_driver_insured", scope: "lead", kind: "bool", label: "Did the other driver have insurance?", origin: "preset" },
  { id: "mva_other_carrier", scope: "lead", kind: "text", label: "Other driver's insurance carrier + policy #", origin: "preset" },
  { id: "mva_vehicle_info", scope: "lead", kind: "text", label: "Year / make / model of your vehicle", origin: "preset" },
  { id: "mva_vehicle_owner", scope: "lead", kind: "text", label: "Who owns the vehicle you were in/driving?", origin: "preset" },
  { id: "mva_dl_number", scope: "lead", kind: "text", label: "Driver's license # and state of issue", origin: "preset" },
  { id: "mva_your_carrier", scope: "lead", kind: "text", label: "Your auto insurance carrier + policy #", origin: "preset" },
  { id: "mva_health_insurance", scope: "lead", kind: "text", label: "Health insurance carrier (if any)", origin: "preset" },
  { id: "mva_followup_advice", scope: "lead", kind: "longtext", label: "What did doctors say about follow-up treatment?", origin: "preset" },
  { id: "mva_passenger_injured", scope: "lead", kind: "bool", label: "Did anyone else in your vehicle get injured?", origin: "preset" },
  // the critical pre-wrap gate
  { id: "mva_signed_release", scope: "lead", kind: "gate", gateType: "supervisor", label: "Have you signed anything from the other driver's insurance company? Any paperwork, release, anything?", agentNote: "If YES: supervisor before proceeding, a signed release may bar the claim.", origin: "preset", vital: true },
];

// ---------------------------------------------------------------------------
// MOTEL 6 / Motel-Hotel Trafficking — canonical rebuild.
// ---------------------------------------------------------------------------
const MOTEL_OPENING = `"Thank you for taking my call. Everything we talk about is confidential. We're here to help and there's no judgment. If at any point you need to pause, just tell me. This call may be recorded for quality assurance."`;

const MOTEL_CLOSING = `"You did the hard part today. The firm will be in touch to walk you through next steps. You've got my direct line if anything comes up. Take care of yourself."`;

const MOTEL_EXTRAS: TemplateField[] = [
  { id: "motel_stop_was_hotel", scope: "lead", kind: "gate", gateType: "end_intake", label: "Did this occur at a hotel or motel?", agentNote: "If NO: end intake.", origin: "preset", vital: true },
  { id: "motel_specific_property", scope: "lead", kind: "gate", gateType: "supervisor", label: "Can you identify at least one specific hotel or motel where this occurred?", agentNote: "If NO: DQ, call supervisor before proceeding.", origin: "preset", vital: true },
  { id: "motel_property_names", scope: "lead", kind: "longtext", label: "Name(s) of the hotel/motel and city/state", origin: "preset", vital: true },
  { id: "motel_approx_dates", scope: "lead", kind: "text", label: "Approximate dates / time period", origin: "preset" },
  { id: "motel_le_involved", scope: "lead", kind: "bool", label: "Was law enforcement ever involved?", origin: "preset" },
  { id: "motel_documents", scope: "lead", kind: "multiselect", label: "Do you have any documentation?", options: ["Photos", "Messages", "Records", "Police report", "None"], origin: "preset" },
  { id: "motel_related_parties", scope: "lead", kind: "longtext", label: "Names/aliases of related parties (if known)", agentNote: "Only what the survivor offers. Do not press.", origin: "preset" },
  { id: "motel_felony_history", scope: "lead", kind: "longtext", label: "Any felony convictions during the same period? (classification only)", agentNote: "Case classification, NOT a disqualifier.", origin: "preset" },
];

export interface CaseTemplateDef { key: string; opening: string; closing: string; extras: TemplateField[]; }

export const CASE_TEMPLATE_DEFS: Record<string, CaseTemplateDef> = {
  mva: { key: "mva", opening: MVA_OPENING, closing: MVA_CLOSING, extras: MVA_EXTRAS },
  motel_trafficking: { key: "motel_trafficking", opening: MOTEL_OPENING, closing: MOTEL_CLOSING, extras: MOTEL_EXTRAS },
};

// Assemble the full prebuilt template for a case type (spine + gates + extras).
export function prebuiltTemplate(caseKey: string): TemplateField[] {
  const def = CASE_TEMPLATE_DEFS[caseKey];
  const base = buildTemplate(caseKey, { openingScript: def?.opening, closingScript: def?.closing });
  if (!def) return base;
  // splice the case-specific extras into the "case specifics" section the engine made
  // (engine already appended preset.extras from canonical-fields; these hand-authored
  //  extras are richer, so we APPEND them after, deduping by id)
  const have = new Set(base.map((f) => f.id));
  const extra = def.extras.filter((e) => !have.has(e.id));
  return [...base, ...extra];
}
