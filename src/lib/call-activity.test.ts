import assert from "node:assert/strict";
import { test } from "node:test";
import { justcallInboundOutcomes, linkedCallActivity, missedInboundFollowups, summarizeCallActivity } from "./call-activity";

test("inbound and outbound calls count separately only when linked to a file", () => {
  const calls = [
    { id: "in", lead_id: "lead", channel: "call", direction: "inbound", agent_name: "Lisa", occurred_at: "2026-10-01T01:00:00Z", duration_sec: 42 },
    { id: "out", lead_id: "lead", channel: "call", direction: "outbound", agent_name: "Thomas", occurred_at: "2026-10-01T02:00:00Z", duration_sec: null },
    { id: "unlinked", lead_id: null, channel: "call", direction: "inbound", agent_name: "Lisa", occurred_at: "2026-10-01T03:00:00Z" },
    { id: "sms", lead_id: "lead", channel: "sms", direction: "inbound", agent_name: "Lisa", occurred_at: "2026-10-01T04:00:00Z" },
    { id: "prior-week", lead_id: "lead", channel: "call", direction: "inbound", agent_name: "Lisa", occurred_at: "2026-09-28T01:00:00Z" },
  ];
  const rows = linkedCallActivity(calls, [{ id: "lead", lead_no: "TMP-SYNTH", claimant_name: "Synthetic", campaign: "INNO MVA" }], "2026-09-28");
  assert.deepEqual(rows.map((r) => r.id), ["out", "in"]);
  const groups = summarizeCallActivity(rows);
  assert.deepEqual(groups.map((r) => [r.agent, r.inbound, r.outbound, r.files]), [["Lisa", 1, 0, 1], ["Thomas", 0, 1, 1]]);
  assert.equal(groups[0].withDuration, 1);
  assert.equal(groups[1].withDuration, 0);
});

test("JustCall completed-call type identifies answered and missed inbound without inferring from duration", () => {
  const outcomes = justcallInboundOutcomes([
    { event_type: "justcall.call.completed", status: "received", payload: { data: { call_sid: "one", call_info: { direction: "Incoming", type: "answered" } } } },
    { event_type: "justcall.call.completed", status: "received", payload: { data: { call_sid: "two", call_info: { direction: "Incoming", type: "Missed", missed_call_reason: "Call was not picked by any agent" } } } },
    { event_type: "justcall.call.completed", status: "received", payload: { data: { call_sid: "three", call_info: { direction: "Outgoing", type: "unanswered" } } } },
  ]);
  const leads = [{ id: "lead", lead_no: "TMP-SYNTH", claimant_name: "Synthetic" }];
  const rows = linkedCallActivity([
    { id: "later", lead_id: "lead", call_sid: "one", channel: "call", direction: "inbound", occurred_at: "2026-09-30T20:00:00Z", duration_sec: 90 },
    { id: "missed", lead_id: "lead", call_sid: "two", channel: "call", direction: "inbound", occurred_at: "2026-09-30T19:00:00Z", duration_sec: 90 },
    { id: "out", lead_id: "lead", call_sid: "three", channel: "call", direction: "outbound", occurred_at: "2026-09-30T18:00:00Z", duration_sec: 0 },
  ], leads, "2026-09-28", outcomes);
  assert.equal(rows.find((r) => r.id === "missed")?.inboundOutcome, "missed");
  assert.equal(rows.find((r) => r.id === "later")?.inboundOutcome, "answered");
  assert.equal(rows.find((r) => r.id === "out")?.inboundOutcome, "unknown");
  const missed = missedInboundFollowups(rows);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].followup?.id, "later");
  assert.equal(summarizeCallActivity(rows)[0].inboundAnswered, 1);
});
