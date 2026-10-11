// ============================================================================
// Decision-tree checks. These are the routing rules the firm approved, so they
// get asserted rather than assumed. Run: npx tsx src/lib/intake-console/engine.test.ts
// ============================================================================
import { evaluate, nextQuestionKey, nextDetailQuestionKey, questionApplies, modifiersFor, dateBucket, type Answers } from "./engine";
import { questionsFor, AUTO_QUALIFY_ORDER, AUTO_DETAIL_ORDER } from "./questions";
import { POST_SIGN_FIELDS, SIGN_SCRIPTS } from "./scripts";
import { getFirmConfig } from "./config";

const cfg = getFirmConfig("tmt");
let pass = 0, fail = 0;

function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}
const disp = (a: Answers, t: any = "mva", c: any = cfg) => evaluate(t, a, c)?.disposition ?? null;

// The date question captures a real date now, so tests express age in days and
// let the engine bucket it. Legacy bucket strings still evaluate, which is what
// the two dateBucket checks below prove.
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// base answer set that reaches the end of the auto tree cleanly.
// The narrative, agent read, police report, citations and role questions do not
// change the outcome, but they are part of the flow, so a base that omits them
// never reaches a terminal.
const base: Answers = {
  frame: "said",
  authority: "self", role: "driver", attorney: "no", attorney_consult: "no", pending_legal: "no",
  commercial: "no", injured: "yes",
  what_happened: "Rear-ended at a light.", agent_read: "yes", incident_city_state: "Nashville, TN",
  police_report: "yes", police_agency: "Metro PD", police_report_number: "25-11234",
  citations: "other", symptoms_ongoing: "yes", incident_time: "7:30 AM",
  injuries: ["neck_back"], surgery: "no", hosp: "no", fault: "other",
  settled: "no", date: isoDaysAgo(10), treatment: "still", bills: "under_10k",
  ins_other: "yes", ins_own: "yes", ins_uim: "unsure",
  how_found_us: "online", collision_type: "rear_end", treatment_followup: "yes",
  auto_policy_id: "POL-123", others_in_vehicle: "no", ins_forms: "no",
  case_manager_notes: "Standard rear-end, clean liability.",
};

// Qualify-only answers. No police report, occupants, how-found, collision type,
// policy ID, or case-manager notes — those are the details rail.
const qualifyOnly: Answers = {
  frame: "said",
  authority: "self", role: "driver", attorney: "no", attorney_consult: "no", pending_legal: "no",
  commercial: "no", injured: "yes",
  what_happened: "Rear-ended at a light.", agent_read: "yes", incident_city_state: "Nashville, TN",
  symptoms_ongoing: "yes",
  injuries: ["neck_back"], surgery: "no", hosp: "no", fault: "other",
  settled: "no", date: isoDaysAgo(10), treatment: "still", bills: "under_10k",
  ins_other: "yes", ins_own: "yes", ins_uim: "unsure",
};

console.log("\nAUTO — immediate terminals");
check("deceased -> secondary review", disp({ authority: "deceased" }), "SECONDARY_REVIEW");
check("no POA -> callback", disp({ authority: "alive", poa: "no" }), "CALLBACK");
check("has attorney -> disqualify", disp({ ...base, attorney: "yes" }), "DISQUALIFY");

console.log("\nAUTO — real dates bucket correctly");
check("10 days ago -> signs like le30", disp({ ...base, date: isoDaysAgo(10) }), "SIGN");
check("120 days ago + still treating -> signs like mid", disp({ ...base, date: isoDaysAgo(120) }), "SIGN");
check("2 years ago -> refer like old", disp({ ...base, date: isoDaysAgo(730) }), "REFER");
check("legacy bucket string still works", disp({ ...base, date: "le30" }), "SIGN");

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
check("mid + still treating -> SIGN", disp({ ...base, date: isoDaysAgo(120), treatment: "still" }), "SIGN");
check("mid + serious + finished -> SIGN", disp({ ...base, date: isoDaysAgo(120), injuries: ["lig_tear"], treatment: "finished", willing_more: "yes" }), "SIGN");
check("mid + minor + finished + low bills -> REFER", disp({ ...base, date: isoDaysAgo(120), treatment: "finished", willing_more: "yes", bills: "under_10k" }), "REFER");
check("mid + bills over the line -> SIGN", disp({ ...base, date: isoDaysAgo(120), treatment: "finished", willing_more: "yes", bills: "10k_50k" }), "SIGN");
check("9 months or older -> REFER", disp({ ...base, date: isoDaysAgo(730) }), "REFER");
check("strain is minor, tear is serious", disp({ ...base, date: isoDaysAgo(120), injuries: ["lig_strain"], treatment: "finished", willing_more: "yes" }), "REFER");

console.log("\nAUTO — skip logic");
check("POA only asked when calling for a living person", questionApplies("mva", "poa", { authority: "self" }), false);
check("injury questions skipped when uninjured", questionApplies("mva", "injuries", { injured: "no" }), false);
check("willing only asked when never treated", questionApplies("mva", "willing", { injured: "yes", treatment: "still" }), false);
check("first question is the frame", nextQuestionKey("mva", {}), "frame");

console.log("\nAUTO — qualify before sign, details after");
const qualifyKeys = questionsFor("mva", "qualify").map((q) => q.key);
const detailKeys = questionsFor("mva", "details").map((q) => q.key);
check("attorney is on the qualify rail", qualifyKeys.includes("attorney"), true);
check("attorney is asked before injured", qualifyKeys.indexOf("attorney") < qualifyKeys.indexOf("injured"), true);
check("attorney_consult follows current-attorney", qualifyKeys.indexOf("attorney_consult"), qualifyKeys.indexOf("attorney") + 1);
check("pending_legal is the third dual-rep ask", qualifyKeys.indexOf("pending_legal"), qualifyKeys.indexOf("attorney") + 2);
check("police report is a detail, not qualify", detailKeys.includes("police_report") && !qualifyKeys.includes("police_report"), true);
check("occupants are details", detailKeys.includes("others_in_vehicle") && !qualifyKeys.includes("others_in_vehicle"), true);
check("how-found is a detail", detailKeys.includes("how_found_us") && !qualifyKeys.includes("how_found_us"), true);
check("collision type is a detail", detailKeys.includes("collision_type") && !qualifyKeys.includes("collision_type"), true);
check("policy ID is a detail", detailKeys.includes("auto_policy_id") && !qualifyKeys.includes("auto_policy_id"), true);
check("SSN is not a question on either rail",
  !qualifyKeys.includes("ssn") && !detailKeys.includes("ssn") && POST_SIGN_FIELDS.some((f) => f.key === "ssn"), true);
check("SSN is not on the identity two-stop", SIGN_SCRIPTS.twoStop.every((l) => !/ssn|social/i.test(l)), true);
check("sign voice is two stops, not four rungs", SIGN_SCRIPTS.twoStop.length, 2);

check("represented caller DQs on attorney with no injury/treatment/details",
  disp({ frame: "said", authority: "self", attorney: "yes" }), "DISQUALIFY");
check("after frame + authority, next qualify ask is attorney (not injury)",
  nextQuestionKey("mva", { frame: "said", authority: "self" }), "attorney");
check("dual-rep Q2/Q3 are skipped on current representation",
  questionApplies("mva", "attorney_consult", { attorney: "yes" }), false);
check("dual-rep Q3 skipped on current representation",
  questionApplies("mva", "pending_legal", { attorney: "yes" }), false);
check("dual-rep Q2 is asked when not currently represented",
  questionApplies("mva", "attorney_consult", { attorney: "no" }), true);

check("SIGN without police report / occupants / how-found", disp(qualifyOnly), "SIGN");
check("qualify rail is exhausted without those details", nextQuestionKey("mva", qualifyOnly), null);
check("details rail still wants police/how-found after SIGN",
  AUTO_DETAIL_ORDER.includes(nextDetailQuestionKey("mva", qualifyOnly) as string), true);
check("filling police report is not required for SIGN",
  disp({ ...qualifyOnly, police_report: undefined, others_in_vehicle: undefined, how_found_us: undefined }), "SIGN");

console.log("\nAUTO — 9-month window unchanged");
check("273 days is still mid", dateBucket(isoDaysAgo(273)), "mid");
check("274 days is old (the locked ~9-month cut)", dateBucket(isoDaysAgo(274)), "old");
check("274-day file refers, not a new window", disp({ ...qualifyOnly, date: isoDaysAgo(274) }), "REFER");
check("exported qualify order still exists", AUTO_QUALIFY_ORDER[0], "frame");

console.log("\nGENERAL PI");
const g: Answers = { incident_time: "2:00 PM", presence: "yes", injured: "yes", symptoms_ongoing: "yes", what_happened: "Fell on a wet floor.", agent_read: "yes", incident_city_state: "Nashville, TN", injuries: ["neck_back"], surgery: "no", date: isoDaysAgo(10), treatment: "still", bills: "under_10k", case_manager_notes: "Wet floor, no signage." };
check("trespassing -> DQ", disp({ ...g, presence: "no" }, "prem"), "DISQUALIFY");
check("within 30 days -> SIGN", disp(g, "prem"), "SIGN");
check("still treating -> SIGN", disp({ ...g, date: isoDaysAgo(120) }, "prem"), "SIGN");
check("finished + under the GPI line -> REFER", disp({ ...g, date: isoDaysAgo(120), treatment: "finished", willing_more: "yes", bills: "10k_50k" }, "prem"), "REFER");
check("finished + over the GPI line -> SIGN", disp({ ...g, date: isoDaysAgo(120), treatment: "finished", willing_more: "yes", bills: "over_50k" }, "prem"), "SIGN");
check("no commercial flag on premises", evaluate("prem", { ...g, commercial: "yes" }, cfg)?.flags ?? [], []);

console.log("\nVENUE (TMT works NM, KY, TN)");
const venueBase = { ...base };
check("in venue signs", disp(venueBase), "SIGN");
check("Kentucky signs", disp({ ...venueBase, incident_city_state: "Louisville, KY" }), "SIGN");
check("New Mexico signs", disp({ ...venueBase, incident_city_state: "Santa Fe, NM" }), "SIGN");
check("Nevada is worked and referred, not disqualified", disp({ ...venueBase, incident_city_state: "Las Vegas, NV" }), "REFER");
check("full state name resolves", disp({ ...venueBase, incident_city_state: "Miami, Florida" }), "REFER");
check("out of venue is flagged", evaluate("mva", { ...venueBase, incident_city_state: "Las Vegas, NV" }, cfg)?.flags ?? [], ["out of venue: NV"]);
check("unreadable venue goes to a human, not a signature",
  disp({ ...venueBase, incident_city_state: "somewhere near the mall" }), "SECONDARY_REVIEW");
check("venue never rescues a disqualifier",
  disp({ ...venueBase, incident_city_state: "Louisville, KY", injured: "no" }), "DISQUALIFY");
check("venue never downgrades an existing refer",
  disp({ ...venueBase, incident_city_state: "Louisville, KY", ins_other: "no", ins_own: "no", ins_uim: "no" }), "REFER");
check("a firm with no venue list is unrestricted",
  disp({ ...venueBase, incident_city_state: "Las Vegas, NV" }, "mva", getFirmConfig("tmp")), "SIGN");
check("premises respects venue too",
  disp({ ...g, incident_city_state: "Las Vegas, NV" }, "prem"), "REFER");

console.log("\nBRIEF CAPTURE");
check("represented + satisfied -> DQ", disp({ what_happened: "x", incident_date: "x", state: "NV", represented: "yes_satisfied", case_manager_notes: "n" }, "other"), "DISQUALIFY");
check("everything else -> REFER", disp({ what_happened: "x", incident_date: "x", state: "NV", represented: "no", case_manager_notes: "n" }, "other"), "REFER");


console.log("\nFIRM CONFIG SAFETY");
check("a known firm is marked configured", getFirmConfig("tmt").configured, true);
check("an unknown firm is NOT marked configured", getFirmConfig("wll").configured, false);
check("an unknown firm never borrows another firm's name", getFirmConfig("wll").firmName, "");
check("an unknown firm never borrows another firm's greeting", getFirmConfig("wll").greeting, "");
check("an unknown firm never borrows another firm's venue", getFirmConfig("wll").venueStates, null);

console.log("\nCOMMIT TO THE APPOINTMENT (TMT rule, 31 days to 9 months)");
// Never treated means no bills and no records, so the file rests entirely on
// whether they attend the appointment the firm books and pays for.
const mid = { ...base, date: "2026-04-01", treatment: "never", willing: "yes", bills: "none",
              injuries: ["head"], willing_more: undefined as any };
check("serious injury plus a commitment signs", disp({ ...mid, commit_appointment: "yes" }), "SIGN");
check("refusing to commit does not sign", disp({ ...mid, commit_appointment: "no" }), "REFER");
check("a minor injury does not sign on a commitment alone",
  disp({ ...mid, injuries: ["neck_back"], commit_appointment: "yes" }), "REFER");
check("PTSD counts as serious", disp({ ...mid, injuries: ["ptsd"], commit_appointment: "yes" }), "SIGN");
check("anxiety alone does not", disp({ ...mid, injuries: ["anxiety"], commit_appointment: "yes" }), "REFER");
check("still treating never needs the commitment",
  disp({ ...base, date: "2026-04-01", treatment: "still" }), "SIGN");
check("within 30 days it is not even asked",
  questionApplies("mva", "commit_appointment", { injured: "yes", treatment: "never", willing: "yes", date: base.date }), false);
check("within 30 days a willing caller still signs", disp({ ...base, treatment: "never", willing: "yes" }), "SIGN");
check("it is only asked of someone willing and never treated",
  questionApplies("mva", "commit_appointment", { injured: "yes", treatment: "never", willing: "yes", date: "2026-04-01" }), true);
check("not asked of someone already treating",
  questionApplies("mva", "commit_appointment", { injured: "yes", treatment: "still", date: "2026-04-01" }), false);
check("not asked of someone unwilling",
  questionApplies("mva", "commit_appointment", { injured: "yes", treatment: "never", willing: "no", date: "2026-04-01" }), false);

console.log("\nDOG BITE: SCARRING IS THE TEST, NOT TREATMENT OR BILLS");
const bite = (extra: any = {}) => evaluate("prem", {
  ...g, case_subtype: "dogbite", attorney: "no", settled: "no",
  date: "2026-07-01", dogbite_are_there_visible_scars_or_marks: "yes_elsewhere",
  ...extra,
}, cfg)?.disposition ?? null;
check("a permanent mark signs", bite(), "SIGN");
check("a facial scar signs", bite({ dogbite_are_there_visible_scars_or_marks: "yes_on_the_face_or_neck" }), "SIGN");
check("no permanent mark disqualifies", bite({ dogbite_are_there_visible_scars_or_marks: "no" }), "DISQUALIFY");
check("too early to tell goes to a human, not to no",
  bite({ dogbite_are_there_visible_scars_or_marks: "too_early_to_tell" }), "SECONDARY_REVIEW");
check("no bills test: nothing spent still signs on a scar", bite({ bills: "none" }), "SIGN");
check("no treatment test: never treated still signs on a scar", bite({ treatment: "never", willing: "no" }), "SIGN");
check("an old bite on an adult is time barred", bite({ date: "2025-01-01" }), "DISQUALIFY");
check("an old bite on a child survives, their clock has not started",
  bite({ date: "2025-01-01", dogbite_was_a_child_bitten: "yes" }), "SIGN");
check("already represented still ends it", bite({ attorney: "yes" }), "DISQUALIFY");
check("a slip and fall is unaffected by the dog bite screen",
  evaluate("prem", { ...g, case_subtype: "general" }, cfg)?.disposition, "SIGN");

console.log("\nMODIFIERS");
check("commercial vehicle becomes a CMV modifier", modifiersFor("mva", { commercial: "yes" }), ["cmv"]);
check("no CMV modifier on premises", modifiersFor("prem", { commercial: "yes" }), []);
check("head injury sets TBI and catastrophic", modifiersFor("mva", { injuries: ["head"] }), ["tbi", "catastrophic"]);
check("deceased sets wrongful death", modifiersFor("mva", { authority: "deceased" }), ["wrongful_death"]);
check("3+ day stay sets catastrophic and hospitalized", modifiersFor("mva", { hosp: "long" }), ["catastrophic", "hospitalized"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
