import assert from "node:assert/strict";
import { test } from "node:test";
import { linkedCallActivity, summarizeCallActivity } from "./call-activity";

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
