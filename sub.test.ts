import { deriveSubtype, deriveGeneralBlock, INCIDENT_TYPES, INCIDENT_SETTINGS } from "./src/lib/intake-console/subtype";

let pass=0, fail=0;
const ck=(n:string,g:any,w:any)=>{const o=JSON.stringify(g)===JSON.stringify(w);o?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n}\n       got ${JSON.stringify(g)} want ${JSON.stringify(w)}`));};
const d=(what:string,where?:string)=>deriveSubtype({what_happened_type:what,incident_setting:where});

console.log("\nONE ANSWER IS ENOUGH");
ck("car wreck", d("vehicle"), "mva");
ck("hit while walking", d("struck_ped"), "pedestrian");
ck("dog bite", d("dog"), "dogbite");
ck("doctor harmed them", d("medical"), "medmal");
ck("product failed", d("product"), "prodliab");
ck("nursing home", d("facility"), "nursing");
ck("hurt on the job", d("work"), "workplace");
ck("none of these refers out", d("other"), "referout");

console.log("\nWHERE IT HAPPENED DECIDES THE REST");
ck("fell in a store is commercial property", d("fall","business"), "commprop");
ck("fell at an apartment is premises", d("fall","apartment"), "general");
ck("fell at a private home is premises", d("fall","residence"), "general");
ck("fell on a sidewalk is premises", d("fall","public"), "general");
ck("fell on a job site is construction", d("fall","construction"), "construct");
ck("fell at their own workplace is a work injury", d("fall","workplace"), "workplace");
ck("struck by an object in a store", d("falling_obj","business"), "commprop");
ck("struck by an object on a site", d("falling_obj","construction"), "construct");

console.log("\nASSAULT IS A PREMISES CASE, NOT ITS OWN TYPE");
ck("assaulted at an apartment", d("attacked","apartment"), "general");
ck("assaulted at a business", d("attacked","business"), "general");
ck("assault opens the security questions", deriveGeneralBlock({what_happened_type:"attacked"}), "assault");

console.log("\nBLOCKS OPEN FROM WHAT HAPPENED, NOT FROM A SECOND PICK");
ck("a fall opens the hazard questions", deriveGeneralBlock({what_happened_type:"fall"}), "fall_or_hazard");
ck("a drunk driver opens dram shop", deriveGeneralBlock({what_happened_type:"drunk"}), "dram_shop");
ck("a car wreck opens no general block", deriveGeneralBlock({what_happened_type:"vehicle"}), null);

console.log("\nIT REFUSES TO GUESS");
ck("nothing answered yet", d(""), null);
ck("a fall with no setting is not routed", d("fall"), null);
ck("an assault with no setting is not routed", d("attacked"), null);

console.log("\nTHE AGENT NEVER SEES A LEGAL TERM");
const legal = /premises|negligent security|liability|tort|dram shop|malpractice/i;
ck("no legal jargon in what-happened options",
  INCIDENT_TYPES.filter(o => legal.test(o.label)).map(o=>o.value), []);
ck("no legal jargon in setting options",
  INCIDENT_SETTINGS.filter(o => legal.test(o.label)).map(o=>o.value), []);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
