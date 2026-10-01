import assert from "node:assert/strict";
import { CallEngine, type CallProps } from "./engine";
import { missingRequiredMvaIntake } from "./intake-readiness";

const noop = () => {};
const api = { sendAgreement: noop, sendPax: noop, completeAgreement: noop, resendLink: noop,
  sendText: noop, saveDispo: noop, home: noop, ask: noop };
const props: CallProps = { callerName: "Synthetic", agentName: "Reviewer", firmSpoken: "Firm",
  textFrom: "", startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] },
  notifyDefaults: [], esign: { status: "completed", configured: true, pax: {} } };

assert.deepEqual(missingRequiredMvaIntake(null), ["Intake answers"]);
const engine = new CallEngine(props, api);
const initial = engine.renderVals().fi.missing.map((item: { label: string }) => item.label);
assert.ok(initial.length > 0);
assert.deepEqual(missingRequiredMvaIntake(engine.persistable()), initial);
engine.setState({ story: { ...engine.state.story, city: "Las Vegas, Nevada" } });
const updated = engine.renderVals().fi.missing.map((item: { label: string }) => item.label);
assert.deepEqual(missingRequiredMvaIntake(engine.persistable()), updated);
assert.ok(updated.length < initial.length);
console.log("3 MVA intake readiness checks passed");
