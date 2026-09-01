// ============================================================================
// CONSOLE QUESTIONS -> SPINE FORM DATA
//
// The console's questions live in code (questions.ts) and the rest of the
// platform stores questions as data (intake_forms.fields). That is two
// definitions of the same thing, which is the bug class behind every case type
// problem we have had, so the code definition is being retired.
//
// This module converts one into the other WITHOUT reinterpreting it. Every
// script, agent note, per-option note, lookup and conditional is carried across
// verbatim. Nothing here invents content: if a question is wrong, it is wrong in
// questions.ts and gets fixed there until that file is retired.
//
// The conditional rules below are a transcription of questionApplies() in
// engine.ts. They are asserted equal by parity.test.ts across a matrix of answer
// states, so a divergence fails a test rather than silently changing what an
// agent is asked.
// ============================================================================
import type { Field, ShowIf } from "../questionnaire";
import type { CaseTypeKey } from "./engine";
import { questionsFor, type Question } from "./questions";

// Transcribed from engine.ts. Kept as literals rather than imported so a change
// to the engine surfaces as a failing parity test instead of silently rewriting
// the stored form.
const REFERRAL_SOURCES = ["ref_attorney", "ref_friend", "ref_firm", "ref_marketing", "other"];

const is = (fieldId: string, value: string): ShowIf => ({ match: "all", rules: [{ fieldId, op: "is", value }] });
const all = (...rules: ShowIf["rules"]): ShowIf => ({ match: "all", rules });

// questionApplies(), expressed as data. Keyed by case type then question key.
const SHOW_IF: Record<string, Record<string, ShowIf>> = {
  mva: {
    poa: is("authority", "alive"),
    injuries: is("injured", "yes"),
    surgery: is("injured", "yes"),
    hosp: is("injured", "yes"),
    treatment: is("injured", "yes"),
    bills: is("injured", "yes"),
    police_agency: is("police_report", "yes"),
    police_report_number: is("police_report", "yes"),
    willing_more: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "any_of", values: ["finished", "stopped"] },
    ),
    willing: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "is", value: "never" },
    ),
    commit_appointment: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "is", value: "never" },
      { fieldId: "willing", op: "is", value: "yes" },
      { fieldId: "date_bucket", op: "is", value: "mid" },
    ),
    treatment_followup: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "not_blank" },
      { fieldId: "treatment", op: "is_not", value: "never" },
    ),
    referral_source: { match: "all", rules: [{ fieldId: "how_found_us", op: "any_of", values: REFERRAL_SOURCES }] },
    auto_policy_id: is("ins_own", "yes"),
    others_names: is("others_in_vehicle", "yes"),
    others_injured: is("others_in_vehicle", "yes"),
    others_injured_contact: is("others_injured", "yes"),
    others_need_help: is("others_injured", "yes"),
    ins_forms_signed: is("ins_forms", "yes"),
    ins_forms_said: is("ins_forms_signed", "yes"),
    attorney_consult: { match: "all", rules: [{ fieldId: "attorney", op: "is_not", value: "yes" }] },
    pending_legal: { match: "all", rules: [{ fieldId: "attorney", op: "is_not", value: "yes" }] },
  },
  prem: {
    injuries: is("injured", "yes"),
    surgery: is("injured", "yes"),
    treatment: is("injured", "yes"),
    bills: is("injured", "yes"),
    police_agency: is("police_report", "yes"),
    police_report_number: is("police_report", "yes"),
    willing_more: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "any_of", values: ["finished", "stopped"] },
    ),
    willing: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "is", value: "never" },
    ),
    commit_appointment: all(
      { fieldId: "injured", op: "is", value: "yes" },
      { fieldId: "treatment", op: "is", value: "never" },
      { fieldId: "willing", op: "is", value: "yes" },
      { fieldId: "date_bucket", op: "is", value: "mid" },
    ),
  },
};

function kindFor(q: Question): Field["kind"] {
  if (q.kind === "single") return "select";
  if (q.kind === "multi") return "multiselect";
  if (q.kind === "date") return "date";
  if (q.kind === "time") return "time";
  return q.multiline ? "longtext" : "text";
}

// A console question carries EITHER a spoken script or a heading-only label.
// Both must survive: the script is read verbatim, the label is what the agent
// sees when there is nothing to read aloud.
export function questionToField(q: Question, caseType: CaseTypeKey): Field {
  const f: Field = {
    id: q.key,
    scope: "lead",
    kind: kindFor(q),
    label: q.label ?? q.script ?? q.key,
    origin: "spine",
    locked: true,
  };
  if (q.script) f.script = q.script;
  if (q.note) f.agentNote = q.note;
  if (q.multiline) f.multiline = true;
  if (q.lookup) f.lookup = q.lookup;
  if (q.options?.length) {
    f.choices = q.options.map((o) => (o.note ? { value: o.value, label: o.label, note: o.note } : { value: o.value, label: o.label }));
    f.options = q.options.map((o) => o.label);
  }
  const showIf = SHOW_IF[caseType]?.[q.key];
  if (showIf) f.showIf = showIf;
  return f;
}

export interface GeneratedForm {
  caseType: string;
  fields: Field[];
  /** The order questions are ASKED. Fields themselves are stored in print order. */
  askOrder: string[];
}

// questionsFor() already returns ask order. Print order is the declaration order
// in questions.ts, which is the narrative sequence exports and synopses use.
export function generateForm(caseType: CaseTypeKey, printOrder: Question[]): GeneratedForm {
  const asked = questionsFor(caseType);
  return {
    caseType,
    fields: printOrder.map((q) => questionToField(q, caseType)),
    askOrder: asked.map((q) => q.key),
  };
}
