// Run: npx tsx src/components/calls/SsnDob.test.ts
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fmtDobDigits, dobProblem, dobSpoken, fmtSsnDigits, SsnField } from "./SsnDob";

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

t("full SSN draft and securely saved full mode cannot be downgraded to last four", () => {
  const draft = renderToStaticMarkup(createElement(SsnField, { value: "123456789", onChange: () => {}, storedMode: "full" }));
  assert.match(draft, /Last 4 only<\/button>/);
  assert.match(draft, /disabled=""[^>]*>Last 4 only/);
  const partial = renderToStaticMarkup(createElement(SsnField, { value: "12345", onChange: () => {}, storedMode: "full" }));
  assert.match(partial, /disabled=""[^>]*>Last 4 only/);
  const stored = renderToStaticMarkup(createElement(SsnField, { value: "", onChange: () => {}, storedMode: "last4", savedMode: "full" }));
  assert.match(stored, /disabled=""[^>]*>Last 4 only/);
  assert.match(stored, /aria-label="Social Security number"/);
});

console.log(`\n${passed} passed`);
