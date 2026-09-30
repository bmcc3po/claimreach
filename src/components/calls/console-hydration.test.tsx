import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import CallView from "./CallView";
import { CallEngine } from "../../lib/mva-call/engine";

// Prove the reported UTC/Pacific mismatch with the real engine and call view,
// then exercise the actual CallConsole boundary before/after its mount effect.
(globalThis as any).React = React;
const originalDate = Date, originalTZ = process.env.TZ, originalFetch = globalThis.fetch;
let clock = originalDate.parse("2026-09-30T06:33:13.000Z"), networkCalls = 0;
const browserClock = new Proxy(originalDate, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : [clock]); },
  get(target, prop) { return prop === "now" ? () => clock : Reflect.get(target, prop); },
});
globalThis.Date = browserClock;
globalThis.fetch = async () => { networkCalls++; throw Error("Network is forbidden in this test"); };
const initialClock = clock;
const props: any = { callerName: "Synthetic Caller", callerPhone: "2025550100", agentName: "Synthetic Agent", firmSpoken: "Synthetic Firm",
  startedAt: clock - 95_000, reasons: {}, notifyDefaults: [], esign: { status: "ready", configured: false },
  saved: { story: { city: "Las Vegas, NV", when: "Pick a date", date: "2026-09-24" } } };
function renderLocal(tz: string) {
  process.env.TZ = tz;
  const engine = new CallEngine(props, {} as any);
  engine.setView("chore");
  const values = engine.renderVals();
  const when = values.fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === "when");
  return { html: renderToStaticMarkup(<CallView v={values} />), label: when.c.opts[2].label, clock: values.clockText };
}

const file = path.join(__dirname, "CallConsole.tsx");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wrapper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "CallConsole");
assert.ok(wrapper);
const compiled = ts.transpileModule(wrapper.getText(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
let matterMounts = 0;
// Calling this tripwire would initialize the engine/network/save effects in
// production. It must never be reached by server or first-client rendering.
function MatterTripwire() { matterMounts++; throw Error("Matter mounted before hydration"); }
function boundary(hooks: Pick<typeof React, "useState" | "useEffect">): any {
  const exp: any = {};
  new Function("require", "exports", "useState", "useEffect", "MatterCallConsole", compiled)(
    (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; }, exp, hooks.useState, hooks.useEffect, MatterTripwire);
  return exp.default;
}
try {
  const serverLocal = renderLocal("UTC"), clientLocal = renderLocal("America/Los_Angeles");
  assert.equal(serverLocal.label, "Mon 28"); assert.equal(clientLocal.label, "Sun 27");
  assert.notEqual(serverLocal.html, clientLocal.html, "real date labels differed before a mount boundary");
  clock += 1300;
  assert.notEqual(renderLocal("UTC").clock, serverLocal.clock, "the first-render second clock can differ even within one timezone");
  console.log("ok reproduced real CallView hydration text mismatch: UTC Mon 28 versus Pacific Sun 27, plus clock drift");

  const init: any = { leadId: "lead-A", claimId: "claim-A", startedAt: props.startedAt, props };
  const ServerBoundary = boundary(React);
  process.env.TZ = "UTC"; clock = initialClock;
  const serverHTML = renderToStaticMarkup(<ServerBoundary init={init} />);
  assert.match(serverHTML, /role="status"/); assert.match(serverHTML, /aria-busy="true"/); assert.match(serverHTML, /Loading intake/);
  assert.equal(matterMounts, 0); assert.equal(networkCalls, 0);

  let ready = false, effect: (() => void) | undefined;
  const ClientBoundary = boundary({ useState: (() => [ready, (value: boolean) => { ready = value; }]) as any,
    useEffect: ((mount: () => void) => { effect = mount; }) as any });
  process.env.TZ = "America/Los_Angeles"; clock += 1700;
  const firstClientHTML = renderToStaticMarkup(ClientBoundary({ init }));
  assert.equal(firstClientHTML, serverHTML, "server and first browser text/markup must match across timezones and delay");
  assert.equal(matterMounts, 0); assert.equal(networkCalls, 0, "no autosave, identity or signing request before hydration");
  assert.ok(effect); effect();
  const mounted = ClientBoundary({ init });
  assert.equal(mounted.type, MatterTripwire); assert.equal(mounted.key, "lead-A:claim-A"); assert.equal(mounted.props.init, init);
  const otherMatter = ClientBoundary({ init: { ...init, claimId: "claim-B" } });
  assert.equal(otherMatter.key, "lead-A:claim-B", "changing claims remounts isolated intake/save state");
  const otherLead = ClientBoundary({ init: { ...init, leadId: "lead-B" } });
  assert.equal(otherLead.key, "lead-B:claim-A", "changing leads also remounts isolated state");
  console.log("ok actual CallConsole boundary matches first renders, defers engine/effects, and preserves exact matter keys");
} finally {
  globalThis.Date = originalDate; globalThis.fetch = originalFetch;
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
}
