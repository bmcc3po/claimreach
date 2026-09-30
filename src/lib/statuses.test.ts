// Run: npx tsx src/lib/statuses.test.ts
// The one signed classifier (isSignedKey) that the Leads page, the Signed
// page and Reports all call. Astra 7b: a retired or unlisted signed_* key
// fell out of the Signed page while Reports still counted it.
import assert from "node:assert/strict";
import { isSignedKey, isSignedStatus, inQaPhase, isDisqualify, needsQaReview, resolveStatus, DEFAULT_STATUSES, type SignedCatalogRow } from "./statuses";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("ok", name); };

// A catalog as the pages load it: every row, retired ones too.
const catalog: SignedCatalogRow[] = [
  ...DEFAULT_STATUSES.map((s) => ({ key: s.key, phase: s.phase, requires_esign: s.requires_esign })),
  { key: "retainer_in", phase: "in_qa", requires_esign: true },      // a firm's custom signed status
  { key: "retired_signed", phase: "post_qa", requires_esign: true }, // custom, since retired (inactive row)
  { key: "chasing_docs", phase: "pre_qa", requires_esign: true },    // e-sign track, not yet signed
  { key: "esign_sent", phase: "in_qa", requires_esign: true },       // a mis-flagged row must not flip it
];

t("imported DQ with missing reason stays Closed even with the old live QA catalog", () => {
  const stale = DEFAULT_STATUSES.map(s => s.key === "external_dq_review"
    ? { ...s, label: "LawRuler DQ: reason needed", track: "intake" as const, phase: "in_qa" as const, qualify: "undetermined" as const }
    : s);
  assert.equal(resolveStatus("external_dq_review", stale).phase, "terminal");
  assert.equal(resolveStatus("external_dq_review", stale).label, "DQ: reason missing");
  assert.equal(isDisqualify("external_dq_review", stale), true);
  assert.equal(inQaPhase("external_dq_review", stale), false);
  assert.equal(needsQaReview("external_dq_review", stale), false);
});

t("DQ never enters QA, including stale custom catalog flags; a genuine sibling remains reviewable", () => {
  const stale = [{ ...DEFAULT_STATUSES.find(s => s.key === "dq")!, key: "custom_dq", phase: "in_qa" as const }];
  for (const key of ["dq", "dq_billable", "signed_dropped", "external_dq_review", "custom_dq"]) {
    assert.equal(needsQaReview(key, stale), false, key);
  }
  assert.equal(needsQaReview("signed_qa", stale), true);
  assert.equal(needsQaReview("signed_wip", stale), false);
});

t("the signed_* family and signed/delivered/retained always count, with or without a catalog", () => {
  for (const k of ["signed", "delivered", "retained", "signed_grievous", "signed_qa", "signed_wip", "signed_flag", "signed_approved", "signed_dropped"]) {
    assert.equal(isSignedKey(k), true, k);
    assert.equal(isSignedKey(k, []), true, k);
    assert.equal(isSignedKey(k, null), true, k);
    assert.equal(isSignedKey(k, catalog), true, k);
  }
});

t("a retired or unlisted signed_* key still counts (history keeps its meaning)", () => {
  assert.equal(isSignedKey("signed_legacy_hold", catalog), true);
  assert.equal(isSignedKey("signed_legacy_hold", []), true);
  assert.equal(isSignedKey("signed_legacy_hold"), true);
});

t("catalog flags widen it: a custom e-sign status past pre_qa counts, retired rows included", () => {
  assert.equal(isSignedKey("retainer_in", catalog), true);
  assert.equal(isSignedKey("retired_signed", catalog), true);
  assert.equal(isSignedKey("chasing_docs", catalog), false);
});

t("a failed catalog load only loses the custom keys, never the signed_* family", () => {
  assert.equal(isSignedKey("retainer_in", undefined), false);
  assert.equal(isSignedKey("signed_qa", undefined), true);
});

t("esign_sent is never signed, whatever the catalog says", () => {
  assert.equal(isSignedKey("esign_sent", catalog), false);
  assert.equal(isSignedKey("esign_sent"), false);
});

t("open statuses and blanks are not signed", () => {
  for (const k of ["new", "contacting", "grievous", "qa", "wip", "flag", "approved", "dq", "dead", "", null, undefined]) {
    assert.equal(isSignedKey(k as any, catalog), false, String(k));
  }
});

t("case and stray spaces do not change the answer", () => {
  assert.equal(isSignedKey(" Signed_QA ", []), true);
  assert.equal(isSignedKey("RETAINER_IN", catalog), true);
  assert.equal(isSignedStatus("Delivered"), true);
});

// Parity: the three consumers split the same statuses the same way.
t("Leads, Signed and Reports agree on one mixed set", () => {
  const claims = ["new", "signed_qa", "signed_legacy_hold", "retainer_in", "retired_signed", "esign_sent", "delivered", "dq", "chasing_docs", "retained"];
  const leadsPage = claims.filter((k) => !isSignedKey(k, catalog));
  const signedPage = claims.filter((k) => isSignedKey(k, catalog));
  // ReportsView counts by status key with the same call.
  const byStatus: Record<string, number> = {};
  for (const k of claims) byStatus[k] = (byStatus[k] ?? 0) + 1;
  const reportSigned = Object.entries(byStatus).reduce((n, [k, v]) => (isSignedKey(k, catalog) ? n + v : n), 0);
  assert.equal(leadsPage.length + signedPage.length, claims.length);
  assert.equal(reportSigned, signedPage.length);
  assert.deepEqual(signedPage, ["signed_qa", "signed_legacy_hold", "retainer_in", "retired_signed", "delivered", "retained"]);
  assert.deepEqual(leadsPage, ["new", "esign_sent", "dq", "chasing_docs"]);
});

console.log(passed, "passed");
