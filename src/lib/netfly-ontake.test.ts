import assert from "node:assert/strict";
import { NETFLY_ANSWER_KEY, NETFLY_SECTIONS, NETFLY_FIELD_IDS, netflyFlags, parseNetflyHandoff, validateNetflyCallClose, type NetflyCallClose } from "./netfly-ontake";

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
const source = parseNetflyHandoff("Accident Intake Note – Turnbull Law\nClient/Driver: Sample Client\nAccident Date: 09/04/2026\nAccident Summary: First sentence.\nContinued detail.\nInsurance: Details were missing, but have now been obtained.\nNext Steps: Ready for welcome call.");
assert.deepEqual(source.map((item) => item.label), ["Client/Driver", "Accident Date", "Accident Summary", "Insurance", "Next Steps"]);
assert.equal(source.find((item) => item.label === "Accident Summary")?.value, "First sentence. Continued detail.");
assert.equal(source.find((item) => item.label === "Insurance")?.value, "Details were missing, but have now been obtained.");
const close: NetflyCallClose = { completion: "complete", disposition: "appears_qualified", dq_reason_key: "", assessment_reason: "", transfer_destination: "", transfer_outcome: "client_declined", transfer_note: "Client prefers a callback.", client_notified_48_business_hours: false };
assert.match(validateNetflyCallClose(close) || "", /48 business hours/);
assert.equal(validateNetflyCallClose({ ...close, client_notified_48_business_hours: true }), null);
assert.match(validateNetflyCallClose({ ...close, transfer_outcome: "connected" }) || "", /number or queue/);
assert.equal(validateNetflyCallClose({ ...close, transfer_outcome: "attempted_no_answer", transfer_destination: "case-manager queue" }), null);
assert.match(validateNetflyCallClose({ ...close, transfer_outcome: "not_attempted", transfer_note: "" }) || "", /why/);
assert.match(validateNetflyCallClose({ ...close, completion: "incomplete" }) || "", /Finish the ontake/);
assert.match(validateNetflyCallClose({ ...close, completion: "incomplete", disposition: "callback_to_finish" }) || "", /explain this outcome/i);
assert.equal(validateNetflyCallClose({ ...close, completion: "incomplete", disposition: "callback_to_finish", assessment_reason: "Call client tomorrow afternoon." }), null);
assert.match(validateNetflyCallClose({ ...close, disposition: "appears_dq", dq_reason_key: "" }) || "", /DQ reason/);
assert.equal(validateNetflyCallClose({ ...close, disposition: "appears_dq", dq_reason_key: "criteria", assessment_reason: "Liability needs supervisor review." }), null);
assert.equal(validateNetflyCallClose({ ...close, disposition: "client_remorse", assessment_reason: "Client disputes representation; supervisor to call." }), null);
const callbackClose: NetflyCallClose = { ...close, closeout_version: 2, transfer_outcome: "not_attempted", transfer_note: "", client_notified_48_business_hours: false, callback_promised_24_48_hours: false };
assert.match(validateNetflyCallClose(callbackClose) || "", /24–48 hours/);
assert.equal(validateNetflyCallClose({ ...callbackClose, callback_promised_24_48_hours: true }), null);
assert.equal(validateNetflyCallClose({ ...callbackClose, callback_promised_24_48_hours: true, disposition: "callback_to_finish", completion: "incomplete", assessment_reason: "Call client to complete missing details." }), null);
assert.match(validateNetflyCallClose({ ...callbackClose, callback_promised_24_48_hours: true, disposition: "appears_dq", dq_reason_key: "" }) || "", /DQ reason/);
console.log("NETFLY source map and review triggers passed");
