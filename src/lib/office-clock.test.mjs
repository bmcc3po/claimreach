import assert from "node:assert/strict";
import { officeDateISO, officeDateUS, officeDateTime } from "./office-clock.ts";

// UTC has crossed midnight, but the office calendar has not.
assert.equal(officeDateISO("2026-09-30T02:00:00Z"), "2026-09-29");
assert.equal(officeDateUS("2026-09-30T02:00:00Z"), "09/29/2026");
assert.equal(officeDateTime("2026-09-30T02:00:00Z"), "9/29, 7:00 PM PT");

// Los Angeles moves from PDT to PST; the named zone handles both offsets.
assert.equal(officeDateISO("2026-11-01T06:30:00Z"), "2026-10-31");
assert.equal(officeDateISO("2026-11-01T08:30:00Z"), "2026-11-01");
assert.equal(officeDateUS("2026-12-01T07:30:00Z"), "11/30/2026");
assert.throws(() => officeDateISO("bad timestamp"));
