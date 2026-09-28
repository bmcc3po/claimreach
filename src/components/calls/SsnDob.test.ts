// Run: npx tsx src/components/calls/SsnDob.test.ts
import assert from "node:assert/strict";
import { fmtDobDigits, dobProblem, dobSpoken, fmtSsnDigits } from "./SsnDob";

let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log("ok", name); }

t("DOB types itself into MM/DD/YYYY", () => {
  assert.equal(fmtDobDigits("1"), "1");
  assert.equal(fmtDobDigits("10"), "10");
  assert.equal(fmtDobDigits("1026"), "10/26");
  assert.equal(fmtDobDigits("10261977"), "10/26/1977");
  assert.equal(fmtDobDigits("10/26/1977"), "10/26/1977");
  assert.equal(fmtDobDigits("10-26-1977 extra"), "10/26/1977");
});

t("DOB catches fake and future dates", () => {
  assert.equal(dobProblem("10/26/1977"), "");
  assert.equal(dobSpoken("10/26/1977"), "Oct 26, 1977");
  assert.ok(dobProblem("02/30/1990").length > 0);
  assert.ok(dobProblem("13/01/1990").length > 0);
  assert.ok(dobProblem("01/01/2090").includes("future"));
  assert.equal(dobProblem("10/26/19"), ""); // still typing: no yelling yet
});

t("SSN formats as it types", () => {
  assert.equal(fmtSsnDigits("123"), "123");
  assert.equal(fmtSsnDigits("12345"), "123-45");
  assert.equal(fmtSsnDigits("123456789"), "123-45-6789");
  assert.equal(fmtSsnDigits("123-45-6789"), "123-45-6789");
});

console.log(`\n${passed} passed`);
