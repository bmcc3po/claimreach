import assert from "node:assert/strict";
import { passwordProblem } from "./password-rules";

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log("PASS", name); }

test("short personal passwords remain rejected", () => {
  assert.match(passwordProblem("short", "worker@example.invalid") || "", /10 characters/);
});
test("name-number starters remain rejected when the name has punctuation or spaces", () => {
  for (const value of ["synthetic123", "ty-seria123", "mary jane123", "o'connell123", "SYNTHETIC1234"]) {
    assert.match(passwordProblem(value, "worker@example.invalid") || "", /starter password/);
  }
});
test("a long password containing the login name is rejected regardless of case", () => {
  assert.match(passwordProblem("Bright.Worker!Bicycle", "worker@example.invalid") || "", /email/);
});
test("an unrelated long personal passphrase is accepted", () => {
  assert.equal(passwordProblem("Cedar!Cloud-River-47", "worker@example.invalid"), null);
  assert.equal(passwordProblem("Cedar!Cloud-River-47", null), null);
});
console.log(`${passed} password rule checks passed`);
