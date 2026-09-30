import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CallEngine } from "../../lib/mva-call/engine";
import { caseReport } from "../../lib/mva-call/report";
import CaseSummary from "./CaseSummary";

(globalThis as any).React = React;
const make = () => new CallEngine({ callerName: "Synthetic Caller", callerPhone: "2025550100", agentName: "Agent", firmSpoken: "Firm", textFrom: "2025550101", startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: true, status: "ready", pax: {} } } as any, {} as any);
const render = (engine: CallEngine, saveBad = false) => renderToStaticMarkup(<CaseSummary answerSnapshot={JSON.stringify(engine.persistable())} claimantName={engine.props.callerName || ""} saveBad={saveBad} />);

const empty = make();
assert.match(render(empty), /No intake answers captured yet/);
assert.doesNotMatch(render(empty), /No agreement sent|Signed the|Full summary/);
console.log("ok empty intake has a genuine empty state without invented signing facts");

const e = make();
e.setState({ story: { ...e.state.story, city: "Las Vegas, NV", seat: "Driver", fault: "Other driver" }, body: { ...e.state.body, pain: ["Neck"], done: { pain: true } }, file: { ...e.state.file, dob: "01/01/1990", ssn: "123456789" } });
const before = render(e);
assert.match(before, /Synthetic was the driver in a crash in Las Vegas, NV/);
assert.match(before, /Full summary/);
assert.match(before, /aria-expanded="false"/);
assert.doesNotMatch(before, /123456789|123-45-6789|01\/01\/1990|No agreement sent/);
assert.equal("ssn" in e.persistable().file, false);
console.log("ok live preview is compact and excludes identity and signing details");

e.setState({ story: { ...e.state.story, city: "Reno, NV" } });
e.props.callerName = "Corrected Caller";
e.setView("steps");
assert.match(render(e), /Corrected was the driver in a crash in Reno, NV/);
assert.doesNotMatch(render(e), /Las Vegas|Synthetic was/);
assert.match(render(e, true), /Changes not saved yet/);
e.setView("form");
assert.match(render(e), /Reno, NV/);
console.log("ok answer/name corrections and view switches update the same summary immediately");

const notes = make();
notes.setState({ story: { ...notes.state.story, text: "Client said <rear-ended> & stopped." } });
assert.match(render(notes), /Intake notes/);
assert.match(render(notes), /Client said &lt;rear-ended&gt; &amp; stopped\./);
assert.doesNotMatch(render(notes), /No intake answers captured/);
console.log("ok notes remain verbatim and safely escaped");

e.setState({ car: { ...e.state.car, justMe: true }, file: { ...e.state.file, vYear: "2020", vMake: "Synthetic", vModel: "Car" } });
const summary = caseReport({ claimant_name: e.props.callerName }, e.persistable(), undefined, { includeAgreement: false }).summary.join(" ");
assert.match(summary, /hurting in the neck/);
assert.match(summary, /No passengers/);
assert.match(summary, /Vehicle: 2020 Synthetic Car/);
assert.doesNotMatch(summary, /agreement|SSN|123456789/);
assert.equal(caseReport({}, {}).agreement.line, "No agreement sent yet.");
assert.ok(caseReport({}, {}).summary.join(" ").includes("No agreement sent yet."));
console.log("ok narrative-only option retains intake details and preserves existing export defaults");
console.log("5 live case-summary checks passed");
