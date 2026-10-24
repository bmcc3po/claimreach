import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveFileStatus, DEFAULT_STATUSES } from "./statuses";
import { OWNER_SENT_UNKNOWN_DATE } from "./owner-file-confirmation";
import { isSignedClient } from "./signed-list";
import { clocksFor } from "./sla-clocks";
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import FileStatusControl from "../components/FileStatusControl";
import CaseOverview from "../components/CaseOverview";

test("confirmed delivered signing has one label without a new workflow key", () => {
  const def = resolveFileStatus({ status: "delivered" }, DEFAULT_STATUSES, true);
  assert.equal(def.label, "Sent to firm"); assert.equal(def.key, "delivered");
  assert.equal(def.phase, "post_qa");
  assert.equal(resolveFileStatus({ status: "delivered" }).label, "Sent to firm", "unsigned handoffs do not gain a signature");
  assert.equal(resolveFileStatus({ status: "signed_grievous" }, undefined, true).label, "Signed esign", "a new signature is not automatically sent");
});
test("historical owner confirmation is signed and sent even without a date", () => {
  const claim = { status: "delivered", firm_send_result: OWNER_SENT_UNKNOWN_DATE };
  assert.equal(resolveFileStatus(claim).label, "Sent to firm");
  assert.equal(isSignedClient({ id: "import", claims: [claim] }, null, new Set()), true);
  assert.equal(isSignedClient({ id: "unsigned", claims: [{ status: "delivered", firm_send_result: "sent" }] }, null, new Set()), false);
});
test("delivered files stop both our chase clocks without supplying a fake timestamp", () => {
  const input = { signed_at: "2026-09-28T12:00:00Z", firm_sent_at: null, esign_sent_at: "2026-09-27T12:00:00Z", current_status: "delivered" };
  assert.deepEqual(clocksFor(input), []); assert.equal(input.firm_sent_at, null);
  assert.equal(clocksFor({ ...input, current_status: "signed_grievous" }).length, 1);
  assert.equal(clocksFor({ ...input, signed_at: null, current_status: "esign_sent" }).length, 1);
});
test("file badge and overview use the same delivered wording", () => {
  const claim = { status: "delivered", firm_send_result: OWNER_SENT_UNKNOWN_DATE };
  const label = resolveFileStatus(claim).label;
  assert.match(renderToStaticMarkup(<AppRouterContext.Provider value={{refresh(){}} as any}><FileStatusControl leadId="test" claimId="matter" current="delivered" currentLabel={label} role="firm" /></AppRouterContext.Provider>), /Sent to firm/);
  assert.match(renderToStaticMarkup(<CaseOverview lead={{ claimant_name: "TEST" }} activeClaim={claim} onGo={() => {}} />), /Sent to firm/);
});
