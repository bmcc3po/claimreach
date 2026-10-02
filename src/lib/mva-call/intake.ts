// ============================================================================
// The intake map: which questions belong to which section, the order a guided
// call asks them in, and which ones must be answered. Data only. The engine
// (engine.ts) owns the answers and the branching; every view (Guided, Full
// Intake, and the ones to come) reads this one map, so a question can never be
// in one view and missing from another.
//
// Question ids are the engine's own keys: story.* for the crash, body.* for
// the body questions, file.* and car.* where the answer already lives.
// ============================================================================

export type SectionId = "incident" | "injury" | "treatment" | "insurance" | "vehicle";

export interface IntakeSection {
  id: SectionId;
  label: string;
  /** Questions shown in this section, top to bottom. */
  questions: string[];
}

export const INTAKE_SECTIONS: IntakeSection[] = [
  { id: "incident", label: "Incident", questions: ["notes", "city", "when", "seat", "fault", "police", "report"] },
  { id: "injury", label: "Injury", questions: ["pain", "work"] },
  { id: "treatment", label: "Treatment", questions: ["seen", "providers", "firstAt", "lastAt", "stretch", "willing"] },
  { id: "insurance", label: "Insurance", questions: ["carrier", "exchanged", "coverage", "uim", "check", "rep"] },
  { id: "vehicle", label: "Vehicle", questions: ["people", "car"] },
];

/** The order a guided call asks in. "Next unanswered" walks this list. */
export const INTAKE_SEQUENCE = [
  "city", "when", "seat", "fault", "police",
  "pain", "seen", "firstAt", "lastAt", "stretch", "willing", "work",
  "exchanged", "coverage", "uim", "check", "rep",
  "people",
];

/** Captured when she says it, never chased: they do not hold a section open. */
export const INTAKE_OPTIONAL = new Set(["report", "providers", "carrier", "car", "notes"]);

export function sectionOf(qid: string): SectionId | null {
  const s = INTAKE_SECTIONS.find((x) => x.questions.includes(qid));
  return s ? s.id : null;
}
