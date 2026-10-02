import assert from "node:assert/strict";
import { NETFLY_WELCOME_STEPS, netflyFirstCallSources, netflyFirstConversationReview } from "./netfly-first-conversation";
import { NETFLY_FIELD_IDS, NETFLY_UNAVAILABLE_IDS } from "./netfly-ontake";

const active = NETFLY_WELCOME_STEPS.flatMap((step) => [...step.fields]);
assert.equal(active.length, new Set(active).size, "the welcome call must not repeat a question");
for (const id of active) assert.ok(NETFLY_FIELD_IDS.has(id), `${id} must save through the existing field registry`);
for (const id of ["confirmed_phone", "confirmed_email", "mailing_address", "accident_date", "road", "accident_city", "accident_state", "police_report", "police_department", "seen_doctor", "first_visit", "first_provider", "auto_carrier", "other_insurer", "passengers"]) {
  assert.ok(active.includes(id as typeof active[number]), `${id} must be in the active call, not only the archived questionnaire`);
}
for (const id of NETFLY_UNAVAILABLE_IDS) assert.ok(NETFLY_FIELD_IDS.has(`${id}_unavailable`), `${id} needs a saved unavailable answer`);

const contact = { phone: "2025550100", email: "client@example.test", address: "100 Test St, Sample City, GA 30000" };
const core = { accident_date: "2026-09-20", road: "Main and First", accident_city: "Sample City", accident_state: "GA",
  police_report: "CASE-123", police_department: "Sample Police", passengers: "No", seen_doctor: "No", auto_carrier: "Sample insurer" };
const review = (a: Record<string, string>, sources: { label: string; value: string }[] = []) => netflyFirstConversationReview(a, contact, sources);
assert.ok(review(core).every((row) => row.status === "captured"));
assert.ok(review({ ...core, auto_carrier: "", other_insurer: "Other insurer" }).every((row) => row.status === "captured"), "either party's insurance is enough");
assert.equal(review({ ...core, auto_carrier: "", insurance_info_available: "Client's insurance" }).find((row) => row.id === "insurance_info_available")?.status, "missing", "choosing an owner is not the insurance information");
assert.equal(review({ ...core, auto_carrier: "", insurance_info_available: "No details available yet" }).find((row) => row.id === "insurance_info_available")?.status, "follow_up");
const treated = review({ ...core, seen_doctor: "Yes" });
assert.deepEqual(treated.filter((row) => row.status === "missing").map((row) => row.id), ["first_provider", "first_visit"]);
assert.ok(review({ ...core, seen_doctor: "Yes", first_provider: "Sample ER, Sample City", first_visit: "2026-09-21" }).every((row) => row.status === "captured"));
assert.ok(!review(core).some((row) => row.id === "first_visit"), "no treatment must not request a fake visit date");
assert.equal(review({ ...core, accident_date: "", accident_date_unavailable: "Not available yet" }).find((row) => row.id === "accident_date")?.status, "follow_up");
assert.equal(review({ ...core, accident_state: "" }).find((row) => row.label === "Wreck location")?.status, "missing");
assert.ok(review({ ...core, police_came: "No", police_report: "", police_department: "" }).every((row) => row.status === "captured"));
const sourceOnly = { ...core, accident_date: "", road: "", accident_city: "", accident_state: "", police_report: "", passengers: "" };
assert.ok(review(sourceOnly).some((row) => row.status === "missing"), "unconfirmed marketer notes do not count as client-confirmed details");
assert.ok(review(sourceOnly, [{ label: "Accident Date", value: "09/20/2026" }, { label: "Location", value: "Main and First, Sample City GA" }, { label: "Case #", value: "CASE-123" }, { label: "Passengers", value: "None" }]).every((row) => row.status === "captured"));
assert.equal(review({ ...core, passengers: "Yes" }).find((row) => row.id === "passengers")?.status, "captured", "passenger identification stays optional");
const merged = netflyFirstCallSources([{ label: "Accident Date", value: "09/20/2026" }], { "Accident date": "09/21/2026", "Accident location": "Main and First", "Accident city": "Sample City", "Accident state": "GA", "Case number": "CASE-123", Passengers: "None" });
assert.equal(merged.find((row) => row.label === "Accident Date")?.value, "09/20/2026", "readback must preserve the original note when source values conflict");
assert.equal(merged.find((row) => row.label === "Location")?.value, "Main and First, Sample City, GA");
assert.equal(merged.find((row) => row.label === "Passengers")?.value, "None", "structured source answers must be available without re-asking");
console.log("NETFLY first-conversation essentials passed");
