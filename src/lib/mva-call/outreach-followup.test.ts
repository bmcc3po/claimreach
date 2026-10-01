import assert from "node:assert/strict";
import { nextOngoingCall, nextPermittedCall, nextThreePerDayWindowAfter } from "./outreach-followup";

const doneTuesday = "2026-09-29T20:30:00Z"; // 3:30 PM Central
assert.equal(nextOngoingCall(doneTuesday, 0, "America/Chicago").toISOString(), "2026-09-30T13:00:00.000Z");
assert.equal(nextOngoingCall(doneTuesday, 1, "America/Chicago").toISOString(), "2026-09-30T17:00:00.000Z");
assert.equal(nextOngoingCall(doneTuesday, 2, "America/Chicago").toISOString(), "2026-09-30T22:00:00.000Z");
assert.equal(nextOngoingCall(doneTuesday, 3, "America/Chicago").toISOString(), "2026-10-01T13:00:00.000Z");
const doneFriday = "2026-10-02T20:30:00Z";
assert.equal(nextOngoingCall(doneFriday, 0, "America/Chicago").toISOString(), "2026-10-05T13:00:00.000Z");
const beforeDst = "2026-10-30T20:30:00Z";
assert.equal(nextOngoingCall(beforeDst, 0, "America/Chicago").toISOString(), "2026-11-02T14:00:00.000Z");
assert.throws(() => nextOngoingCall(doneTuesday, -1, "America/Chicago"));
assert.equal(nextPermittedCall(new Date("2026-09-30T02:00:00Z"), "America/Chicago").toISOString(), "2026-09-30T13:00:00.000Z");
assert.equal(nextThreePerDayWindowAfter(new Date("2026-09-30T15:00:00Z"), "America/Chicago").toISOString(), "2026-09-30T17:00:00.000Z");
assert.equal(nextThreePerDayWindowAfter(new Date("2026-09-30T23:30:00Z"), "America/Chicago").toISOString(), "2026-10-01T13:00:00.000Z");
console.log("10 ongoing-window checks passed");
