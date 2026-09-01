// ============================================================================
// PARITY: generated form data vs the console's code-defined questions.
//
// The console questions are moving from code into intake_forms. This asserts the
// move is lossless BEFORE the code path is deleted. Two things are checked:
//
//   1. SEQUENCE. Walking the generated form (askOrder + showIf) must produce the
//      exact same question sequence as walking questionsFor() + questionApplies()
//      across a matrix of answer states, including every conditional branch.
//   2. CONTENT. Every verbatim script, agent note, per-option note, Google lookup
//      and paragraph-box flag must survive the conversion.
//
// Content parity matters as much as sequence: FieldRenderer currently renders
// field.options (plain strings) and ignores field.choices, so a naive move would
// drop the per-option agent coaching ("Not sure is not a no. Keep going") that
// is already in the seeded MVA data.
//
// Run: npx tsx src/lib/intake-console/parity.test.ts
// ============================================================================
import { questionApplies, type Answers, type CaseTypeKey } from "./engine";
import { questionsFor, AUTO_QUESTIONS, GPI_QUESTIONS, type Question } from "./questions";
import { generateForm } from "./to-form";
import { fieldVisible, type Field } from "../questionnaire";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else {
    fail++;
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  }
}

// ---------------------------------------------------------------- sequence
// The question sequence the CONSOLE would ask, given a set of answers.
function consoleSequence(caseType: CaseTypeKey, a: Answers): string[] {
  return questionsFor(caseType).filter((q) => questionApplies(caseType, q.key, a)).map((q) => q.key);
}

// The question sequence the GENERATED FORM would ask, given the same answers.
// Fields are stored in print order, so ask order is applied here the same way
// the guided runner will apply it.
function formSequence(fields: Field[], askOrder: string[], a: Answers): string[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  return askOrder
    .map((id) => byId.get(id))
    .filter((f): f is Field => !!f)
    .filter((f) => fieldVisible(f, a))
    .map((f) => f.id);
}

const MVA = generateForm("mva", AUTO_QUESTIONS);
const PREM = generateForm("prem", GPI_QUESTIONS);

// Every branch of questionApplies gets exercised, including the ones that only
// open under a specific combination (willing vs willing_more vs
// treatment_followup all key off treatment plus injured).
const MVA_CASES: Record<string, Answers> = {
  "empty": {},
  "self, injured, still treating": { authority: "self", injured: "yes", treatment: "still" },
  "on behalf of a living IP (opens poa)": { authority: "alive", injured: "yes", treatment: "still" },
  "deceased IP": { authority: "deceased", injured: "yes", treatment: "still" },
  "not injured (closes the injury tree)": { authority: "self", injured: "no" },
  "never treated (opens willing)": { authority: "self", injured: "yes", treatment: "never" },
  "finished (opens willing_more)": { authority: "self", injured: "yes", treatment: "finished" },
  "stopped early (opens willing_more)": { authority: "self", injured: "yes", treatment: "stopped" },
  "treated (opens treatment_followup)": { authority: "self", injured: "yes", treatment: "treated" },
  "police report yes (opens agency + number)": { injured: "yes", treatment: "still", police_report: "yes" },
  "police report no": { injured: "yes", treatment: "still", police_report: "no" },
  "police report unsure": { injured: "yes", treatment: "still", police_report: "unsure" },
  "found us via attorney (opens referral_source)": { how_found_us: "ref_attorney" },
  "found us online (no referral_source)": { how_found_us: "online" },
  "found us via AI (no referral_source)": { how_found_us: "ai" },
  "return client (no referral_source)": { how_found_us: "return" },
  "other source (opens referral_source)": { how_found_us: "other" },
  "carries insurance (opens policy id)": { ins_own: "yes" },
  "no insurance": { ins_own: "no" },
  "insurance unsure": { ins_own: "unsure" },
  "passengers present": { others_in_vehicle: "yes" },
  "passengers present and hurt": { others_in_vehicle: "yes", others_injured: "yes" },
  "passengers present, none hurt": { others_in_vehicle: "yes", others_injured: "no" },
  "no passengers": { others_in_vehicle: "no" },
  "given insurer forms": { ins_forms: "yes" },
  "given forms and signed them": { ins_forms: "yes", ins_forms_signed: "yes" },
  "given forms, did not sign": { ins_forms: "yes", ins_forms_signed: "no" },
  "no insurer forms": { ins_forms: "no" },
  "currently represented (closes dual-rep Q2/Q3)": { attorney: "yes" },
  "not represented (opens dual-rep Q2/Q3)": { attorney: "no" },
  "fully answered file": {
    frame: "said",
    authority: "self", role: "driver", attorney: "no", attorney_consult: "no", pending_legal: "no",
    how_found_us: "ref_friend",
    referral_source: "Dana", what_happened: "Rear ended", collision_type: "rear_end",
    agent_read: "yes", date: "2026-06-01", incident_time: "8:00 AM",
    incident_city_state: "Las Vegas, NV", injured: "yes", symptoms_ongoing: "yes",
    treatment: "still", treatment_followup: "yes", injuries: ["neck_back"], surgery: "no",
    hosp: "no", fault: "other", police_report: "yes", police_agency: "Metro",
    police_report_number: "1", citations: "other", commercial: "no", settled: "no",
    bills: "under_10k", ins_other: "yes", ins_own: "yes", auto_policy_id: "P1",
    ins_uim: "unsure", others_in_vehicle: "yes", others_names: "Sam",
    others_injured: "yes", others_injured_contact: "Sam 702", others_need_help: "yes",
    ins_forms: "yes", ins_forms_signed: "yes", ins_forms_said: "Sign here",
    case_manager_notes: "Clean file",
  },
};

const PREM_CASES: Record<string, Answers> = {
  "empty": {},
  "lawfully present, injured, still treating": { presence: "yes", injured: "yes", treatment: "still" },
  "trespassing": { presence: "no", injured: "yes", treatment: "still" },
  "not injured": { presence: "yes", injured: "no" },
  "never treated (opens willing)": { presence: "yes", injured: "yes", treatment: "never" },
  "finished (opens willing_more)": { presence: "yes", injured: "yes", treatment: "finished" },
  "stopped early (opens willing_more)": { presence: "yes", injured: "yes", treatment: "stopped" },
};

console.log("\nSEQUENCE PARITY - MVA");
for (const [name, a] of Object.entries(MVA_CASES)) {
  check(name, formSequence(MVA.fields, MVA.askOrder, a), consoleSequence("mva", a));
}

console.log("\nSEQUENCE PARITY - PREMISES");
for (const [name, a] of Object.entries(PREM_CASES)) {
  check(name, formSequence(PREM.fields, PREM.askOrder, a), consoleSequence("prem", a));
}

// ---------------------------------------------------------------- content
function contentOf(q: Question) {
  return {
    script: q.script || undefined,
    note: q.note,
    multiline: q.multiline || undefined,
    lookup: q.lookup,
    options: q.options?.map((o) => ({ value: o.value, label: o.label, note: o.note })),
  };
}
function contentOfField(f: Field) {
  return {
    script: f.script,
    note: f.agentNote,
    multiline: f.multiline || undefined,
    lookup: f.lookup,
    options: f.choices?.map((c) => ({ value: c.value, label: c.label, note: c.note })),
  };
}

console.log("\nCONTENT PARITY - every question, verbatim");
for (const [label, gen, src] of [["mva", MVA, AUTO_QUESTIONS], ["prem", PREM, GPI_QUESTIONS]] as const) {
  const byId = new Map(gen.fields.map((f) => [f.id, f]));
  for (const q of src) {
    const f = byId.get(q.key);
    if (!f) { fail++; console.log(`  FAIL ${label}:${q.key} missing from generated form`); continue; }
    check(`${label}:${q.key}`, contentOfField(f), contentOf(q));
  }
}

// ---------------------------------------------------------------- guardrails
console.log("\nGUARDRAILS");
const allFields = [...MVA.fields, ...PREM.fields];
check("every field is locked spine content", allFields.every((f) => f.locked && f.origin === "spine"), true);
check("print order preserves declaration order (mva)", MVA.fields.map((f) => f.id), AUTO_QUESTIONS.map((q) => q.key));
check("ask order differs from print order (mva)", MVA.askOrder.join() !== MVA.fields.map((f) => f.id).join(), true);
check("google city lookup survives", MVA.fields.find((f) => f.id === "incident_city_state")?.lookup, "city");
check("google agency lookup survives", MVA.fields.find((f) => f.id === "police_agency")?.lookup, "agency");
check("paragraph box survives", MVA.fields.find((f) => f.id === "what_happened")?.multiline, true);
check("time kind survives", MVA.fields.find((f) => f.id === "incident_time")?.kind, "time");
check("per-option agent note survives",
  MVA.fields.find((f) => f.id === "ins_uim")?.choices?.find((c) => c.value === "unsure")?.note,
  "Not sure is not a no. Keep going");

// ---------------------------------------------------------------- renderer
// FieldRenderer stored the LABEL as the answer because it rendered
// field.options (display strings) and ignored field.choices. The engine matches
// on VALUES, so a form-driven MVA would have stored "Under $10,000" where the
// routing math looks for "under_10k" and every bills-dependent decision would
// have silently failed. These assert the generated data carries what the
// renderer and the engine both need.
console.log("\nRENDERER SAFETY");
const choiceFields = allFields.filter((f) => f.kind === "select" || f.kind === "multiselect");
check("every choice field carries value/label pairs", choiceFields.every((f) => (f.choices?.length ?? 0) > 0), true);
check("no choice value is a display label",
  choiceFields.every((f) => (f.choices ?? []).every((c) => c.value !== c.label || /^[a-z0-9_]+$/.test(c.value))), true);
check("bills values are engine keys, not labels",
  MVA.fields.find((f) => f.id === "bills")?.choices?.map((c) => c.value),
  ["none", "under_10k", "10k_50k", "over_50k", "unknown"]);
check("injury values are engine keys",
  MVA.fields.find((f) => f.id === "injuries")?.choices?.slice(0, 3).map((c) => c.value),
  ["neck_back", "strain", "whiplash"]);
check("treatment values are engine keys",
  MVA.fields.find((f) => f.id === "treatment")?.choices?.map((c) => c.value),
  ["treated", "still", "finished", "stopped", "never"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
