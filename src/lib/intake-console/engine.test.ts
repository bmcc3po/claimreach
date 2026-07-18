// ============================================================================
// Decision-tree checks. These are the routing rules the firm approved, so they
// get asserted rather than assumed. Run: npx tsx src/lib/intake-console/engine.test.ts
// ============================================================================
import { evaluate, nextQuestionKey, questionApplies, registryKeyFor, modifiersFor, type Answers } from "./engine";
import { getFirmConfig } from "./config";

const cfg = getFirmConfig("tmt");
let pass = 0, fail = 0;

function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}
const disp = (a: Answers, t: any = "mva") => evaluate(t, a, cfg)?.disposition ?? null;

// base answer set that reaches the end of the auto tree cleanly.
// The narrative, agent read, police report, citations and role questions do not
// change the outcome, but they are part of the flow, so a base that omits them
// never reaches a terminal.
const base: Answers = {
  authority: "self", role: "driver", attorney: "no", commercial: "no", injured: "yes",
  what_happened: "Rear-ended at a light.", agent_read: "yes",
  police_report: "yes", citations: "other", symptoms_ongoing: "yes",
  injuries: ["neck_back"], surgery: "no", hosp: "no", fault: "other",
  settled: "no", date: "le30", treatment: "still", bills: "under_10k",
  ins_other: "yes", ins_own: "yes", ins_uim: "unsure",
};

console.log("\nAUTO — immediate terminals");
check("deceased -> secondary review", disp({ authority: "deceased" }), "SECONDARY_REVIEW");
check("no POA -> callback", disp({ authority: "alive", poa: "no" }), "CALLBACK");
check("has attorney -> disqualify", disp({ ...base, attorney: "yes" }), "DISQUALIFY");

console.log("\nAUTO — insurance triangle");
check("no coverage on all three -> refer",
  disp({ ...base, ins_other: "no", ins_own: "no", ins_uim: "no" }), "REFER");
check("unsure UIM is not a no -> still signs",
  disp({ ...base, ins_other: "no", ins_own: "no", ins_uim: "unsure" }), "SIGN");
check("no coverage but commercial -> secondary review",
  disp({ ...base, commercial: "yes", ins_other: "no", ins_own: "no", ins_uim: "no" }), "SECONDARY_REVIEW");

console.log("\nAUTO — base disqualifiers");
check("no injuries -> DQ", disp({ ...base, injured: "no", injuries: [], surgery: undefined, hosp: undefined, treatment: undefined, bills: undefined }), "DISQUALIFY");
check("caused the wreck -> DQ", disp({ ...base, fault: "caused" }), "DISQUALIFY");
check("already settled -> DQ", disp({ ...base, settled: "yes" }), "DISQUALIFY");
check("never treated + unwilling -> DQ", disp({ ...base, treatment: "never", willing: "no" }), "DISQUALIFY");

console.log("\nAUTO — override outranks a disqualifier");
check("commercial + caused -> secondary review", disp({ ...base, commercial: "yes", fault: "caused" }), "SECONDARY_REVIEW");
check("catastrophic + settled -> secondary review", disp({ ...base, injuries: ["head"], settled: "yes" }), "SECONDARY_REVIEW");
check("hospitalized 3+ days + unwilling -> secondary review", disp({ ...base, hosp: "long", treatment: "never", willing: "no" }), "SECONDARY_REVIEW");

console.log("\nAUTO — sign vs refer");
check("within 30 days -> SIGN", disp({ ...base, date: "le30" }), "SIGN");
check("mid + still treating -> SIGN", disp({ ...base, date: "mid", treatment: "still" }), "SIGN");
check("mid + serious + finished -> SIGN", disp({ ...base, date: "mid", injuries: ["lig_tear"], treatment: "finished" }), "SIGN");
check("mid + minor + finished + low bills -> REFER", disp({ ...base, date: "mid", treatment: "finished", bills: "under_10k" }), "REFER");
check("mid + bills over the line -> SIGN", disp({ ...base, date: "mid", treatment: "finished", bills: "10k_50k" }), "SIGN");
check("9 months or older -> REFER", disp({ ...base, date: "old" }), "REFER");
check("strain is minor, tear is serious", disp({ ...base, date: "mid", injuries: ["lig_strain"], treatment: "finished" }), "REFER");

console.log("\nAUTO — skip logic");
check("POA only asked when calling for a living person", questionApplies("mva", "poa", { authority: "self" }), false);
check("injury questions skipped when uninjured", questionApplies("mva", "injuries", { injured: "no" }), false);
check("willing only asked when never treated", questionApplies("mva", "willing", { injured: "yes", treatment: "still" }), false);
check("first question is authority", nextQuestionKey("mva", {}), "authority");

console.log("\nGENERAL PI");
const g: Answers = { presence: "yes", injured: "yes", symptoms_ongoing: "yes", injuries: ["neck_back"], surgery: "no", date: "le30", treatment: "still", bills: "under_10k" };
check("trespassing -> DQ", disp({ ...g, presence: "no" }, "prem"), "DISQUALIFY");
check("within 30 days -> SIGN", disp(g, "prem"), "SIGN");
check("still treating -> SIGN", disp({ ...g, date: "mid" }, "prem"), "SIGN");
check("finished + under the GPI line -> REFER", disp({ ...g, date: "mid", treatment: "finished", bills: "10k_50k" }, "prem"), "REFER");
check("finished + over the GPI line -> SIGN", disp({ ...g, date: "mid", treatment: "finished", bills: "over_50k" }, "prem"), "SIGN");
check("no commercial flag on premises", evaluate("prem", { ...g, commercial: "yes" }, cfg)?.flags ?? [], []);

console.log("\nBRIEF CAPTURE");
check("represented + satisfied -> DQ", disp({ what_happened: "x", incident_date: "x", state: "NV", represented: "yes_satisfied" }, "other"), "DISQUALIFY");
check("everything else -> REFER", disp({ what_happened: "x", incident_date: "x", state: "NV", represented: "no" }, "other"), "REFER");


console.log("\nREGISTRY KEYS + MODIFIERS");
check("mva maps to itself", registryKeyFor("mva"), "mva");
check("prem maps to itself", registryKeyFor("prem"), "prem");
check("employment falls into the referral bucket", registryKeyFor("employment"), "referral");
check("commercial vehicle becomes a CMV modifier", modifiersFor("mva", { commercial: "yes" }), ["cmv"]);
check("no CMV modifier on premises", modifiersFor("prem", { commercial: "yes" }), []);
check("head injury sets TBI and catastrophic", modifiersFor("mva", { injuries: ["head"] }), ["tbi", "catastrophic"]);
check("deceased sets wrongful death", modifiersFor("mva", { authority: "deceased" }), ["wrongful_death"]);
check("3+ day stay sets catastrophic and hospitalized", modifiersFor("mva", { hosp: "long" }), ["catastrophic", "hospitalized"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
