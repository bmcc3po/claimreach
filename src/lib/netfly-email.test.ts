import assert from "node:assert/strict";
import { parseNetflySigningEmail } from "./netfly-email";
import { netflyMissingHandoffQuestions, parseNetflyHandoff } from "./netfly-ontake";

const email = `Hi Team Turnbull,\n\nHere are the agent notes:\n\nAccident Intake Note – Turnbull Law\nClient/Driver: Sample Client\nAccident Date: 09/04/2026\nLocation: Kansas City, Missouri – Highway 70\nCase #: 24054284\nPassengers: None\nAirbags: Did not deploy\nAccident Summary: Sample Client was rear-ended while stopped with hazard lights on.\nInsurance: Both parties were insured.\nInjuries & Treatment: Head and back pain; treatment is not fully established.\nRepresentation: No other attorney.\nNext Steps: Ready for the firm call.\n`;
const parsed = parseNetflySigningEmail(email);
assert.equal(parsed?.name, "Sample Client");
assert.equal(parseNetflySigningEmail(email.replace("Intake Note -", "Intake Note –"))?.name, "Sample Client", "the supplied NETFLY format uses an en dash");
assert.equal(parsed?.phone, "", "sender information is never the client's phone");
assert.equal(parsed?.email, "", "sender information is never the client's email");
assert.deepEqual(netflyMissingHandoffQuestions(parseNetflyHandoff(parsed!.note)), []);
assert.deepEqual(netflyMissingHandoffQuestions(parseNetflyHandoff("Client/Driver: Sample Client\nAccident Date: 09/04/2026\nAccident Summary: Rear-ended.")),
  ["accident_city", "accident_state", "road", "police_report", "passengers", "passenger_details", "treated_injuries", "other_lawyer_signed"]);
assert.equal(parseNetflySigningEmail("New Signing! Sample Client"), null);
console.log("NETFLY email parsing and gap selection passed");
