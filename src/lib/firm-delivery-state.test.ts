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

test("changing the campaign recipient preserves the original receipt and seven-day clock", () => {
  const sent = "2026-10-01T17:00:00Z";
  const history = [{ ok: true, to_email: "previous@firm.test", cc_email: "owner@example.test", created_at: sent, triggered_by: "manual" },
    { ok: true, to_email: "new@firm.test", created_at: "2026-10-03T17:00:00Z", triggered_by: "manual" }];
  for (const current of ["previous@firm.test", "new@firm.test", null]) {
    const confirmed = confirmedFirmDeliveryAt(history, current, "owner@example.test");
    assert.equal(confirmed, sent);
    assert.equal(returnWindow(confirmed)?.endsAt, "2026-10-08T17:00:00.000Z");
  }
  for (const triggered_by of ['auto', 'automation', 'external_owner_confirmed'])
    assert.equal(confirmedFirmDeliveryAt([{ ...history[0], triggered_by }], 'new@firm.test', 'owner@example.test'), sent);
});

test("recipient changes do not promote failed, owner-only, unproven or malformed history", () => {
  const receipt = { ok: true, to_email: "previous@firm.test", created_at: "2026-10-01T17:00:00Z", triggered_by: "manual" };
  for (const change of [{ ok: false }, { to_email: 'owner@example.test', cc_email: 'previous@firm.test' },
    { triggered_by: null }, { triggered_by: 'unknown' }, { to_email: 'invalid' }, { created_at: 'invalid' }])
    assert.equal(confirmedFirmDeliveryAt([{ ...receipt, ...change }], 'new@firm.test', 'owner@example.test'), null);
  assert.equal(confirmedFirmDeliveryAt([receipt], 'new@firm.test', null), null, 'do not guess the owner recipient');
});
