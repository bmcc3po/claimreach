import assert from "node:assert/strict";
import { NETFLY_EMAIL_TO, netflyEmailFingerprint, netflyHtmlToText, parseNetflySigningEmail, validNetflyRetainerPdf, validateNetflyEmailEnvelope } from "./netfly-email";
import { netflyMissingHandoffQuestions, parseNetflyHandoff } from "./netfly-ontake";

const email = `Hi Team Turnbull,\n\nHere are the agent notes:\n\nAccident Intake Note – Turnbull Law\nClient/Driver: Sample Client\nAccident Date: 09/04/2026\nLocation: Kansas City, Missouri – Highway 70\nCase #: 24054284\nPassengers: None\nAirbags: Did not deploy\nAccident Summary: Sample Client was rear-ended while stopped with hazard lights on.\nInsurance: Both parties were insured.\nInjuries & Treatment: Head and back pain; treatment is not fully established.\nRepresentation: No other attorney.\nNext Steps: Ready for the firm call.\n`;
const parsed = parseNetflySigningEmail(email);
assert.equal(parsed?.name, "Sample Client");
assert.equal(parseNetflySigningEmail(email.replace("Intake Note -", "Intake Note –"))?.name, "Sample Client", "the supplied NETFLY format uses an en dash");
assert.equal(parsed?.phone, "", "sender information is never the client's phone");
assert.equal(parsed?.email, "", "sender information is never the client's email");
assert.equal(parseNetflySigningEmail(netflyHtmlToText(`<p>Accident Intake Note – Turnbull Law</p><p><b>Client/Driver:</b> Sample Client</p><p><b>Accident Date:</b> 09/04/2026</p><p><b>Accident Summary:</b> Rear-ended while stopped.</p>`))?.name, "Sample Client");
assert.deepEqual(netflyMissingHandoffQuestions(parseNetflyHandoff(parsed!.note)), []);
assert.deepEqual(netflyMissingHandoffQuestions(parseNetflyHandoff("Client/Driver: Sample Client\nAccident Date: 09/04/2026\nAccident Summary: Rear-ended.")),
  ["accident_city", "accident_state", "road", "police_report", "passengers", "passenger_details", "treated_injuries", "other_lawyer_signed"]);
assert.equal(parseNetflySigningEmail("New Signing! Sample Client"), null);
assert.equal(validateNetflyEmailEnvelope({ from: "haleema@netflydigital.com", headerFrom: "Haleema <haleema@netflydigital.com>", to: NETFLY_EMAIL_TO, subject: "Re: New Signing! Sample Client" }), null);
assert.ok(validateNetflyEmailEnvelope({ from: "stranger@example.com", headerFrom: "Haleema <haleema@netflydigital.com>", to: NETFLY_EMAIL_TO, subject: "New Signing! Sample Client" }));
assert.ok(validateNetflyEmailEnvelope({ from: "haleema@netflydigital.com", headerFrom: "Haleema <haleema@netflydigital.com>", to: "m6-intake@inbound.claimreach.com", subject: "New Signing! Sample Client" }));
const pdf = new TextEncoder().encode(`%PDF-1.4\n${"x".repeat(120)}\n%%EOF`);
assert.equal(validNetflyRetainerPdf("signed-retainer.pdf", pdf), true);
assert.equal(validNetflyRetainerPdf("signed-retainer.pdf", new TextEncoder().encode("not a PDF")), false);
void (async () => {
  const first = await netflyEmailFingerprint(parsed!.note, pdf);
  assert.equal(first, await netflyEmailFingerprint(`  ${parsed!.note.replace(/\s+/g, "   ")}  `, pdf), "forwarding or whitespace changes must not duplicate a signed file");
  assert.notEqual(first, await netflyEmailFingerprint(parsed!.note, new TextEncoder().encode(`%PDF-1.4\n${"y".repeat(120)}\n%%EOF`)));
  console.log("NETFLY email parsing, gap selection, and PDF validation passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
