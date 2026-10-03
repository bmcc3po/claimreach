// Executes the actual CallConsole save/flush callbacks against the real engine.
// Only transport, timers and React ref/state boundaries are synthetic.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CallEngine } from "../../lib/mva-call/engine";
import { applyAnswerDelta, isAnswerObject, CALL_VIEW_KEYS } from "../../lib/mva-call/answer-merge";

globalThis.fetch = async () => { throw Error("Network forbidden"); };
const file = path.resolve(__dirname, "CallConsole.tsx");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "MatterCallConsole") as ts.FunctionDeclaration;
const funcs = ["save", "performSave", "flushSave"].map(name => {
  const f = component.body!.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(f, `actual ${name} callback`); return f.getText(source);
}).join("\n");
const code = ts.transpileModule(`${funcs}\nexports.save = save; exports.flushSave = flushSave;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(raw: any = { story: { text: "Before" } }) {
  const noop = () => {};
  const engine = new CallEngine({ callerName: "Synthetic Caller", callerPhone: "", callerEmail: "", agentName: "Synthetic Agent", firmSpoken: "Synthetic Firm", textFrom: "", startedAt: Date.now(), reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [], esign: { configured: false, status: "ready", pax: {} }, saved: raw }, { sendAgreement: noop, sendPax: noop, completeAgreement: noop, resendLink: noop, sendText: noop, saveDispo: noop, home: noop, ask: noop });
  const refs = { saving: { current: false }, saveInFlight: { current: null as Promise<boolean> | null }, saveBlocked: { current: false }, lastSaved: { current: JSON.stringify(engine.persistable()) }, answerBase: { current: raw }, callId: { current: "call" }, saveTimer: { current: null } };
  const sent: any[] = [], timers: any[] = [];
  let handler: (body: any) => Promise<any> = async body => ({ call_id: "call", answers: body.answers });
  const env: Record<string, any> = { ...refs, engine, init: { leadId: "lead", claimId: "claim" }, applyAnswerDelta, isAnswerObject, CALL_VIEW_KEYS,
    post: async (_url: string, body: any) => { sent.push(body); return handler(body); },
    setSavedAt: noop, setTimeout: (fn: any, delay: number) => { timers.push({ fn, delay, cancelled: false }); return timers.length; }, clearTimeout: (id: number) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    window: { dispatchEvent: noop }, CustomEvent: class {}, console: { error: noop },
  };
  const exp: any = {};
  new Function("exports", ...Object.keys(env), code)(exp, ...Object.values(env));
  return { engine, ...refs, sent, timers, save: () => exp.save(JSON.stringify(engine.persistable())), flush: exp.flushSave, respond: (f: typeof handler) => { handler = f; },
    runTimer: () => { const timer = timers.find(t => !t.cancelled); assert.ok(timer, "a pending save timer"); timer.cancelled = true; timer.fn(); },
    pendingTimers: () => timers.filter(t => !t.cancelled),
  };
}
let count = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); count++; console.log("ok", name); }
async function main() {
  await check("finish waits for an already-running slow save instead of spending a four-second polling budget", async () => {
    const h = harness(); let release!: (value: any) => void;
    h.engine.set("story", "text", "Slow connection edit");
    h.respond(() => new Promise(resolve => { release = resolve; }));
    const saving = h.save(); let finished = false;
    const finishing = h.flush().then((ok: boolean) => { finished = true; return ok; });
    for (let i = 0; i < 40; i++) await Promise.resolve();
    assert.equal(finished, false);
    assert.equal(h.pendingTimers().length, 0, "no arbitrary polling deadline");
    assert.equal(h.sent.length, 1, "the running request is shared, not duplicated");
    release({ answers: h.sent[0].answers });
    assert.equal(await saving, true); assert.equal(await finishing, true);
  });
  await check("another screen's saved position cannot create an endless acknowledgement loop", async () => {
    const h = harness(); h.engine.set("story", "text", "My answer");
    const here = h.engine.persistable().at;
    h.respond(async body => ({ answers: { ...body.answers, at: "retainer", atQuestion: "signer", phase: "send", visited: { send: true } } }));
    assert.equal(await h.flush(), true);
    assert.equal(h.sent.length, 1);
    assert.equal(h.engine.persistable().at, here);
    assert.equal(h.answerBase.current.at, "retainer");
    assert.equal(h.lastSaved.current, JSON.stringify(h.engine.persistable()));
    assert.equal(h.pendingTimers().length, 0);
  });
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
  await check("overlapping stage navigation and late typing drain the newest snapshot without another edit", async () => {
    const h = harness(), releases: ((value: any) => void)[] = [];
    h.respond(() => new Promise(resolve => { releases.push(resolve); }));
    h.engine.setView("steps");
    h.engine.renderVals().fi.step.next.go();
    const first = h.save();
    h.engine.renderVals().fi.step.next.go();
    assert.equal(await h.save(), false, "the newer debounce cannot overlap request A");
    h.engine.set("story", "text", "Edit B while request A waits");
    releases[0]({ answers: h.sent[0].answers }); await first;
    assert.equal(h.sent.length, 1);
    assert.equal(h.pendingTimers().length, 1, "success replaces the lost debounce with a drain");
    h.runTimer();
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1].answers.at, "insurance", "latest stage position is included");
    assert.equal(h.sent[1].answers.story.text, "Edit B while request A waits");
    h.engine.set("story", "text", "Late edit C while request B waits");
    assert.equal(await h.save(), false);
    releases[1]({ answers: h.sent[1].answers });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(h.pendingTimers().length, 1);
    h.runTimer();
    assert.equal(h.sent.length, 3);
    assert.equal(h.sent[2].answers.story.text, "Late edit C while request B waits");
    releases[2]({ answers: h.sent[2].answers });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(h.pendingTimers().length, 0, "an equal acknowledged snapshot does not loop");
    assert.equal(h.lastSaved.current, JSON.stringify(h.engine.persistable()));
    assert.equal(h.saving.current, false);
  });
  await check("canonical object key order alone cannot create an extra save", async () => {
    const h = harness({ story: { text: "Before", city: "Synthetic City" } });
    const sort = (value: any): any => Array.isArray(value) ? value.map(sort) : isAnswerObject(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
    h.engine.setView("steps"); h.engine.renderVals().fi.step.next.go();
    h.respond(async body => ({ answers: sort(body.answers) }));
    assert.equal(await h.save(), true);
    assert.equal(h.lastSaved.current, JSON.stringify(h.engine.persistable()));
    assert.equal(h.pendingTimers().length, 0);
  });
  await check("disposition flush waits for edits made during its request before allowing call completion", async () => {
    const h = harness(), releases: ((value: any) => void)[] = [];
    h.respond(() => new Promise(resolve => { releases.push(resolve); }));
    h.engine.set("story", "text", "Edit A");
    let complete = false;
    const pending = h.flush().then((saved: boolean) => { complete = true; return saved; });
    h.engine.set("story", "text", "Edit B during flush A");
    releases[0]({ answers: h.sent[0].answers });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(complete, false, "acknowledging A cannot let disposition close over B");
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1].answers.story.text, "Edit B during flush A");
    assert.equal(h.pendingTimers().length, 0, "flush owns the next write instead of racing a drain timer");
    h.engine.set("story", "text", "Late edit C during flush B");
    releases[1]({ answers: h.sent[1].answers });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(complete, false);
    assert.equal(h.sent.length, 3);
    assert.equal(h.sent[2].answers.story.text, "Late edit C during flush B");
    releases[2]({ answers: h.sent[2].answers });
    assert.equal(await pending, true);
    assert.equal(h.lastSaved.current, JSON.stringify(h.engine.persistable()));
    assert.equal(h.pendingTimers().length, 0);
    assert.equal(await h.flush(), true);
    assert.equal(h.sent.length, 3, "already acknowledged data does not write again");
  });
  await check("flush stops after a failed late-edit save and preserves retry or conflict protection", async () => {
    for (const conflict of [false, true]) {
      const h = harness(); let release!: (value: any) => void;
      h.engine.set("story", "text", "Edit A");
      h.respond(() => new Promise(resolve => { release = resolve; }));
      const pending = h.flush();
      h.engine.set("story", "text", "Edit B survives failed flush");
      h.respond(async () => { const error: any = Error("Synthetic flush failure"); error.conflict = conflict; throw error; });
      release({ answers: h.sent[0].answers });
      assert.equal(await pending, false);
      assert.equal(h.sent.length, 2);
      assert.equal(h.engine.state.story.text, "Edit B survives failed flush");
      assert.notEqual(h.lastSaved.current, JSON.stringify(h.engine.persistable()));
      assert.equal(h.pendingTimers().length, conflict ? 0 : 1);
      if (!conflict) assert.equal(h.pendingTimers()[0].delay, 4000);
      assert.equal(h.saveBlocked.current, conflict);
    }
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
  await check("a failed or conflicting in-flight request never starts the success drain", async () => {
    for (const conflict of [false, true]) {
      const h = harness(); let reject!: (error: any) => void;
      h.engine.set("story", "text", "First edit");
      h.respond(() => new Promise((_resolve, fail) => { reject = fail; }));
      const request = h.save();
      h.engine.set("story", "text", "Newer edit remains");
      assert.equal(await h.save(), false);
      const error: any = Error("Synthetic failed request"); error.conflict = conflict;
      reject(error); assert.equal(await request, false);
      assert.equal(h.engine.state.story.text, "Newer edit remains");
      assert.equal(h.sent.length, 1);
      assert.equal(h.pendingTimers().length, conflict ? 0 : 1);
      if (!conflict) assert.equal(h.pendingTimers()[0].delay, 4000, "normal retry backoff survives");
      assert.equal(h.saveBlocked.current, conflict);
    }
  });
  await check("partial failure retains returned call identity for retry instead of creating another session", async () => {
    const h = harness(); h.engine.set("story", "text", "Edited");
    h.respond(async () => { const e: any = Error("Lead mirror failed"); e.callId = "created-call"; throw e; });
    await h.save(); assert.equal(h.callId.current, "created-call");
  });
  console.log(`${count} passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

