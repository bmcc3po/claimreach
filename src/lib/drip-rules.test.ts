// Drip campaign scoping. Run: npx tsx src/lib/drip-rules.test.ts
import {
  DRIP_CAMPAIGN_NONE, M6_DRIP_CAMPAIGN,
  collectDripCampaignKeys, dripAssignLabel, dripCampaignClause,
  dripCampaignLabel, dripChannelLabel, dripStepKey, sortDripRules,
} from "./drip-rules";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nDRIP CAMPAIGN CLAUSE");
check("blank is all", dripCampaignClause(""), { kind: "all" });
check("null is all", dripCampaignClause(null), { kind: "all" });
check("none sentinel", dripCampaignClause(DRIP_CAMPAIGN_NONE), { kind: "none" });
check("motel6 is eq", dripCampaignClause(M6_DRIP_CAMPAIGN), { kind: "eq", value: "motel6" });
check("trimmed", dripCampaignClause("  motel6  "), { kind: "eq", value: "motel6" });

console.log("\nLABELS");
check("motel6 label", dripCampaignLabel("motel6"), "Motel 6");
check("null label", dripCampaignLabel(null), "Unscoped");
check("other key kept", dripCampaignLabel("prison"), "prison");
check("sms label", dripChannelLabel("sms"), "Text");
check("email label", dripChannelLabel("email"), "Email");
check("call label", dripChannelLabel("call_reminder"), "Call reminder");
check("both assign", dripAssignLabel("both"), "Both");

console.log("\nSTEP KEY");
check("keeps existing", dripStepKey("Hello", "s01_arrival_sms"), "s01_arrival_sms");
const generated = dripStepKey("Day 0 arrival SMS");
check("new key is custom prefixed", generated.startsWith("custom_day_0_arrival_sms_"), true);
check("new keys differ", dripStepKey("Same") === dripStepKey("Same"), false);

console.log("\nCAMPAIGN KEYS");
check("sort by stage then delay", sortDripRules([
  { name: "B", stage: "05", delay_days: 14, every_days: 14 },
  { name: "A", stage: "01", delay_days: 0, every_days: 0 },
  { name: "C", stage: "05", delay_days: 3, every_days: 3 },
]).map((r) => r.name), ["A", "C", "B"]);
check("motel6 first then alpha", collectDripCampaignKeys([
  { campaign: "prison" }, { campaign: null }, { campaign: "motel6" }, { campaign: "motel6" }, { campaign: "" },
]), ["motel6", "prison"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
