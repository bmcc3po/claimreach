// Cadence engine. Run: npx tsx src/lib/m6-cadence.test.ts
import {
  ALWAYS_RULES, HEARTBEAT_INITIAL_DAYS, HEARTBEAT_STEADY_DAYS, LADDER_STEPS,
  M6_SENDING_NUMBER, M6_TEMPLATES,
  actorFirmLabel, addDays, bodyHasForbiddenLegal, commandGauges, daysBetween,
  enterLadderOnInterviewMiss, evaluateOutboundGates, fileFacts, heartbeatIntervalDays,
  idempotencyKey, inQuietHours, isStopKeyword, ladderStepFromDays,
  mergeCadenceText, nextMove, resolveCadenceStage, safeChannelsAllow, templateByKey,
  templatesForAudience, timezoneFromPhone, todayBuckets, twoWayStopsLadder,
  walkCadence,
} from "./m6-cadence";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nRUN SHEET SEED");
check("22 run-sheet templates", M6_TEMPLATES.length, 22);
check("9 ALWAYS rules", ALWAYS_RULES.length, 9);
check("9 ladder steps", LADDER_STEPS.length, 9);
check("ladder day offsets match the run sheet", LADDER_STEPS.map((s) => s.dayOffset), [0, 2, 4, 7, 10, 14, 18, 21, 30]);
check("sending number is the M6 line", M6_SENDING_NUMBER, "+12562075828");
check("day 0 SMS is unapproved until Josh", templateByKey("s01_arrival_sms")?.approvedByFirm, false);
check("day 0 SMS names Turnbull", /Turnbull Moak and Pendergrass/.test(templateByKey("s01_arrival_sms")!.body), true);
check("thank-you asks them to save the number", /Save this number/.test(templateByKey("s03_thanks_sms")!.body), true);
check("day 14 asks still-your-best-number", /Still your best number/.test(templateByKey("s04_day14_sms")!.body), true);
check("step 4 is the approved EC script", /not able to share anything about her matter/.test(templateByKey("s06_s4_ec")!.body), true);
check("step 1 VM does not name Motel 6", /motel/i.test(templateByKey("s06_s1_vm")!.body), false);
check("staff see drafts", templatesForAudience({ isStaff: true }).length, 22);
check("firm sees drafts too (cannot live-send)", templatesForAudience({ isStaff: false }).length, 22);
check("approved-only is empty until Josh", templatesForAudience({ isStaff: true, approvedOnly: true }).length, 0);

console.log("\nMERGE + ALWAYS");
check("merge first/agent/number", mergeCadenceText("Hi [First], [Agent] at [number]", {
  first: "Ada", agent: "Yvette", number: "+12562075828",
}), "Hi Ada, Yvette at +12562075828");
check("STOP is a stop", isStopKeyword("STOP"), true);
check("stop with junk around still counts", isStopKeyword("  stop please "), true);
check("hello is not stop", isStopKeyword("hello"), false);
check("filed language is forbidden", bodyHasForbiddenLegal("your case is filed"), true);
check("on track is allowed", bodyHasForbiddenLegal("everything is moving the way it should"), false);

console.log("\nHEARTBEAT CLOCK");
check("first 90 days is 14", heartbeatIntervalDays(0), HEARTBEAT_INITIAL_DAYS);
check("day 89 is still 14", heartbeatIntervalDays(89), 14);
check("day 90 switches to 30", heartbeatIntervalDays(90), HEARTBEAT_STEADY_DAYS);
check("two-way stops the ladder", twoWayStopsLadder("two_way"), true);
check("voicemail does not stop the ladder", twoWayStopsLadder("voicemail"), false);
check("interview no-answer enters the ladder", enterLadderOnInterviewMiss("no_answer"), true);
check("ladder step on day 0 is 1", ladderStepFromDays(0), 1);
check("ladder step on day 4 is 3", ladderStepFromDays(4), 3);
check("ladder step on day 30 is 9", ladderStepFromDays(30), 9);

const NOW = "2026-08-23T17:00:00.000Z";
const T0 = "2026-08-23T12:00:00.000Z";

console.log("\nSTAGE WALKER");
const arrival = resolveCadenceStage({
  arrivedAt: T0, interviewAt: null, lastTwoWayAt: null, lastTouchAt: null,
  lastInterviewOutcome: null, retentionStage: "onboarding", pausedUntil: null, now: T0,
});
check("day 0 is stage 01", arrival.stage, "01");
check("day 0 does not enter the ladder", arrival.enterLadder, false);

const day2 = resolveCadenceStage({
  arrivedAt: addDays(T0, -2), interviewAt: null, lastTwoWayAt: null, lastTouchAt: null,
  lastInterviewOutcome: null, retentionStage: "onboarding", pausedUntil: null, now: T0,
});
check("day 2 uninterviewed is stage 02", day2.stage, "02");

const miss = resolveCadenceStage({
  arrivedAt: addDays(T0, -2), interviewAt: null, lastTwoWayAt: null, lastTouchAt: T0,
  lastInterviewOutcome: "no_answer", retentionStage: "onboarding", pausedUntil: null, now: T0,
});
check("missed interview enters ladder", miss.enterLadder, true);
check("missed interview is stage 06", miss.stage, "06");
check("missed interview starts at step 1", miss.ladderStep, 1);

const thanks = resolveCadenceStage({
  arrivedAt: addDays(T0, -5), interviewAt: T0, lastTwoWayAt: T0, lastTouchAt: T0,
  lastInterviewOutcome: "two_way", retentionStage: "heartbeat", pausedUntil: null, now: T0,
});
check("interview complete is stage 03", thanks.stage, "03");
check("heartbeat clock starts", !!thanks.heartbeatDueAt, true);

const onboarding = resolveCadenceStage({
  arrivedAt: addDays(T0, -20), interviewAt: addDays(T0, -10), lastTwoWayAt: addDays(T0, -10),
  lastTouchAt: addDays(T0, -3), lastInterviewOutcome: "two_way",
  retentionStage: "heartbeat", pausedUntil: null, now: T0,
});
check("day 10 after interview is onboarding", onboarding.stage, "04");

const hb = resolveCadenceStage({
  arrivedAt: addDays(T0, -120), interviewAt: addDays(T0, -40), lastTwoWayAt: addDays(T0, -20),
  lastTouchAt: addDays(T0, -20), lastInterviewOutcome: "two_way",
  retentionStage: "heartbeat", pausedUntil: null, now: T0,
});
check("past day 30 is heartbeat", hb.stage, "05");
check("20 days since two-way is overdue on a 14-day clock", hb.heartbeatOverdue, true);

const paused = resolveCadenceStage({
  arrivedAt: addDays(T0, -40), interviewAt: addDays(T0, -30), lastTwoWayAt: addDays(T0, -20),
  lastTouchAt: addDays(T0, -20), lastInterviewOutcome: "two_way",
  retentionStage: "paused", pausedUntil: "2026-09-01", now: NOW,
});
check("paused file does not enter the ladder", paused.enterLadder, false);
check("paused reason", paused.reason, "paused");

const dueArrival = walkCadence({
  arrivedAt: T0, interviewAt: null, lastTwoWayAt: null, lastTouchAt: null,
  lastInterviewOutcome: null, retentionStage: "onboarding", pausedUntil: null, now: T0,
});
check("day 0 walker wants SMS + email", dueArrival.map((d) => d.templateKey).sort(), [
  "s01_arrival_email", "s01_arrival_sms",
]);

const dueMiss = walkCadence({
  arrivedAt: addDays(T0, -2), interviewAt: null, lastTwoWayAt: null, lastTouchAt: T0,
  lastInterviewOutcome: "no_answer", retentionStage: "escalation", pausedUntil: null, now: T0,
});
check("interview miss walker starts the ladder", dueMiss.some((d) => d.templateKey === "s06_s1_vm"), true);

const dueThanks = walkCadence({
  arrivedAt: addDays(T0, -5), interviewAt: T0, lastTwoWayAt: T0, lastTouchAt: T0,
  lastInterviewOutcome: "two_way", retentionStage: "heartbeat", pausedUntil: null, now: T0,
});
check("interview complete walker wants thank-you", dueThanks.some((d) => d.templateKey === "s03_thanks_sms"), true);
check("already-sent thank-you is skipped", walkCadence({
  arrivedAt: addDays(T0, -5), interviewAt: T0, lastTwoWayAt: T0, lastTouchAt: T0,
  lastInterviewOutcome: "two_way", retentionStage: "heartbeat", pausedUntil: null, now: T0,
}, ["s03_thanks_sms"]).some((d) => d.templateKey === "s03_thanks_sms"), false);

check("idempotency key is lead+template+day", idempotencyKey("abc", "s01_arrival_sms", "2026-08-23T12:00:00Z"), "m6:abc:s01_arrival_sms:2026-08-23");
check("daysBetween 10", daysBetween("2026-08-13T00:00:00Z", "2026-08-23T00:00:00Z"), 10);

console.log("\nGATES");
const baseGate = {
  channel: "sms" as const,
  body: "Hi Ada, Yvette here. Still your best number?",
  optedOut: false,
  lastInboundBody: null,
  commsMonitored: false,
  safeChannels: null,
  now: new Date("2026-08-23T17:00:00Z"),
  timezone: "America/Chicago",
  quietStart: "08:00",
  quietEnd: "20:00",
  approvedByFirm: false,
  isStaff: true,
  liveSend: false,
  sendingNumber: M6_SENDING_NUMBER,
  hasJustCallKeys: false,
  hasResendKey: false,
};
check("log-only draft is allowed", evaluateOutboundGates(baseGate).canLog, true);
check("log-only draft cannot live send", evaluateOutboundGates(baseGate).canLiveSend, false);
check("opt-out blocks log and send", evaluateOutboundGates({ ...baseGate, optedOut: true }).canLog, false);
check("STOP blocks", evaluateOutboundGates({ ...baseGate, lastInboundBody: "STOP" }).blocked.includes("stop"), true);
check("quiet hours block SMS", evaluateOutboundGates({
  ...baseGate, timezone: "America/Chicago", now: new Date("2026-08-24T04:00:00Z"),
}).blocked.includes("quiet_hours"), true);
check("monitored voicemail is blocked", evaluateOutboundGates({
  ...baseGate, channel: "voicemail", commsMonitored: true,
}).blocked.includes("monitored_voicemail"), true);
check("monitored + unsafe channel", evaluateOutboundGates({
  ...baseGate, commsMonitored: true, safeChannels: ["Call"], channel: "sms",
}).blocked.includes("safe_contact"), true);
check("monitored + case words in SMS", evaluateOutboundGates({
  ...baseGate, commsMonitored: true, body: "Your Motel 6 case is moving",
}).blocked.includes("monitored_case_subject"), true);
check("live send without approval is blocked", evaluateOutboundGates({
  ...baseGate, liveSend: true, approvedByFirm: false, hasJustCallKeys: true,
}).blocked.includes("unapproved_live"), true);
check("live SMS without JustCall is blocked", evaluateOutboundGates({
  ...baseGate, liveSend: true, approvedByFirm: true, hasJustCallKeys: false,
}).blocked.includes("missing_justcall"), true);
check("approved + keys can live send", evaluateOutboundGates({
  ...baseGate, liveSend: true, approvedByFirm: true, hasJustCallKeys: true,
  now: new Date("2026-08-23T17:00:00Z"), timezone: "America/Chicago",
}).canLiveSend, true);
check("safeChannelsAllow Text vs sms", safeChannelsAllow(["Text"], "sms"), true);
check("Vegas area code is Pacific", timezoneFromPhone("7025550100"), "America/Los_Angeles");
check("Jackson MS is Central fallback", timezoneFromPhone("6015550100"), "America/Chicago");
check("quiet 3am Chicago", inQuietHours({
  now: new Date("2026-08-24T08:00:00Z"), timezone: "America/Chicago", start: "08:00", end: "20:00",
}), true);
check("actor firm label", actorFirmLabel("firm"), "Turnbull");
check("actor staff label", actorFirmLabel("agent"), "Innovative");

console.log("\nTODAY BUCKETS");
const files = [
  { lead_id: "a", last_two_way_at: null, health: "red", days_overdue: 20, inbound_waiting: false },
  { lead_id: "b", last_two_way_at: "2026-08-01T00:00:00Z", health: "yellow", days_overdue: 8, inbound_waiting: true },
  { lead_id: "c", last_two_way_at: "2026-08-20T00:00:00Z", health: "green", days_overdue: 0, last_send_failed: true },
  { lead_id: "d", last_two_way_at: "2026-07-01T00:00:00Z", health: "paused", days_overdue: 0, retention_paused_until: "2026-09-01" },
  { lead_id: "e", last_two_way_at: "2026-08-01T00:00:00Z", health: "yellow", days_overdue: 5, opted_out: true },
  { lead_id: "f", last_two_way_at: "2026-08-01T00:00:00Z", health: "yellow", days_overdue: 5, comms_monitored: true, next_channel_blocked: true },
];
const buckets = todayBuckets(files, NOW);
check("never reached is a", buckets.neverReached.map((r) => r.lead_id), ["a"]);
check("replies waiting is b", buckets.repliesWaiting.map((r) => r.lead_id), ["b"]);
check("failed/quiet is overdue-or-failed, not opted-out", buckets.failedQuiet.map((r) => r.lead_id).sort(), ["b", "c", "f"]);
check("paused is d", buckets.ladderPaused.map((r) => r.lead_id), ["d"]);
check("opted out is e", buckets.optedOut.map((r) => r.lead_id), ["e"]);
check("safe-contact conflict is f", buckets.safeContactConflicts.map((r) => r.lead_id), ["f"]);
check("heartbeat overdue is b and f (e opted out)", buckets.heartbeatOverdue.map((r) => r.lead_id).sort(), ["b", "f"]);
check("paused file is not never-reached", buckets.neverReached.some((r) => r.lead_id === "d"), false);

console.log("\nNEXT MOVE");
check("inbound is first", nextMove({
  name: "Lina Khalaf", inboundWaiting: true, lastTwoWayAt: "2026-08-20T00:00:00Z", hasInterview: true,
}).kind, "inbound");
check("inbound names them", nextMove({
  name: "Lina Khalaf", inboundWaiting: true, lastTwoWayAt: "2026-08-20T00:00:00Z", hasInterview: true,
}).headline, "They wrote back. Answer Lina now.");
check("never reached beats ladder", nextMove({
  name: "Lina Khalaf", lastTwoWayAt: null, retentionStage: "escalation", ladderStep: 3,
}).kind, "never_interviewed");
check("never reached line is the interview", nextMove({
  name: "Lina Khalaf", lastTwoWayAt: null,
}).line, "Call the interview. Never reached. No contact web.");
check("ladder uses the run-sheet step", nextMove({
  name: "Ada", lastTwoWayAt: "2026-08-01T00:00:00Z", hasInterview: true,
  enterLadder: true, ladderStep: 3,
}).headline, "Ladder step 3: SMS. Do this today.");
check("ladder action follows the channel", nextMove({
  name: "Ada", lastTwoWayAt: "2026-08-01T00:00:00Z", hasInterview: true,
  enterLadder: true, ladderStep: 3,
}).action, "text");
check("heartbeat overdue", nextMove({
  name: "Lina Khalaf", lastTwoWayAt: "2026-08-01T00:00:00Z", hasInterview: true,
  heartbeatOverdue: true,
}).headline, "Check-in is late. Call Lina. Ask still your best number.");
check("LOR when facts are ready", nextMove({
  name: "Ada", lastTwoWayAt: "2026-08-20T00:00:00Z", hasInterview: true,
  lorStatus: "ready", lorFactsReady: true, liveContactPoints: 3, hasStablePerson: true,
}).kind, "lor");
check("thin web after they are reached", nextMove({
  name: "Ada", lastTwoWayAt: "2026-08-20T00:00:00Z", hasInterview: true,
  liveContactPoints: 1, hasStablePerson: false, lorStatus: "sent",
}).kind, "thin_web");
check("on track names the date", nextMove({
  name: "Ada", lastTwoWayAt: "2026-08-20T00:00:00Z", hasInterview: true,
  liveContactPoints: 3, hasStablePerson: true, lorStatus: "sent",
  nextTouchDue: "2026-09-01T12:00:00Z",
}).headline, "On track. Next check-in Sep 1.");
check("replies sort ahead of never reached", nextMove({ inboundWaiting: true, lastTwoWayAt: null }).sort
  < nextMove({ lastTwoWayAt: null }).sort, true);

const gauges = commandGauges([
  { lead_id: "a", last_two_way_at: null, health: "red", days_overdue: 20, ladder_step: 4 },
  { lead_id: "b", last_two_way_at: "2026-08-20T00:00:00Z", health: "green", days_overdue: 0, inbound_waiting: true },
  { lead_id: "c", last_two_way_at: "2026-08-20T00:00:00Z", health: "green", days_overdue: 0 },
  { lead_id: "d", last_two_way_at: "2026-08-01T00:00:00Z", health: "yellow", days_overdue: 8, retention_stage: "escalation", ladder_step: 3 },
], { nowIso: NOW, lorNotSentIds: new Set(["a", "c"]) });
check("gone dark includes never reached and ladder", gauges.gone_dark.map((r) => r.lead_id).sort(), ["a", "d"]);
check("replies gauge is b", gauges.replies.map((r) => r.lead_id), ["b"]);
check("moving is last two-way in 7 days", gauges.moving.map((r) => r.lead_id).sort(), ["b", "c"]);
check("ladder is escalation or a step", gauges.ladder.map((r) => r.lead_id).sort(), ["a", "d"]);
check("lor not sent uses the join set", gauges.lor_not_sent.map((r) => r.lead_id).sort(), ["a", "c"]);

const facts = fileFacts({
  hasInterview: false, livePhones: 1, hasStablePerson: false,
  lorSent: false, hasTwoWay: false, commsMonitored: true,
});
check("lacking interview", facts.find((f) => f.id === "interview")?.done, false);
check("lacking second number", facts.find((f) => f.id === "second_number")?.done, false);
check("monitored is not done", facts.find((f) => f.id === "monitored")?.done, false);
check("done facts stay quiet", fileFacts({
  hasInterview: true, livePhones: 2, hasStablePerson: true,
  lorSent: true, hasTwoWay: true, commsMonitored: false,
}).every((f) => f.done), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
