import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedFirmDeliveryAt, returnWindow } from "./firm-delivery-state";

test("owner-only and failed attempts never start the firm's return clock", () => {
  const history = [
    { ok: true, to_email: "bmc@innovativeintake.com", created_at: "2026-10-01T16:00:00Z" },
    { ok: false, to_email: "firm@example.test", cc_email: "bmc@innovativeintake.com", created_at: "2026-10-01T17:00:00Z" },
  ];
  assert.equal(confirmedFirmDeliveryAt(history, "firm@example.test", "bmc@innovativeintake.com"), null);
  assert.equal(confirmedFirmDeliveryAt(history, "bmc@innovativeintake.com", "bmc@innovativeintake.com"), null);
});

test("verified delivery to the firm starts exactly seven 24-hour days", () => {
  const sent = "2026-10-01T17:00:00Z";
  const history = [
    { ok: true, to_email: "bmc@innovativeintake.com", cc_email: "firm@example.test", created_at: sent },
    { ok: true, to_email: "firm@example.test", created_at: "2026-10-02T17:00:00Z" },
  ];
  assert.equal(confirmedFirmDeliveryAt(history, "firm@example.test", "bmc@innovativeintake.com"), sent);
  assert.deepEqual(returnWindow(sent, Date.parse("2026-10-01T17:00:00Z")), {
    endsAt: "2026-10-08T17:00:00.000Z", daysLeft: 7, cleared: false,
  });
  assert.equal(returnWindow(sent, Date.parse("2026-10-08T16:59:59Z"))?.cleared, false);
  assert.equal(returnWindow(sent, Date.parse("2026-10-08T17:00:00Z"))?.cleared, true);
});
