import assert from "node:assert/strict";
import { test } from "node:test";
import { mondayOf, packetWorklist, pacificDay, pacificCalendarDay, pacificDayStartUtc } from "./packet-worklist";

test("archived signed packet stays visible until firm delivery is verified", () => {
  const rows = packetWorklist({
    submissions: [{ id: "s1", lead_id: "l1", claim_id: "c1", call_id: "i1", pax_index: null, signed_at: "2026-09-30T22:00:00Z", created_at: "2026-09-30T22:00:00Z", status: "completed", completed_pdf_path: "signed.pdf", cert_pdf_path: "cert.pdf", agent_reviewed_at: "2026-09-30T23:00:00Z" }],
    leads: [{ id: "l1", lead_no: "TMP-TEST", claimant_name: "Synthetic", archived_at: "2026-10-01T00:00:00Z", case_type: "mva", firm_id: "f1" }],
    claims: [{ id: "c1", lead_id: "l1", claim_type: "mva", campaign: "INNO MVA", firm_id: "f1", status: "signed_approved" }],
    calls: [{ id: "i1", agent_name: "Test Agent" }], users: [], firms: [{ id: "f1", name: "Test Firm" }], deliveries: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, "ready");
  assert.equal(rows[0].archived, true);
  assert.equal(rows[0].agent, "Test Agent");
});

test("a completed packet is not ready to send until the claim passes QA", () => {
  const base = {
    submissions: [{ id: "s", lead_id: "l", claim_id: "c", pax_index: null, signed_at: "2026-09-30T22:00:00Z", created_at: "2026-09-30T22:00:00Z", status: "completed", completed_pdf_path: "signed.pdf", cert_pdf_path: "cert.pdf", agent_reviewed_at: "2026-09-30T23:00:00Z" }],
    leads: [{ id: "l", case_type: "mva" }], calls: [], users: [], firms: [], deliveries: [],
  };
  const waiting = packetWorklist({ ...base, claims: [{ id: "c", lead_id: "l", claim_type: "mva", status: "signed_grievous" }] });
  assert.equal(waiting[0].stage, "qa");
  assert.equal(waiting[0].stageLabel, "Awaiting QA approval");
  assert.equal(packetWorklist({ ...base, claims: [] })[0].stage, "qa");
  assert.equal(packetWorklist({ ...base, claims: [{ id: "c", lead_id: "l", claim_type: "mva", status: "signed_approved" }] })[0].stage, "ready");
});

test("a successful firm delivery applies only to the corresponding claim", () => {
  const input = {
    submissions: ["a", "b"].map((id) => ({ id, lead_id: "l", claim_id: id, pax_index: null, signed_at: "2026-09-30T22:00:00Z", created_at: "2026-09-30T22:00:00Z", status: "signed" })),
    leads: [{ id: "l", lead_no: "TMP-TEST", case_type: "mva" }],
    claims: ["a", "b"].map((id) => ({ id, lead_id: "l", claim_type: "mva" })),
    calls: [], users: [], firms: [],
    deliveries: [{ id: "d", lead_id: "l", claim_id: "a", ok: true, created_at: "2026-10-01T00:00:00Z" }],
  };
  const rows = packetWorklist(input);
  assert.equal(rows.find((r) => r.claimId === "a")?.stage, "delivered");
  assert.equal(rows.find((r) => r.claimId === "b")?.stage, "finish");
});

test("a newer void or correction cannot make an older signature ready to send", () => {
  const rows = packetWorklist({
    submissions: [
      { id: "void", lead_id: "l", claim_id: "c", pax_index: null, created_at: "2026-10-01T00:00:00Z", status: "voided", voided_at: "2026-10-01T00:00:00Z" },
      { id: "old", lead_id: "l", claim_id: "c", pax_index: null, created_at: "2026-09-30T00:00:00Z", signed_at: "2026-09-30T00:00:00Z", status: "completed", completed_pdf_path: "signed.pdf", cert_pdf_path: "cert.pdf", agent_reviewed_at: "2026-09-30T01:00:00Z" },
    ],
    leads: [{ id: "l", lead_no: "TMP-TEST", case_type: "mva" }], claims: [{ id: "c", lead_id: "l", claim_type: "mva" }],
    calls: [], users: [], firms: [], deliveries: [],
  });
  assert.equal(rows[0].stage, "held");
});

test("weekly grouping uses Los Angeles dates", () => {
  assert.equal(pacificDay("2026-10-01T06:30:00Z"), "2026-09-30");
  assert.equal(pacificCalendarDay("2026-10-01T06:30:00Z"), "2026-09-30");
  assert.equal(pacificCalendarDay("2026-09-30"), "2026-09-30");
  assert.equal(pacificDayStartUtc("2026-09-30"), "2026-09-30T07:00:00.000Z");
  assert.equal(pacificDayStartUtc("2026-12-01"), "2026-12-01T08:00:00.000Z");
  assert.equal(mondayOf("2026-09-30"), "2026-09-28");
});
