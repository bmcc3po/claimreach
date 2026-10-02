import assert from "node:assert/strict";
import { INBOUND_DOCUMENT_TYPES, NETFLY_DOCUMENT_KINDS, netflyDocumentKey, netflyPhotoRequest } from "./netfly-documents.ts";

assert.deepEqual(NETFLY_DOCUMENT_KINDS.map((kind) => kind.key), [
  "netfly_driver_license", "netfly_health_insurance", "netfly_auto_insurance", "netfly_police_report", "netfly_car_damage",
]);
assert.ok(INBOUND_DOCUMENT_TYPES.has("client_photo"));
assert.ok(INBOUND_DOCUMENT_TYPES.has("client_doc"));
assert.equal(netflyDocumentKey("firm/lead/mms-1.jpg", "firm", "lead"), "firm/lead/mms-1.jpg");
for (const path of ["firm/other/mms-1.jpg", "firm/lead/../other.jpg", "firm/lead/%2e%2e/other.jpg", "firm/lead//other.jpg", "firm/lead/\\other.jpg"]) {
  assert.equal(netflyDocumentKey(path, "firm", "lead"), null, `unsafe document key: ${path}`);
}
const sms = netflyPhotoRequest("Sample Client");
for (const phrase of ["driver's license", "health insurance card", "auto insurance card", "police report", "vehicle damage", "do not text your Social Security number", "STOP"]) {
  assert.ok(sms.toLowerCase().includes(phrase.toLowerCase()), `photo request must explain ${phrase}`);
}
console.log("NETFLY document categories, storage scope, and request text passed");
