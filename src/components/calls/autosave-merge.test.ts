// Executes the actual CallConsole save/flush callbacks against the real engine.
// Only transport, timers and React ref/state boundaries are synthetic.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CallEngine } from "../../lib/mva-call/engine";
import { applyAnswerDelta, isAnswerObject } from "../../lib/mva-call/answer-merge";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
const file = path.resolve(__dirname, "CallConsole.tsx");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "MatterCallConsole") as ts.FunctionDeclaration;
const funcs = ["save", "flushSave"].map(name => {
  const f = component.body!.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(f, `actual ${name} callback`); return f.getText(source);
}).join("\n");
const code = ts.transpileModule(`${funcs}\nexports.save = save; exports.flushSave = flushSave;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(raw: any = { story: { text: "Before" } }) {
  const noop = () => {};
  const engine = new CallEngine({ callerName: "Synthetic Caller", callerPhone: "", callerEmail: "", agentName: "Synthetic Agent", firmSpoken: "Synthetic Firm", textFrom: "", startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: false, status: "ready", pax: {} }, saved: raw }, { sendAgreement: noop, sendPax: noop, completeAgreement: noop, resendLink: noop, sendText: noop, saveDispo: noop, home: noop, ask: noop });
  const refs = { saving: { current: false }, saveBlocked: { current: false }, lastSaved: { current: JSON.stringify(engine.persistable()) }, answerBase: { current: raw }, callId: { current: "call" }, saveTimer: { current: null } };
  const sent: any[] = [], timers: any[] = [];
  let handler: (body: any) => Promise<any> = async body => ({ call_id: "call", answers: body.answers });
  const env: Record<string, any> = { ...refs, engine, init: { leadId: "lead", claimId: "claim" }, applyAnswerDelta, isAnswerObject,
    post: async (_url: string, body: any) => { sent.push(body); return handler(body); },
    setSavedAt: noop, setTimeout: (fn: any) => { timers.push(fn); return timers.length; }, clearTimeout: noop,
    window: { dispatchEvent: noop }, CustomEvent: class {}, console: { error: noop },
  };
  const exp: any = {};
  new Function("exports", ...Object.keys(env), code)(exp, ...Object.values(env));
  return { engine, ...refs, sent, timers, save: () => exp.save(JSON.stringify(engine.persistable())), flush: exp.flushSave, respond: (f: typeof handler) => { handler = f; } };
}
let count = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("actual bootstrap chooses canonical claim over stale live session, including explicit empty document", async () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../app/(calls)/app/[id]/page.tsx"), "utf8");
    const start = page.indexOf("  const canonical = (claim.answers"), end = page.indexOf("  // A passenger's first call", start);
    assert.ok(start >= 0 && end > start);
    const bootstrap = ts.transpileModule(page.slice(start, end) + "\nreturn saved;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const load = new Function("claim", "liveRes", "singleMatter", "lastRes", bootstrap);
    const stale = { data: { answers: { story: { text: "Stale call" } } } };
    assert.deepEqual(load({ answers: { mva_call: { story: { city: "Austin, TX" } } } }, stale, true, stale), { story: { city: "Austin, TX" } });
    assert.deepEqual(load({ answers: { mva_call: {} } }, stale, true, stale), {});
    assert.deepEqual(load({ answers: {} }, stale, true, stale), stale.data.answers);
  });
  await check("actual save sends sparse base and only agent changes, not engine defaults", async () => {
    const h = harness(); h.engine.set("story", "text", "Edited");
    assert.equal(await h.save(), true);
    assert.deepEqual(h.sent[0].base_answers, { story: { text: "Before" } });
    assert.deepEqual(h.sent[0].answers, { story: { text: "Edited" } });
    assert.deepEqual(h.answerBase.current, { story: { text: "Edited" } });
  });
  await check("actual acknowledgement shows imported answers and preserves typing in flight", async () => {
    const h = harness(); let release!: (v: any) => void;
    h.respond(() => new Promise(resolve => { release = resolve; }));
    h.engine.set("story", "text", "First edit"); const pending = h.save();
    h.engine.set("story", "text", "Second edit");
    h.engine.setState({ file: { ...h.engine.state.file, ssn: "000000000" }, send: { ...h.engine.state.send, status: "sent" } });
    release({ call_id: "call", answers: { story: { text: "First edit", city: "Austin, TX" } } });
    assert.equal(await pending, true);
    assert.equal(h.engine.state.story.text, "Second edit"); assert.equal(h.engine.state.story.city, "Austin, TX");
    assert.equal(h.engine.state.file.ssn, "000000000"); assert.equal(h.engine.state.send.status, "sent");
    h.respond(async body => ({ answers: body.answers }));
    assert.equal(await h.save(), true);
    assert.deepEqual(h.sent[1].base_answers, { story: { text: "First edit", city: "Austin, TX" } });
    assert.deepEqual(h.sent[1].answers, { story: { text: "Second edit", city: "Austin, TX" } });
  });
  await check("actual failed save retains baseline and schedules retry without declaring saved", async () => {
    const h = harness(), before = h.lastSaved.current;
    h.engine.set("story", "text", "Unsaved"); h.respond(async () => { throw Error("Synthetic failure"); });
    assert.equal(await h.save(), false); assert.equal(h.lastSaved.current, before); assert.equal(h.timers.length, 1);
    assert.equal(h.engine.state.story.text, "Unsaved"); assert.match(h.engine.state.net.saveError, /Not saved/);
  });
  await check("same-leaf conflict preserves local edits, stops automatic retries and blocks disposition flush", async () => {
    const h = harness(); h.engine.set("story", "text", "Mine");
    h.respond(async () => { const e: any = Error("story.text changed on another screen"); e.conflict = true; throw e; });
    assert.equal(await h.save(), false); assert.equal(h.saveBlocked.current, true); assert.equal(h.timers.length, 0);
    assert.equal(h.engine.state.story.text, "Mine"); assert.match(h.engine.state.net.saveError, /story.text/);
    assert.equal(await h.flush(), false); assert.equal(h.sent.length, 1);
  });
  await check("partial failure retains returned call identity for retry instead of creating another session", async () => {
    const h = harness(); h.engine.set("story", "text", "Edited");
    h.respond(async () => { const e: any = Error("Lead mirror failed"); e.callId = "created-call"; throw e; });
    await h.save(); assert.equal(h.callId.current, "created-call");
  });
  console.log(`${count} passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
