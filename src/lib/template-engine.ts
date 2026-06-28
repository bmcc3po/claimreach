// ============================================================================
// ClaimReach — Template Engine. Builds a full intake template for a case type:
//   [opening script] + LOCKED canonical spine + 3 mandatory gates + preset extras
// Every spine field carries locking metadata so the builder can enforce:
//   - owner-only delete on spine
//   - managers reorder spine + hide OPTIONAL spine fields (not delete)
//   - managers add/edit/delete their OWN custom fields
//   - the 3 mandatory gates can never be removed by anyone
// ============================================================================
import type { Field } from "@/lib/questionnaire";
import { SPINE, PRESET_BY_KEY, type CanonField } from "@/lib/canonical-fields";

export interface TemplateField extends Field {
  locked?: boolean;             // part of canonical spine (owner-only delete)
  origin?: "spine" | "preset" | "custom" | "script";
  mandatoryGate?: boolean;      // the 3 always-on gates — nobody deletes
  hidden?: boolean;             // manager hid an optional spine field
  canonId?: string;             // the canonical id this maps to
  added_by?: string;            // uid of who added a custom field
}

// The 3 gates that ship on EVERY template, baked in, never removable.
const MANDATORY_GATES: TemplateField[] = [
  {
    id: "currently_represented", scope: "lead", kind: "gate", gateType: "dq",
    label: "Are you currently represented by another attorney for this matter?",
    agentNote: "If YES: DQ unless they have dropped that firm + drop letter + supervisor approval. Three isolated, non-leading questions only.",
    locked: true, origin: "spine", mandatoryGate: true, canonId: "currently_represented", vital: true,
  },
  {
    id: "signing_for_self", scope: "lead", kind: "gate", gateType: "dq",
    label: "Are you the injured party?",
    agentNote: "If NO: confirm legal authority (POA / next of kin / guardian / executor) before continuing. If no authority, instruct the legal rep to call us direct.",
    locked: true, origin: "spine", mandatoryGate: true, canonId: "signing_for_self", vital: true,
  },
  {
    id: "has_authority", scope: "lead", kind: "gate", gateType: "dq",
    label: "Do you have the authority to take legal action on this claim?",
    agentNote: "Self = yes. Otherwise capacity must be POA / NOK / Guardian / Executor / Conservator. Capture which under Authority.",
    locked: true, origin: "spine", mandatoryGate: true, canonId: "capacity", vital: true,
  },
];

// Map a canonical field to a renderable Field, marked locked/spine.
function canonToField(c: CanonField, origin: "spine" | "preset"): TemplateField {
  return {
    id: c.id, scope: "lead", kind: c.kind, label: c.label,
    options: c.options, vital: c.vital, gateType: c.gateType,
    locked: origin === "spine", origin, canonId: c.id,
  };
}

// Spine fields grouped into readable sections (so the form isn't a flat wall).
const GROUP_SECTIONS: { group: CanonField["group"]; title: string }[] = [
  { group: "routing", title: "Record / Routing" },
  { group: "identity", title: "Claimant Identity" },
  { group: "contact", title: "Contact" },
  { group: "authority", title: "Representation / Authority" },
  { group: "incident", title: "Incident / Injury" },
  { group: "treatment", title: "Treatment" },
  { group: "gates", title: "Eligibility" },
  { group: "damages", title: "Damages" },
  { group: "emergency", title: "Emergency Contact" },
  { group: "insurance", title: "Insurance / Policy" },
];

function sectionField(title: string): TemplateField {
  return { id: `sec_${title.toLowerCase().replace(/[^a-z]+/g, "_")}`, scope: "lead", kind: "section", label: title, locked: true, origin: "spine" };
}

// Build the full template: optional opening script + spine (sectioned, gates folded
// into Eligibility) + preset extras section. Returns Field[] ready to store/render.
export function buildTemplate(caseKey: string, opts?: { openingScript?: string; closingScript?: string }): TemplateField[] {
  const out: TemplateField[] = [];

  if (opts?.openingScript) {
    out.push({ id: "script_opening", scope: "lead", kind: "script", label: "Opening", script: opts.openingScript, locked: true, origin: "script" });
  }

  // mandatory gates lead the eligibility-critical part, surfaced early
  // (we place them right after identity/contact so the agent confirms authority fast)
  const gatesPlaced = new Set<string>();

  for (const sec of GROUP_SECTIONS) {
    const fields = SPINE.filter((f) => f.group === sec.group);
    if (fields.length === 0 && sec.group !== "gates") continue;

    out.push(sectionField(sec.title));

    if (sec.group === "gates") {
      // mandatory gates first, then the rest of the eligibility spine
      for (const g of MANDATORY_GATES) { out.push(g); gatesPlaced.add(g.canonId || g.id); }
    }
    for (const f of fields) {
      // skip canonical fields already represented by a mandatory gate
      if (gatesPlaced.has(f.id)) continue;
      out.push(canonToField(f, "spine"));
    }
  }

  // case-specific preset extras in their own section
  const preset = PRESET_BY_KEY[caseKey];
  if (preset && preset.extras.length) {
    out.push(sectionField(`${preset.label} — case specifics`));
    for (const e of preset.extras) out.push(canonToField(e, "preset"));
  }

  if (opts?.closingScript) {
    out.push({ id: "script_closing", scope: "lead", kind: "script", label: "Closing", script: opts.closingScript, locked: true, origin: "script" });
  }

  return out;
}

// Permission helpers used by the builder UI + save API.
export function canDeleteField(role: string, f: TemplateField, uid?: string): boolean {
  if (f.mandatoryGate) return false;                 // never
  if (f.origin === "custom") return role === "owner" || role === "admin" || f.added_by === uid; // own custom
  if (f.locked || f.origin === "spine") return role === "owner"; // owner-only on spine
  return role === "owner" || role === "admin";
}
export function canHideField(role: string, f: TemplateField): boolean {
  if (f.mandatoryGate) return false;
  if (f.origin === "spine" || f.locked) return ["owner", "admin", "manager"].includes(role); // managers hide optional spine
  return true;
}
export function canReorder(role: string): boolean {
  return ["owner", "admin", "manager"].includes(role);
}
