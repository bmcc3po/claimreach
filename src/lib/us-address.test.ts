// npx tsx src/lib/us-address.test.ts
import assert from "node:assert/strict";
import { splitUsAddress, joinUsAddress, mailColumnsFrom } from "./us-address";

let pass = 0;
function t(name: string, fn: () => void) { fn(); pass++; console.log("ok", name); }

t("the TMP-1192 line splits", () => {
  assert.deepEqual(splitUsAddress("18475 Zurich Ln, Tinley Park, IL 60477"), { street: "18475 Zurich Ln", city: "Tinley Park", state: "IL", zip: "60477" });
});
t("no comma before the state", () => {
  assert.deepEqual(splitUsAddress("18475 Zurich Ln, Tinley Park IL 60477"), { street: "18475 Zurich Ln", city: "Tinley Park", state: "IL", zip: "60477" });
});
t("state spelled out, two words, ZIP+4, USA suffix", () => {
  assert.deepEqual(splitUsAddress("12 Main St Apt 4, Las Cruces, New Mexico 88001-1234, USA"), { street: "12 Main St Apt 4", city: "Las Cruces", state: "NM", zip: "88001-1234" });
});
t("apartment on its own comma part stays with the street", () => {
  assert.deepEqual(splitUsAddress("500 Fremont St, Apt 12, Las Vegas, NV 89101"), { street: "500 Fremont St, Apt 12", city: "Las Vegas", state: "NV", zip: "89101" });
});
t("no ZIP still splits", () => {
  assert.deepEqual(splitUsAddress("9 Elm Rd, Houston, TX"), { street: "9 Elm Rd", city: "Houston", state: "TX", zip: "" });
});
t("a bare street is never guessed apart", () => {
  assert.equal(splitUsAddress("18475 Zurich Ln"), null);
  assert.equal(splitUsAddress("Tinley Park, IL"), null);
  assert.equal(splitUsAddress(""), null);
  assert.equal(splitUsAddress("123 Main St, Springfield, ZZ 12345"), null);
});
t("PO box counts as a street", () => {
  assert.deepEqual(splitUsAddress("PO Box 44, Mobile, AL 36601"), { street: "PO Box 44", city: "Mobile", state: "AL", zip: "36601" });
});
t("join round-trips", () => {
  assert.equal(joinUsAddress({ street: "18475 Zurich Ln", city: "Tinley Park", state: "IL", zip: "60477" }), "18475 Zurich Ln, Tinley Park, IL 60477");
  assert.equal(joinUsAddress({ street: "1 A St" }), "1 A St");
});
t("tidying fills blanks only; a fresh address replaces all", () => {
  assert.deepEqual(mailColumnsFrom({}, "18475 Zurich Ln, Tinley Park, IL 60477"), { mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477" });
  assert.deepEqual(mailColumnsFrom({ mail_city: "Chicago", mail_state: "IL" }, "18475 Zurich Ln, Tinley Park, IL 60477"), { mail_addr1: "18475 Zurich Ln", mail_zip: "60477" });
  assert.deepEqual(mailColumnsFrom({ mail_city: "Chicago", mail_state: "IL", mail_zip: "60601" }, "18475 Zurich Ln, Tinley Park, IL 60477", true), { mail_addr1: "18475 Zurich Ln", mail_city: "Tinley Park", mail_state: "IL", mail_zip: "60477" });
  assert.equal(mailColumnsFrom({}, "18475 Zurich Ln"), null);
});
console.log(`${pass} passed`);
