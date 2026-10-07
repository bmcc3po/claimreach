import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FileStatusControl from "./FileStatusControl";
import { DEFAULT_STATUSES, manualIntakeStatusAllowed } from "@/lib/statuses";

(globalThis as any).React = React;

const edit = renderToStaticMarkup(<FileStatusControl leadId="test-lead" claimId="test-claim" current="contacting" role="agent" />);
assert.match(edit, /Current status/);
assert.match(edit, /Contacting/);
assert.match(edit, /Change status/);

const readOnly = renderToStaticMarkup(<FileStatusControl leadId="test-lead" claimId="test-claim" current="signed_qa" role="firm" />);
assert.match(readOnly, /Current status/);
assert.doesNotMatch(readOnly, /Change status/);

const declinedAgent = renderToStaticMarkup(<FileStatusControl leadId="test-lead" claimId="test-claim" current="signed_dropped" role="agent" signedDeclineAvailable />);
assert.match(declinedAgent, /Signed and declined/);
assert.match(declinedAgent, /sb bad/);
assert.doesNotMatch(declinedAgent, /Change status/);

const selectable = DEFAULT_STATUSES.filter(manualIntakeStatusAllowed).map((status) => status.key);
for (const expected of ["new", "contacting", "dq", "not_interested", "dnc"]) assert.ok(selectable.includes(expected), `${expected} must remain manually selectable`);
for (const workflowOnly of ["esign_sent", "signed_grievous", "signed_qa", "signed_wip", "signed_approved", "delivered", "retained", "external_signed_review"]) {
  assert.ok(!selectable.includes(workflowOnly), `${workflowOnly} must require its evidence-backed workflow`);
}

console.log("File status control: visible action, read-only role, and manual workflow boundary passed");
