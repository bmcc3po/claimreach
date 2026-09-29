import assert from "node:assert/strict";
import { canDirectVoid, signingReleaseGate } from "./replacement";

const original = { id: "original", status: "signed", created_at: "2026-09-29T10:00:00Z", agent_reviewed_at: "2026-09-29T10:05:00Z" };
const correction = { id: "correction", status: "sent", created_at: "2026-09-29T10:10:00Z", replacement_of: "original" };

assert.equal(canDirectVoid("agent"), false);
assert.equal(canDirectVoid("manager"), false);
assert.equal(canDirectVoid("qa"), false);
assert.equal(canDirectVoid("owner"), true);
assert.equal(canDirectVoid("admin"), true);
console.log("ok direct void is owner/admin only");

assert.match(signingReleaseGate([{ ...original, replacement_requested_at: "2026-09-29T10:08:00Z" }, correction]) || "", /supervisor review/);
console.log("ok signed original under correction holds QA and firm delivery");

assert.match(signingReleaseGate([{ ...original, status: "voided", voided_at: "2026-09-29T10:15:00Z" }, correction]) || "", /corrected agreement.*awaiting/);
assert.match(signingReleaseGate([{ ...original, status: "voided", voided_at: "2026-09-29T10:15:00Z" }, { ...correction, status: "signed", agent_reviewed_at: null }]) || "", /awaiting signatures/);
assert.match(signingReleaseGate([{ ...original, agent_reviewed_at: null }]) || "", /agent must review/);
assert.equal(signingReleaseGate([{ ...original, status: "voided", voided_at: "2026-09-29T10:15:00Z" }, { ...correction, status: "completed", agent_reviewed_at: "2026-09-29T10:20:00Z" }]), null);
console.log("ok newest corrected packet requires its own completion and review");

assert.match(signingReleaseGate([{ ...original, status: "completed" }, { ...correction, status: "voided", voided_at: "2026-09-29T10:30:00Z" }]) || "", /corrected agreement was voided/);
console.log("ok voiding a correction never revives an earlier signed packet");
