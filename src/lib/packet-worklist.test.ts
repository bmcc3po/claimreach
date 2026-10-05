import assert from "node:assert/strict";
import { test } from "node:test";
import { mondayOf, packetWorklist, pacificDay, pacificCalendarDay, pacificDayStartUtc } from "./packet-worklist";
import { OWNER_SENT_UNKNOWN_DATE } from "./owner-file-confirmation";

test("owner-confirmed delivery leaves pending queue without inventing a return window", () => {
  const [row] = packetWorklist({ submissions: [{ id: "s", lead_id: "l", claim_id: "c", signed_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", status: "signed" }],
    leads: [{ id: "l", case_type: "mva" }], claims: [{ id: "c", lead_id: "l", claim_type: "mva", status: "delivered", firm_send_result: OWNER_SENT_UNKNOWN_DATE }], calls: [], users: [], firms: [], deliveries: [] });
  assert.equal(row.stage, "delivered"); assert.equal(row.readyToBill, false); assert.equal(row.deliveredAt, null); assert.equal(row.returnEndsAt, null);
  assert.equal(row.stageLabel, "Signed — sent to firm");
});

test("each passenger's own signed file remains visible without signing or delivering the driver", () => {
  const driver = "00000000-0000-4000-8000-000000000001";
  const rows = packetWorklist({
    submissions: [
      { id: "driver-unsent", lead_id: driver, claim_id: "driver-claim", pax_index: null, created_at: "2026-10-01T00:00:00Z", status: "sent" },
      ...["one", "two"].map((id, i) => ({ id, lead_id: id, claim_id: `${id}-claim`, pax_index: i, signed_at: "2026-10-02T00:00:00Z", created_at: "2026-10-02T00:00:00Z", status: "signed" })),
      { id: "legacy", lead_id: driver, claim_id: "driver-claim", pax_index: 2, signed_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", status: "signed" },
    ],
    leads: [{ id: driver, case_type: "mva", claimant_name: "TEST driver" }, ...["one", "two"].map(id => ({ id, case_type: "mva", claimant_name: `TEST passenger ${id}`, external_id: `${driver}:pax:${id}` }))],
    claims: ["one", "two"].map(id => ({ id: `${id}-claim`, lead_id: id, claim_type: "mva", status: "signed_grievous" })),
    calls: [], users: [], firms: [], deliveries: [{ lead_id: "one", claim_id: "one-claim", ok: true, created_at: "2026-10-03T00:00:00Z" }],
  });
  assert.deepEqual(rows.map(row => row.leadId).sort(), ["one", "two"]);
  assert.equal(rows.find(row => row.leadId === "one")?.stage, "delivered");
  assert.equal(rows.find(row => row.leadId === "two")?.stage, "finish");
  assert.ok(rows.every(row => row.name.startsWith("TEST passenger")));
});

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
  assert.equal(waiting[0].stageLabel, "Awaiting file review");
  assert.equal(packetWorklist({ ...base, claims: [] })[0].stage, "qa");
  assert.equal(packetWorklist({ ...base, claims: [{ id: "c", lead_id: "l", claim_type: "mva", status: "signed_approved" }] })[0].stage, "ready");
});

test("owner worklist holds a signed packet when the firm address is missing or points back to Brett", () => {
  const base = {
    submissions: [{ id: "s", lead_id: "l", claim_id: "c", pax_index: null, signed_at: "2026-09-30T22:00:00Z", created_at: "2026-09-30T22:00:00Z", status: "completed", completed_pdf_path: "signed.pdf", cert_pdf_path: "cert.pdf", agent_reviewed_at: "2026-09-30T23:00:00Z" }],
    leads: [{ id: "l", case_type: "mva" }], claims: [{ id: "c", lead_id: "l", campaign_id: "camp", claim_type: "mva", status: "signed_approved" }],
    calls: [], users: [], firms: [], deliveries: [], ownerEmail: "bmc@innovativeintake.com",
  };
  for (const firm_email of [null, "bmc@innovativeintake.com"]) {
    const [row] = packetWorklist({ ...base, campaigns: [{ id: "camp", firm_email }] });
    assert.equal(row.stage, "held");
    assert.equal(row.stageLabel, "Firm email needs configuration");
  }
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
