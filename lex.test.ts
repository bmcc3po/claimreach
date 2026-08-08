import { buildLexamicaPayload, buildSummary, renderAnswer, toStateCode, toIsoDate, type SummaryField } from "./src/lib/lexamica";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nSTATE + DATE NORMALIZING");
check("city, ST", toStateCode("Las Vegas, NV"), "NV");
check("full state name", toStateCode("Miami, Florida"), "FL");
check("bare code", toStateCode("TN"), "TN");
check("garbage is empty, not a guess", toStateCode("near the mall"), "");
check("already ISO", toIsoDate("2026-06-14"), "2026-06-14");
check("US format", toIsoDate("06/14/2026"), "2026-06-14");
check("unparseable is empty", toIsoDate("last summer"), "");

console.log("\nTHE THREE TRAPS");
const boolField: SummaryField = { id: "settled", kind: "bool" };
check("real boolean false renders No, not false", renderAnswer(boolField, false), "No");
check("real boolean true renders Yes, not true", renderAnswer(boolField, true), "Yes");
const strField: SummaryField = { id: "attorney", kind: "select", choices: [{ value: "no", label: "No" }] };
check("guided-view string yes renders Yes", renderAnswer(strField, "yes"), "Yes");
const billsField: SummaryField = { id: "bills", kind: "select",
  choices: [{ value: "under_10k", label: "Under $10,000" }] };
check("stored key renders its label, not the key", renderAnswer(billsField, "under_10k"), "Under $10,000");
const multi: SummaryField = { id: "injuries", kind: "multiselect",
  choices: [{ value: "neck_back", label: "Neck or back pain" }, { value: "whiplash", label: "Whiplash" }] };
check("multiselect renders labels", renderAnswer(multi, ["neck_back", "whiplash"]), "Neck or back pain, Whiplash");

console.log("\nSUMMARY SHAPE (matches Lexamica's example)");
const f: SummaryField[] = [
  { id: "what_happened", script: "What happened?" },
  { id: "date", script: "When did it happen?" },
  { id: "injured", script: "Were you injured?", choices: [{ value: "yes", label: "Yes, neck and back pain." }] },
  { id: "skipped", script: "Did you receive treatment?" },
  { id: "s1", kind: "section", label: "A heading" },
];
const sum = buildSummary(f, { what_happened: "Rear-end collision at a red light.", date: "2026-07-10", injured: "yes", skipped: "" });
check("question colon newline answer, blank line between",
  sum, "What happened?:\nRear-end collision at a red light.\n\nWhen did it happen?:\n2026-07-10\n\nWere you injured?:\nYes, neck and back pain.");
check("empty answers are skipped entirely", sum.includes("Did you receive treatment?"), false);
check("section headings are not questions", sum.includes("A heading"), false);

console.log("\nREQUIRED FIELD GUARD");
const good = buildLexamicaPayload({
  firstName: "Jane", lastName: "Smith", phone: "555-123-4567", email: "j@example.com",
  caseType: "mva", leadId: "TMT-00001",
  answers: { what_happened: "Rear ended", date: "2026-07-10", incident_city_state: "Phoenix, AZ" },
  fields: [{ id: "what_happened", script: "What happened?" }],
});
check("a complete file has nothing missing", good.missing, []);
check("practice area maps from our key", good.payload.PracticeArea, "Motor Vehicle Accident");
check("state normalized", good.payload.IncidentAddressState, "AZ");
check("date normalized", good.payload.IncidentDate, "2026-07-10");
check("lead id carried for reconciliation", good.payload.LeadId, "TMT-00001");

const bad = buildLexamicaPayload({
  firstName: "Jane", lastName: "", phone: "", caseType: "mva",
  answers: {}, fields: [],
});
check("a half file reports exactly what is missing",
  bad.missing, ["LastName", "Phone", "IncidentDate", "IncidentAddressState", "Summary"]);
check("empty email is omitted, not sent blank", "Email" in bad.payload, false);

console.log("\nCASE TYPES MATCH TMT'S SYSTEM EXACTLY");
// Casey Mahoney, Aug 6: anything that does not match exactly arrives as "Other"
// and is never referred out. These strings came from Kacie Girgenti, Aug 6.
import { PI_SUBTYPES, REFERRAL_SUBTYPES, CASE_TYPE_PRACTICE_AREA, practiceAreaFor, subtypeQuestion } from "./src/lib/lexamica";
const KACIE = [
  "Motor Vehicle Accident", "Personal Injury", "Dog Bite Injuries",
  "Workplace Injuries", "Workers' Compensation", "Pedestrian Injuries",
  "Commercial Property Injuries", "Construction Accidents",
  "Medical Malpractice", "Product Liability", "Nursing Home Injuries",
];
const KACIE_REFER = [
  "Family Law", "Social Injustice", "Criminal Law", "Bankruptcy",
  "Landlord-Tenant Disputes", "Wills and Trusts", "Civil Litigation",
];
const emitted = [...PI_SUBTYPES.map((s) => s.label), ...Object.values(CASE_TYPE_PRACTICE_AREA)];
const emittedRefer = REFERRAL_SUBTYPES.map((s) => s.label);
check("every value we emit is on TMT's in-house list",
  emitted.filter((v) => !KACIE.includes(v)), []);
check("every referral value we emit is on TMT's refer-out list",
  emittedRefer.filter((v) => !KACIE_REFER.includes(v)), []);
check("mva maps to Motor Vehicle Accident", practiceAreaFor("mva"), "Motor Vehicle Accident");
check("PI with no subtype is still on their list", practiceAreaFor("prem"), "Personal Injury");
check("subtype wins over case type", practiceAreaFor("prem", "dogbite"), "Dog Bite Injuries");
check("an unknown subtype falls back rather than inventing", practiceAreaFor("prem", "spaceship"), "Personal Injury");
check("only two real case types", Object.keys(CASE_TYPE_PRACTICE_AREA).sort(), ["mva", "prem"]);
check("the question is generated from the same list, not retyped",
  subtypeQuestion("pi").options.map((o) => o.label), PI_SUBTYPES.map((s) => s.label));
check("nothing emits the literal string Other", emitted.includes("Other"), false);
check("no value has stray whitespace", emitted.filter((v) => v !== v.trim()), []);

const referred = buildLexamicaPayload({
  firstName: "A", lastName: "B", phone: "1", caseType: "prem",
  answers: { case_subtype: "referout", referout_not_read_aloud_select_what_t: "family_law", date: "2026-01-01", state: "TN", what_happened: "x" },
  fields: [{ id: "what_happened", script: "What happened?" }],
});
check("a family matter names itself, not the generic case type",
  referred.payload.PracticeArea, "Family Law");
const nursing = buildLexamicaPayload({
  firstName: "A", lastName: "B", phone: "1", caseType: "prem",
  answers: { case_subtype: "nursing", date: "2026-01-01", state: "TN", what_happened: "x" },
  fields: [{ id: "what_happened", script: "What happened?" }],
});
check("a nursing home file rides the PI case type", nursing.payload.PracticeArea, "Nursing Home Injuries");

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
