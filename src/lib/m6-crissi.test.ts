// M6 Crissi doctrine. Run: npx tsx src/lib/m6-crissi.test.ts
import { ALWAYS_RULES, M6_CRISSI_GUIDANCE, M6_SENDING_NUMBER } from "./m6-cadence";
import {
  buildM6CrissiSystem, doctrineIsPrisonHub, m6CampaignDoctrine, M6_CRISSI_CHIPS,
} from "./m6-crissi";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nM6 CRISSI");
const doctrine = m6CampaignDoctrine();
check("doctrine is motel, not prison", doctrineIsPrisonHub(doctrine), false);
check("doctrine names TMP / Motel", /motel 6/i.test(doctrine) && /Turnbull/i.test(doctrine), true);
check("guidance title is Motel 6", /Motel 6/.test(M6_CRISSI_GUIDANCE.title), true);
check("same sending number", M6_SENDING_NUMBER, "+12562075828");
check("always rules present", ALWAYS_RULES.length >= 9, true);
check("chips for live chat", M6_CRISSI_CHIPS.length >= 4, true);

const sys = buildM6CrissiSystem({ id: "u1", name: "Ada Cole", leadNo: "TMP-1001", commsMonitored: true });
check("knows the file name", sys.includes("Ada Cole"), true);
check("knows the TMP number", sys.includes("TMP-1001"), true);
check("monitored gate in prompt", /monitored/i.test(sys), true);
check("forbids prison hub", /never use california women's prison/i.test(sys), true);
check("forbids Maverick", /never speak as maverick/i.test(sys), true);
check("uses Crissi SOP say-line", sys.includes(M6_CRISSI_GUIDANCE.say[0]), true);

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log(`\n${pass} passed`);
