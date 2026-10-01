import assert from "node:assert/strict";
import { outreachZone, placeOutreach, type DialSummary } from "./outreach-stage";

const receipt = "2026-09-29T14:00:00Z"; // Tuesday 9 AM Central
const now = new Date("2026-09-29T14:01:00Z");
const times = ["14:00", "14:02", "14:10", "14:25", "14:45", "15:15", "16:00", "17:00", "18:15", "19:30"]
  .map(t => `2026-09-29T${t}:00Z`);
function missed(total: number, dialTimes = times.slice(0, total)): DialSummary {
  return { local_zone: "America/Chicago", shared_phone: false, total_dials: total, dials_today: total,
    unanswered_dials: total, answered_dials: 0, unverified_dials: 0,
    first_call_at: dialTimes[0] || null, last_call_at: dialTimes[total - 1] || null, dial_times: dialTimes, outbound_sms_times: [] };
}
const place = (s: DialSummary | null, first: string | null = null, matters = 1, at = now) => placeOutreach(s, first, matters, receipt, at);
assert.equal(outreachZone(null, "North Carolina", "7025550100"), "America/New_York");
assert.equal(outreachZone(null, null, "7025550100"), "America/Los_Angeles");
assert.equal(outreachZone(null, null, "9845550100"), "America/New_York");
assert.equal(outreachZone(null, null, "6015550100"), "America/Chicago");
assert.equal(outreachZone(null, null, "6025550100"), "America/Phoenix");
assert.equal(outreachZone(null, null, "4235550100"), "America/New_York");
assert.equal(outreachZone(null, null, "9015550100"), "America/Chicago");
assert.equal(outreachZone("Mountain", "Arizona", "6025550100"), "America/Phoenix");
assert.equal(outreachZone("America/Chicago", "Nevada", "7025550100"), "America/Chicago");
assert.equal(outreachZone(null, null, "0005550100"), null);
assert.equal(place({ ...missed(0), local_zone: outreachZone(null, "Nevada", "0005550100") }, null, 1,
  new Date("2026-09-29T16:01:00Z")).stage, "due");
assert.equal(place(missed(0)).stage, "due");
assert.equal(place(missed(0)).badge, "new");
assert.equal(place(missed(0)).overdue, true);
assert.equal(place(missed(0), receipt).stage, "review");
assert.equal(place(missed(1)).stage, "wait");
assert.equal(place(missed(2), null, 1, new Date("2026-09-29T14:10:00Z")).textPrompt, false);
assert.equal(place(missed(3), null, 1, new Date("2026-09-29T14:11:00Z")).textStep, 1);
assert.equal(place(missed(3), null, 1, new Date("2026-09-29T14:11:00Z")).textAfterCall, true);
assert.equal(place({ ...missed(3), outbound_sms_times: ["2026-09-29T14:10:30Z"] }).textPrompt, false);
assert.equal(place(missed(6), null, 1, new Date("2026-09-29T16:00:00Z")).textPrompt, true);
assert.equal(place(missed(6), null, 1, new Date("2026-09-29T16:00:00Z")).textAfterCall, false);
assert.equal(place({ ...missed(6), outbound_sms_times: ["2026-09-29T14:10:30Z"] }, null, 1,
  new Date("2026-09-29T16:00:00Z")).textPrompt, false);
assert.equal(place({ ...missed(7), outbound_sms_times: ["2026-09-29T14:10:30Z"] }).textStep, 2);
assert.equal(place({ ...missed(7), outbound_sms_times: ["2026-09-29T14:10:30Z"] }).textAfterCall, true);
assert.equal(place({ ...missed(7), outbound_sms_times: ["2026-09-29T16:00:30Z"] }).textPrompt, false);
assert.equal(place(missed(9), null, 1, new Date("2026-09-29T19:30:00Z")).nextAttempt, 10);
assert.equal(place(missed(10), null, 1, new Date("2026-09-30T13:00:00Z")).stage, "due");
assert.equal(place(missed(10)).stage, "wait");
assert.equal(place(missed(1), null, 1, new Date("2026-09-29T14:20:00Z")).badge, "overdue");
assert.equal(place(missed(1), null, 1, new Date("2026-09-29T14:02:01Z")).badge, "overdue");
assert.equal(place({ ...missed(2), answered_dials: 1, unanswered_dials: 1 }, null, 1,
  new Date("2026-09-29T14:20:00Z")).stage, "due");
assert.equal(place({ ...missed(2), answered_dials: 1, unanswered_dials: 1 }, null, 1,
  new Date("2026-09-29T14:03:00Z")).stage, "wait");
assert.equal(place({ ...missed(2), unverified_dials: 1, unanswered_dials: 1 }).stage, "review");
assert.equal(place({ ...missed(2), local_zone: null }).stage, "review");
assert.equal(place({ ...missed(2), shared_phone: true }).stage, "review");
assert.equal(place(missed(2), null, 2).stage, "review");
assert.equal(place(null).stage, "review");
const fifteenTimes = [...times, ...["13:00", "14:30", "16:30", "18:30", "20:30"].map(t => `2026-09-30T${t}:00Z`)];
assert.equal(place(missed(15, fifteenTimes), null, 1, new Date("2026-10-01T13:00:00Z")).stage, "due");
assert.equal(place(missed(15, fifteenTimes), null, 1, new Date("2026-10-08T13:00:00Z")).stage, "review");
console.log("23 outreach placement checks passed");
