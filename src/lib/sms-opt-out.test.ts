import assert from "node:assert/strict";
import { isSmsRevocation } from "./sms-opt-out";

for (const message of ["STOP", "stop.", "STOPALL", "UNSUBSCRIBE", "Quit", "opt out", "Don't text me", "Please stop texting me", "remove me from texts"]) {
  assert.equal(isSmsRevocation(message), true, message);
}
for (const message of ["Stop by tomorrow", "I have a stop sign", "Thanks", "Please call me"]) {
  assert.equal(isSmsRevocation(message), false, message);
}
console.log("13 inbound opt-out phrases checked");
