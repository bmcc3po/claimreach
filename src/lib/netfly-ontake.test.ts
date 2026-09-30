import assert from "node:assert/strict";
import { NETFLY_ANSWER_KEY, NETFLY_SECTIONS, NETFLY_FIELD_IDS, netflyFlags } from "./netfly-ontake";

assert.equal(NETFLY_ANSWER_KEY, "netfly_secondary");
assert.equal(NETFLY_SECTIONS.length, 8);
const all = NETFLY_SECTIONS.flatMap((section) => section.fields);
assert.equal(all.length, NETFLY_FIELD_IDS.size, "question keys must be unique");
const seen = new Set<string>();
for (const field of all) {
  if (field.when) assert.ok(seen.has(field.when.id), `${field.id} depends on a later question`);
  seen.add(field.id);
}
for (const required of ["seen_doctor", "first_provider", "dob", "accident_date", "incident_story", "passenger_details", "death", "hospital_days", "police_report", "other_insurer", "damage", "um_uim", "recorded_statement", "days_missed", "other_lawyer_signed", "wants_cancel"]) {
  assert.ok(NETFLY_FIELD_IDS.has(required), `source question missing: ${required}`);
}
assert.deepEqual(netflyFlags({ seen_doctor: "Not sure", fault: "Unclear" }), []);
assert.ok(netflyFlags({ death: "Yes" })[0].includes("now"));
assert.ok(netflyFlags({ hospital_days: "10 days" })[0].includes("now"));
assert.ok(netflyFlags({ commercial_truck: "Yes", serious_injury: "Yes" })[0].includes("now"));
assert.ok(netflyFlags({ seen_doctor: "No" }).some((item) => item.includes("No treatment")));
assert.ok(netflyFlags({ wants_cancel: "Yes" }).some((item) => item.includes("Cancellation")));
console.log("NETFLY source map and review triggers passed");
