import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LeadsView from "./LeadsView";
import { DEFAULT_STATUSES } from "@/lib/statuses";
(globalThis as any).React = React;

// Render against the actual stale catalog returned by production before its
// correction. Closed imports must not appear under the In QA tab or count.
const stale = DEFAULT_STATUSES.map(s => s.key === "external_dq_review"
  ? { ...s, label: "LawRuler DQ: reason needed", track: "intake" as const, phase: "in_qa" as const, qualify: "undetermined" as const }
  : s);
const html = renderToStaticMarkup(createElement(LeadsView, {
  statuses: stale,
  leads: [{ id: "synthetic-dq", lead_no: "TEST-DQ", claimant_name: "Synthetic DQ", case_type: "mva", created_at: "2026-09-29T10:00:00Z", updated_at: "2026-09-29T10:00:00Z", claims: [{ status: "external_dq_review" }] }],
}));
assert.match(html, /DQ: reason missing/);
assert.match(html, />Closed<span>1<\/span>/);
assert.doesNotMatch(html, /role="tab"[^>]*>In QA/);
console.log("ok actual Leads view lists imported DQ as Closed with no In QA tab");
