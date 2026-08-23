// File fence. Run: npx tsx src/lib/file-fence.test.ts
import {
  FILE_TABS_CORE, INTERNAL_STAFF_FENCE, M6_FIRM_FENCE,
  fileBackHref, fileMayEditLead, fileMayExportPdf, fileMayRunQa,
  fileMaySeeMoney, fileMaySeeStaffQaNotes, fileMaySendComms, fileMayComposeM6,
  fileMaySeeCrissiHub, fileMayUseStaffTools,
  fileSafeAudit, fileShowsQaTab, fileTabs, isFirmAudience, isMoneyShapedAudit,
  isStaffOnlyDetailKey, stripStaffFormFields,
} from "./file-fence";
import type { Field } from "./questionnaire";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nDEFAULT INTERNAL STAFF (no fence / internal staff)");
check("internal is not firm", isFirmAudience(INTERNAL_STAFF_FENCE), false);
check("undefined fence is not firm", isFirmAudience(undefined), false);
check("staff may see money", fileMaySeeMoney(INTERNAL_STAFF_FENCE), true);
check("staff may edit", fileMayEditLead(INTERNAL_STAFF_FENCE), true);
check("staff may use dock", fileMayUseStaffTools(INTERNAL_STAFF_FENCE), true);
check("staff may run QA", fileMayRunQa(INTERNAL_STAFF_FENCE), true);
check("staff may see QA coaching", fileMaySeeStaffQaNotes(INTERNAL_STAFF_FENCE), true);
check("staff may send comms", fileMaySendComms(INTERNAL_STAFF_FENCE), true);
check("staff may compose m6 cadence", fileMayComposeM6(INTERNAL_STAFF_FENCE), true);
check("staff may export PDF", fileMayExportPdf(INTERNAL_STAFF_FENCE), true);
check("staff back is /leads", fileBackHref(INTERNAL_STAFF_FENCE), "/leads");
check("undefined back is /leads", fileBackHref(undefined), "/leads");
check("agent tabs omit QA", fileTabs("agent", INTERNAL_STAFF_FENCE), FILE_TABS_CORE.filter((t) => t !== "QA"));
check("qa role tabs include QA", fileShowsQaTab("qa", INTERNAL_STAFF_FENCE), true);
check("owner tabs include every listed tab", fileTabs("owner"), [...FILE_TABS_CORE]);

console.log("\nM6 FIRM");
check("firm audience", isFirmAudience(M6_FIRM_FENCE), true);
check("firm money-blind", fileMaySeeMoney(M6_FIRM_FENCE), false);
check("firm cannot edit lead fields", fileMayEditLead(M6_FIRM_FENCE), false);
check("firm no staff dock", fileMayUseStaffTools(M6_FIRM_FENCE), false);
check("firm cannot run QA actions", fileMayRunQa(M6_FIRM_FENCE), false);
check("firm cannot see coaching notes", fileMaySeeStaffQaNotes(M6_FIRM_FENCE), false);
check("firm cannot use workspace JustCall compose", fileMaySendComms(M6_FIRM_FENCE), false);
check("firm may use the m6 cadence compose rail", fileMayComposeM6(M6_FIRM_FENCE), true);
check("firm does not get the full Crissi hub", fileMaySeeCrissiHub(M6_FIRM_FENCE), false);
check("staff may open the full Crissi hub", fileMaySeeCrissiHub(INTERNAL_STAFF_FENCE), true);
check("firm cannot export staff PDF", fileMayExportPdf(M6_FIRM_FENCE), false);
check("firm back is /m6/cases", fileBackHref(M6_FIRM_FENCE), "/m6/cases");
check("firm always gets the QA tab", fileShowsQaTab("firm", M6_FIRM_FENCE), true);
check("firm tabs are the full internal set", fileTabs("firm", M6_FIRM_FENCE), [...FILE_TABS_CORE]);

console.log("\nFORM + AUDIT STRIP");
const fields: Field[] = [
  { id: "s1", scope: "lead", kind: "section", label: "Stay" },
  { id: "read_this", scope: "lead", kind: "script", label: "Script", script: "Never mention $10k" },
  { id: "motel", scope: "lead", kind: "bool", label: "Motel?", agentNote: "Ask verbatim", script: "Were you at a Motel 6?",
    choices: [{ value: "yes", label: "Yes", note: "Keep going" }] },
];
const stripped = stripStaffFormFields(fields);
check("script rows dropped", stripped.some((f) => f.kind === "script"), false);
check("agentNote stripped", stripped.find((f) => f.id === "motel")?.agentNote, undefined);
check("script text stripped", stripped.find((f) => f.id === "motel")?.script, undefined);
check("choice coaching note stripped", stripped.find((f) => f.id === "motel")?.choices?.[0]?.note, undefined);
check("choice value kept", stripped.find((f) => f.id === "motel")?.choices?.[0]?.value, "yes");

check("dollar audit is money", isMoneyShapedAudit({ description: "Bill rate $250" }), true);
check("commission audit is money", isMoneyShapedAudit({ description: "commission posted" }), true);
check("status audit is safe", isMoneyShapedAudit({ category: "status", description: "Moved to signed" }), false);
check("firm audit drops money rows", fileSafeAudit([
  { id: 1, description: "Moved to signed" },
  { id: 2, description: "week pay posted" },
], M6_FIRM_FENCE).map((e) => e.id), [1]);
check("staff audit keeps money rows", fileSafeAudit([
  { id: 2, description: "week pay posted" },
], INTERNAL_STAFF_FENCE).map((e) => e.id), [2]);
check("case_rating is staff-only", isStaffOnlyDetailKey("case_rating"), true);
check("handling_attorney is not staff-only", isStaffOnlyDetailKey("handling_attorney"), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
