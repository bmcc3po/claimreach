// Offline checks of the shared contract resolver, real engine/renderers and
// actual preview/send callbacks. No provider, database or network is called.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agreementChoice } from "../../lib/mva-call/agreement-choice";
import { stateCodeOf } from "../../lib/mva-call/state";
import { CallEngine, doiOf, type CallProps } from "../../lib/mva-call/engine";
import CallView from "./CallView";
import AgreementChoice from "./AgreementChoice";
import { createRuntime, one, text, walk } from "../contact-saves.harness";

(globalThis as any).React = React;
const keys = ["TX", "FL", "OTHER", "NV", "NV_FLAT"];
const noop = () => {};
let sends = 0;
const api = { sendAgreement: () => { sends++; }, sendPax: noop, completeAgreement: noop, resendLink: noop, sendText: noop, saveDispo: noop, home: noop, ask: noop, voidAgreement: noop };
function make(allowed = keys, status = "ready", templateKey: string | null = null) {
  const props: CallProps = { callerName: "Synthetic Caller", callerPhone: "2025550100", callerEmail: "test@example.invalid", agentName: "Test", firmSpoken: "Synthetic Firm", textFrom: "2025550101", startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: true, status, templateKeys: allowed, templateKey, pax: {} } };
  const e = new CallEngine(props, api);
  e.setState({ phase: "send", story: { ...e.state.story, city: "Las Vegas, NV", when: "Pick a date", date: "2026-09-20" } });
  return e;
}
let count = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, body: () => void | Promise<void>) => tests.push([name, body]);

test("one resolver keeps contracts within the accident-state family", () => {
  for (const [city, variant, key] of [["Dallas, TX", "tiered", "TX"], ["Miami, FL", undefined, "FL"], ["Los Angeles, CA", undefined, "OTHER"], ["Las Vegas, NV", undefined, "NV"], ["Las Vegas, NV", "flat", "NV_FLAT"]]) {
    const choice = agreementChoice(city, variant, keys);
    assert.equal(choice.key, key); assert.equal(choice.available, true);
    assert.deepEqual(choice.options.map(o => o.key), key?.startsWith("NV") ? ["NV", "NV_FLAT"] : [key]);
  }
  assert.match(agreementChoice("Dallas, TX", "flat", keys).error, /only available for a Nevada wreck/);
  assert.equal(agreementChoice("Las Vegas, NV", "invented", keys).available, false);
});
test("an unconfigured variant is visibly disabled and engine callbacks cannot select it", () => {
  const e = make(["NV"]), v = e.renderVals();
  const html = renderToStaticMarkup(<AgreementChoice v={v} />);
  assert.match(html, /value="NV_FLAT" disabled=""/);
  v.contractChoice.select("NV_FLAT"); assert.equal(e.state.send.nvVariant, "tiered");
  v.nv.pickFlat(); assert.equal(e.state.send.nvVariant, "tiered");
  v.contractChoice.select("TX"); assert.equal(e.state.send.nvVariant, "tiered");
});
test("a removed or unavailable selected contract blocks sending without silently changing it", () => {
  const e = make(); e.renderVals().contractChoice.select("NV_FLAT");
  e.props.esign.templateKeys = ["NV"];
  const before = sends, v = e.renderVals(); v.sendNext.go();
  assert.equal(sends, before); assert.equal(v.contractChoice.key, "NV_FLAT");
  assert.match(v.contractChoice.error, /not set up for this campaign/);
  v.contractChoice.select("NV"); assert.equal(e.renderVals().contractChoice.available, true);
  e.props.esign.templateKeys = []; e.renderVals().sendNext.go(); assert.equal(sends, before);
});
test("non-tiered approval is required and saved with the same engine draft", () => {
  const e = make(); e.renderVals().contractChoice.select("NV_FLAT");
  const before = sends; e.renderVals().sendNext.go(); assert.equal(sends, before);
  e.renderVals().contractChoice.reason.set({ target: { value: "Synthetic owner approved" } });
  e.renderVals().sendNext.go(); assert.equal(sends, before + 1);
  const restored = new CallEngine({ ...e.props, saved: e.persistable() }, api);
  assert.equal(restored.renderVals().contractChoice.key, "NV_FLAT");
  assert.equal(restored.renderVals().contractChoice.reason.value, "Synthetic owner approved");
});
test("correcting Nevada to Texas never wedges the draft or hides a flat Nevada selection on return", () => {
  const e = make(); e.renderVals().contractChoice.select("NV_FLAT");
  e.renderVals().contractChoice.reason.set({ target: { value: "Synthetic owner approved" } });
  e.set("story", "city", "Dallas, TX");
  assert.equal(e.renderVals().contractChoice.key, "TX"); assert.equal(e.renderVals().contractChoice.error, "");
  assert.equal(e.renderVals().contractChoice.requiresReason, false);
  e.set("story", "city", "Las Vegas, NV");
  assert.equal(e.renderVals().contractChoice.key, "NV_FLAT"); assert.equal(e.renderVals().contractChoice.requiresReason, true);
  assert.equal(e.renderVals().contractChoice.reason.value, "Synthetic owner approved");
});
test("all four renderers expose the same selected contract and approval control", () => {
  const e = make(); e.renderVals().contractChoice.select("NV_FLAT");
  for (const mode of ["guided", "full", "chore", "form"]) {
    e.setView(mode); e.go("send"); const html = renderToStaticMarkup(<CallView v={e.renderVals()} />);
    assert.match(html, /aria-label="Agreement contract"/);
    assert.match(html, /value="NV_FLAT" selected=""/);
    assert.match(html, /aria-label="Non-tiered approval reason"/);
  }
});
test("sent and signed views show the actual stored contract despite changed draft state", () => {
  for (const status of ["sent", "opened", "signed"]) {
    const e = make(keys, status, "NV_FLAT"); e.set("story", "city", "Dallas, TX");
    for (const mode of ["guided", "full", "chore", "form"]) {
      e.setView(mode); e.go("send"); const html = renderToStaticMarkup(<CallView v={e.renderVals()} />);
      assert.ok(html.includes("Contract already sent") && html.includes("Nevada non-tiered"));
      assert.ok(!html.includes('aria-label="Agreement contract"'));
    }
    e.renderVals().contractChoice.select("TX"); assert.equal(e.state.send.nvVariant, "tiered");
    assert.equal(e.props.esign.templateKey, "NV_FLAT");
  }
  assert.equal(make(keys, "sent", "OLD_TEMPLATE_42").renderVals().currentAgreement.label, "OLD_TEMPLATE_42");
  assert.match(make(keys, "sent").renderVals().currentAgreement.label, /type unavailable/);
  assert.match(make(keys, "sent").renderVals().agreement, /type unavailable/);
});

const filename = path.resolve(__dirname, "CallConsole.tsx");
const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function compile(code: string, names: string[], values: any[]) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exp: any = {}; new Function("exports", ...names, js)(exp, ...values); return exp;
}
const previewNode = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "previewInfo")!;
const preview = compile(`exports.preview = ${previewNode.getText()};`, ["agreementChoice", "stateCodeOf", "todayMDY", "doiOf", "prettyPhone"], [agreementChoice, stateCodeOf, () => "09/28/2026", doiOf, (n: string) => n]).preview;
test("actual preview builder follows selection, blocks missing templates, and drops stale Nevada request fields in Texas", () => {
  const e = make(), init = { leadId: "synthetic", claimId: "matter" };
  const tiered = preview(e.state, init, keys);
  e.renderVals().contractChoice.select("NV_FLAT"); const flat = preview(e.state, init, keys);
  assert.notEqual(flat.href, tiered.href); assert.match(flat.href, /nv_variant=flat/);
  assert.equal(preview(e.state, init, ["NV"]).href, null);
  e.set("story", "city", "Dallas, TX"); const texas = preview(e.state, init, keys);
  assert.ok(texas.href && !texas.href.includes("nv_variant")); assert.equal(texas.checks[0].value, "Texas");
});
test("actual Agreement panel replaces the iframe immediately and never labels a draft as sent", () => {
  const rt = createRuntime(), Retainer = rt.load("src/components/calls/DeskPanel.tsx", ["Retainer"]).__Retainer;
  const e = make(); let reviewed = 0;
  const props = { v: { ...e.renderVals(), reviewAgreement: () => { reviewed++; } }, preview: { href: "/tiered-preview", checks: [] } };
  const view = rt.mount(Retainer, props);
  const first = one(view.tree, n => n.type === "iframe", "draft preview");
  view.rerender({ ...props, preview: { href: "/flat-preview", checks: [] } });
  const changed = one(view.tree, n => n.type === "iframe", "changed preview");
  assert.equal(changed.props.src, "/flat-preview"); assert.notEqual(changed.key, first.key);
  view.act(() => one(view.tree, n => n.type === "button" && text(n) === "Review and send", "review action").props.onClick()); assert.equal(reviewed, 1);
  view.rerender({ ...props, preview: { href: null, checks: [] } }); assert.equal(walk(view.tree, n => n.type === "iframe").length, 0);
  const sent = make(keys, "sent", "NV_FLAT");
  view.rerender({ ...props, v: sent.renderVals(), preview: { href: "/unrelated-draft", checks: [] } });
  assert.equal(walk(view.tree, n => n.type === "iframe").length, 0); assert.match(text(view.tree), /Nevada non-tiered/);
  assert.match(text(view.tree), /void it first/); assert.equal(rt.posts().length, 0);
});
let sendNode: ts.MethodDeclaration | undefined, reviewNode: ts.Expression | undefined;
const visit = (n: ts.Node) => {
  if (ts.isMethodDeclaration(n) && n.name.getText() === "sendAgreement") sendNode = n;
  if (ts.isBinaryExpression(n) && n.left.getText() === "view.reviewAgreement") reviewNode = n.right;
  ts.forEachChild(n, visit);
}; visit(source); assert.ok(sendNode && reviewNode);
test("actual Send posts the resolved choice and binds returned contract identity independently of the draft", async () => {
  const e = make(); e.renderVals().contractChoice.select("NV_FLAT"); e.renderVals().contractChoice.reason.set({ target: { value: "Synthetic approval" } });
  e.set("story", "city", "Dallas, TX");
  let body: any; const agreementId = { current: null };
  const send = compile(`exports.send = () => ${sendNode!.body!.getText()};`, ["e", "post", "leadId", "init", "callId", "emergencyResign", "agreementId", "setNeedsResign", "todayMDY", "doiOf"], [() => e, async (_: string, b: any) => { body = b; return { agreement_id: "new", template_key: "TX", status: "sent" }; }, "synthetic", { claimId: "matter" }, { current: "call" }, { current: false }, agreementId, noop, () => "09/28/2026", doiOf]).send;
  send(); await Promise.resolve(); await Promise.resolve();
  assert.equal(body.nv_variant, "tiered"); assert.equal(body.nv_reason, undefined); assert.equal(body.claim_id, "matter");
  assert.equal(e.props.esign.templateKey, "TX"); assert.equal(agreementId.current, "new");
});
test("Review and send closes the phone panel and moves to the same engine signing controls", () => {
  for (const mode of ["guided", "full", "chore", "form"]) {
    const e = make(); e.setView(mode); e.go("body"); let open = true;
    const review = compile(`exports.review = ${reviewNode!.getText()};`, ["setUtilityOpen", "engine"], [(value: boolean) => { open = value; }, e]).review;
    review(); assert.equal(open, false);
    assert.ok(mode === "guided" ? e.state.phase === "send" : e.state.fi.sec === "retainer");
  }
});
(async () => { for (const [name, body] of tests) { await body(); count++; console.log("ok", name); } console.log(`${count} contract choice scenarios passed`); })().catch(e => { console.error(e); process.exitCode = 1; });
