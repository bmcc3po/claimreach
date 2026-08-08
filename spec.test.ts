// Reproduce Lexamica's OWN documented example through our builder and compare
// against their exact published body. If this passes, our payload is the same
// shape they say they accept, not merely close to it.
import { buildLexamicaPayload, type SummaryField } from "./src/lib/lexamica";

const THEIR_EXAMPLE = {
  FirstName: "Jane",
  LastName: "Smith",
  Phone: "555-123-4567",
  Email: "jane.smith@example.com",
  PracticeArea: "Auto Accident",
  IncidentDate: "2026-07-10",
  IncidentAddressState: "AZ",
  Summary: "What happened?:\nRear-end collision at a red light.\n\nWhen did it happen?:\n2026-07-10\n\nWere you injured?:\nYes, neck and back pain.\n\nDid you receive treatment?:\nUrgent care the next morning.",
  LeadId: "tmt-lead-12345",
};

const fields: SummaryField[] = [
  { id: "what_happened", script: "What happened?" },
  { id: "date", script: "When did it happen?" },
  { id: "injured", script: "Were you injured?" },
  { id: "treatment", script: "Did you receive treatment?" },
];

const { payload } = buildLexamicaPayload({
  firstName: "Jane", lastName: "Smith",
  phone: "555-123-4567", email: "jane.smith@example.com",
  caseType: "__none__",              // force the fallback so we can set it below
  leadId: "tmt-lead-12345",
  answers: {
    what_happened: "Rear-end collision at a red light.",
    date: "2026-07-10",
    injured: "Yes, neck and back pain.",
    treatment: "Urgent care the next morning.",
    incident_city_state: "Phoenix, AZ",
  },
  fields,
});
payload.PracticeArea = "Auto Accident";  // their example predates TMT's real list

let pass = 0, fail = 0;
function eq(name: string, a: any, b: any) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       ours  ${JSON.stringify(a)}\n       theirs ${JSON.stringify(b)}`); }
}

console.log("\nAGAINST LEXAMICA'S PUBLISHED EXAMPLE");
for (const k of Object.keys(THEIR_EXAMPLE) as (keyof typeof THEIR_EXAMPLE)[]) {
  eq(k, (payload as any)[k], THEIR_EXAMPLE[k]);
}
eq("no extra keys beyond their spec",
  Object.keys(payload).sort(), Object.keys(THEIR_EXAMPLE).sort());

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
