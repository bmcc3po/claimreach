import assert from "node:assert/strict";
import { activeCallPresence } from "./call-presence";

const now = Date.parse("2026-10-01T23:00:00Z");
const current = { by: "agent-1", by_name: "Brett", expires_at: "2026-10-01T23:01:30Z" };
assert.deepEqual(activeCallPresence(current, now), current);
assert.equal(activeCallPresence(current, now + 90_000), null);
assert.equal(activeCallPresence({ ...current, expires_at: "invalid" }, now), null);
assert.equal(activeCallPresence({ ...current, by_name: "" }, now), null);
assert.equal(activeCallPresence(null, now), null);
console.log("Call presence lease validation passed");
