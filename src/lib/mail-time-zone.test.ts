import assert from "node:assert/strict";
import { inferMailTimeZone, normalizeTimeZone, timeZoneLabel } from "./mail-time-zone";

assert.equal(inferMailTimeZone("TX", "76262"), "America/Chicago");
assert.equal(inferMailTimeZone("TX", "79901"), null, "multi-zone ZIPs require verification");
assert.equal(inferMailTimeZone("IL", null), "America/Chicago");
assert.equal(inferMailTimeZone("FL", ""), null);
assert.equal(timeZoneLabel("America/Chicago"), "Central");
assert.equal(normalizeTimeZone("Central"), "America/Chicago");
console.log("mailing time zone checks passed");

