// Actual status refresh used on mount and by the signing poll. No timers,
// network or provider: deferred responses exercise late signature races.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const file = path.resolve(__dirname, "CallConsole.tsx");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let refresh: ts.FunctionDeclaration | undefined;
const visit = (node: ts.Node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "refreshSigningStatus") refresh = node;
  ts.forEachChild(node, visit);
};
visit(source); assert.ok(refresh, "The signing refresh exists");
const code = ts.transpileModule(`exports.make = (fetch, engine, agreementId, emergencyResign, init, callId, setNeedsResign, setEmergencyStatus) => {
  const manualSignatureCheck = { current: false }, manual = false;
  const sendStatusGeneration = { current: 0 }, sendInFlight = { current: false }, eng = { current: engine };
  const isHold = value => !!value && value.needs_reconciliation === true;
  const updateSendGate = (gate, hold = null, pax = {}) => { engine.props.esign.sendGate = gate; engine.props.esign.sendAttempt = hold; engine.props.esign.paxSendAttempts = pax; };
  return async () => ${refresh!.body!.getText()};
};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exp: any = {}; new Function("exports", code)(exp);
function harness() {
  const engine = { props: { esign: { templateKey: "NV", templateKeys: ["NV", "NV_FLAT"] } }, state: { send: { status: "sent" }, file: { agreement: "open", pax: { "0": "sent" } } } as any,
    setState(patch: any) { this.state = { ...this.state, ...patch }; } };
  const agreementId = { current: "original" }, emergencyResign = { current: false };
  const responses: ((value: any) => void)[] = [];
  const fetch = () => new Promise((resolve) => responses.push(resolve));
  const emergency = { needsResign: false, status: "" };
  const poll = exp.make(fetch, engine, agreementId, emergencyResign, { leadId: "lead", claimId: "matter" }, { current: "call" }, (value: boolean) => { emergency.needsResign = value; }, (value: string) => { emergency.status = value; });
  const reply = (body: any) => responses.shift()!({ ok: true, json: async () => ({ send_attempt: null, pax_send_attempts: {}, ...body }) });
  return { engine, agreementId, emergencyResign, emergency, poll, reply };
}
let count = 0;
const check = async (name: string, fn: () => Promise<void>) => { await fn(); count++; console.log("ok", name); };
(async () => {
  await check("ordinary current primary and passenger completion still update", async () => {
    const h = harness(), pending = h.poll(); h.reply({ agreement_id: "original", status: "signed", complete: true, pax: { "0": "signed" } }); await pending;
    assert.equal(h.engine.state.send.status, "signed"); assert.equal(h.engine.state.file.agreement, "done"); assert.equal(h.engine.state.file.pax["0"], "signed");
  });
  await check("current poll uses recorded contract identity and exact configured keys", async () => {
    const h = harness(), pending = h.poll();
    h.reply({ agreement_id: "original", status: "sent", agreement: { template_key: "NV_FLAT" }, templates: [{ key: "NV_FLAT" }] }); await pending;
    assert.equal(h.engine.props.esign.templateKey, "NV_FLAT"); assert.deepEqual(h.engine.props.esign.templateKeys, ["NV_FLAT"]);
  });
  await check("a legacy envelope without a stored key clears the current label instead of guessing", async () => {
    const h = harness(), pending = h.poll(); h.reply({ agreement_id: "original", status: "sent", agreement: { template_key: null } }); await pending;
    assert.equal(h.engine.props.esign.templateKey, null);
  });
  await check("old poll metadata cannot replace a new agreement's recorded contract", async () => {
    const h = harness(), pending = h.poll(); h.agreementId.current = "replacement"; h.engine.props.esign.templateKey = "TX";
    h.reply({ agreement_id: "original", status: "signed", agreement: { template_key: "NV_FLAT" } }); await pending;
    assert.equal(h.engine.props.esign.templateKey, "TX");
  });
  await check("passenger poll cannot relock a prepared emergency re-sign draft", async () => {
    const h = harness(); h.emergencyResign.current = true; h.engine.state.send.status = "ready";
    const pending = h.poll(); h.reply({ agreement_id: "original", status: "signed", complete: true, pax: { "0": "signed" } }); await pending;
    assert.equal(h.engine.state.send.status, "ready"); assert.equal(h.engine.state.file.agreement, "open"); assert.equal(h.engine.state.file.pax["0"], "signed");
  });
  await check("preparation after a poll starts also protects the draft when its response arrives", async () => {
    const h = harness(), pending = h.poll(); h.emergencyResign.current = true; h.engine.state.send.status = "ready";
    h.reply({ agreement_id: "original", status: "signed", complete: true }); await pending;
    assert.equal(h.engine.state.send.status, "ready"); assert.equal(h.engine.state.file.agreement, "open");
  });
  await check("old in-flight response cannot replace the newly sent agreement ID or completion state", async () => {
    const h = harness(), pending = h.poll(); h.agreementId.current = "replacement";
    h.reply({ agreement_id: "original", status: "signed", complete: true, pax: { "0": "signed" } }); await pending;
    assert.equal(h.agreementId.current, "replacement"); assert.equal(h.engine.state.send.status, "sent"); assert.equal(h.engine.state.file.agreement, "open");
    assert.equal(h.engine.state.file.pax["0"], "signed");
  });
  await check("poll for the replacement itself can complete normally", async () => {
    const h = harness(); h.agreementId.current = "replacement";
    const pending = h.poll(); h.reply({ agreement_id: "replacement", status: "signed", complete: true }); await pending;
    assert.equal(h.engine.state.send.status, "signed"); assert.equal(h.engine.state.file.agreement, "done");
  });
  await check("current poll carries fresh emergency status into the office-completion guard", async () => {
    const h = harness(), pending = h.poll();
    h.reply({ agreement_id: "original", status: "signed", emergency: { needs_resign: true, status: "signed" } }); await pending;
    assert.deepEqual(h.emergency, { needsResign: true, status: "signed" });
  });
  await check("generic signing desk hides old office completion for pending or signed superseding emergency", async () => {
    const signing = ts.createSourceFile("CaseSigning.tsx", fs.readFileSync(path.resolve(__dirname, "../CaseSigning.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let condition: ts.Expression | undefined;
    const find = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && ts.isJsxElement(node.right) && node.right.openingElement.tagName.getText() === "button" && node.right.children.some((c) => ts.isJsxText(c) && c.text.trim() === "Finish office signing")) condition = node.left;
      ts.forEachChild(node, find);
    };
    find(signing); assert.ok(condition);
    const source = ts.transpileModule(`exports.visible = (status) => !!(${condition.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const component: any = {}; new Function("exports", source)(component);
    for (const emergency of [{ needs_resign: true, status: "sent" }, { needs_resign: true, status: "signed" }]) assert.equal(component.visible({ status: "signed", complete: false, emergency }), false);
    assert.equal(component.visible({ status: "signed", complete: false, emergency: { needs_resign: false } }), true);
  });
  console.log(`${count} signing poll scenarios passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
