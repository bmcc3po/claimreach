// Run: npx tsx src/lib/mva-call/engine.test.ts
// Drives the ported call engine through the flows Brett approved on the canvas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CallEngine, REBS, BODYQ, doiOf, type CallProps } from "./engine";
const isoAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const BODYQ_BY = (k: string) => BODYQ.find((q: any) => q.key === k);

const calls: string[] = [];
const api = {
  sendAgreement: () => calls.push("sendAgreement"),
  sendPax: (i: number) => calls.push("sendPax:" + i),
  completeAgreement: () => calls.push("completeAgreement"),
  resendLink: () => calls.push("resendLink"),
  sendText: (b: string) => calls.push("sendText:" + b),
  saveDispo: () => calls.push("saveDispo"),
  home: () => calls.push("home"),
  ask: (t: string) => calls.push("ask:" + t),
};

const reasons = {
  esign: [{ key: "tech_issue", label: "Tech issue" }, { key: "read_trust", label: "Wants to read it (trust)" }],
  callback: [{ key: "driving", label: "Driving" }, { key: "other", label: "Other" }],
  ni: [{ key: "no_lawyer", label: "Doesn't want a lawyer" }],
  dq: ["at_fault", "no_injury", "no_treatment", "treatment_gap", "sol", "no_coverage", "settled", "already_rep", "low_limits", "other"]
    .map((k) => ({ key: k, label: k })),
};

function mk(over: Partial<CallProps> = {}) {
  const props: CallProps = {
    callerName: "Maria Lopez", agentName: "Lisa", firmSpoken: "Turnbull Moak and Pendergrass",
    textFrom: "(601) 555-0100", startedAt: Date.now() - 95_000, reasons,
    notifyDefaults: [{ who: "Brett", how: "bmc@innovativeintake.com" }],
    esign: { status: "ready", configured: true, pax: {} }, ...over,
  };
  const e = new CallEngine(props, api);
  return e;
}
let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log("ok", name); }

t("clock counts from the call start", () => {
  const v = mk().renderVals();
  assert.equal(v.clockText, "01:35");
});

t("caller, agent and firm fill the script", () => {
  const v = mk().renderVals();
  assert.equal(v.callerName, "Maria Lopez");
  assert.equal(v.callerFirst, "Maria");
  assert.equal(v.agentFirst, "Lisa");
  assert.equal(v.firmSpoken, "Turnbull Moak and Pendergrass");
  const legit = REBS.find((r: any) => r.id === "legit");
  assert.ok(legit.text.includes("{FIRM}"));
});

t("every top-level hole in CallView resolves", () => {
  const src = readFileSync(new URL("../../components/calls/CallView.tsx", import.meta.url), "utf8");
  const roots = new Set(Array.from(src.matchAll(/\bv\.([A-Za-z_]\w*)/g)).map((m) => m[1]));
  roots.delete("leadId"); // added by CallConsole, not the engine
  roots.delete("previewHref"); // added by CallConsole
  roots.delete("onPreview"); // added by CallConsole
  roots.delete("phoneRows"); roots.delete("callOut"); roots.delete("copyNum"); // added by CallConsole
  const states: Array<(e: CallEngine) => void> = [
    () => {},
    (e) => e.setState({ phase: "story" }),
    (e) => e.setState({ phase: "body" }),
    (e) => e.setState({ phase: "send" }),
    (e) => e.setState({ free: true }),
    (e) => e.setState({ free: true, bare: true }),
    (e) => e.setState({ sheet: true, helpTab: "lines" }),
    (e) => e.openDispo(),
  ];
  for (const s of states) {
    const e = mk(); s(e);
    const v = e.renderVals();
    for (const r of Array.from(roots)) assert.notEqual(v[r], undefined, "v." + r + " is undefined");
  }
});

t("grouped rebuttals: Right now first, groups hold everything", () => {
  const e = mk(); e.setState({ phase: "body", sheet: true });
  const v = e.renderVals();
  const heads = v.rebs.filter((r: any) => r.isHead).map((r: any) => r.label);
  assert.equal(heads[0], "Right now");
  const items = v.rebs.filter((r: any) => r.isItem);
  assert.ok(items.length > REBS.length && items.length <= REBS.length + 4);
});

t("rebuttal copy carries the firm on this campaign", () => {
  const e = mk({ firmSpoken: "The Money Team" }); e.setState({ sheet: true, reb: "legit" });
  const v = e.renderVals();
  assert.ok(v.picked.text.includes("The Money Team"));
  assert.ok(!v.picked.text.includes("{FIRM}"));
});

t("Lines tab fills the caller's first name and follows focus", () => {
  const e = mk(); e.renderVals().openRamble();
  const v = e.renderVals();
  assert.equal(v.lines[0].head, "She will not stop talking");
  assert.ok(v.lines[0].items[0].t.includes("Maria"));
});

t("fee table only on How we work, per agreement", () => {
  const e = mk(); e.setState({ story: { ...e.state.story, city: "Miami, FL" } });
  const v = e.renderVals();
  assert.equal(v.fees[0].v, "33 1/3%");
  assert.equal(v.fees.length, 2);
});

t("six lights: at fault and a gap go red", () => {
  const e = mk();
  e.setState({ story: { ...e.state.story, fault: "Caller", when: "Pick a date", date: new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10), city: "Houston, TX" } });
  e.setState({ body: { ...e.state.body, seen: ["Not yet"] } });
  const g = Object.fromEntries(e.gates().map((x: any) => [x.label, x.cls]));
  assert.ok(g.Fault.includes("bad"));
  assert.ok(g.Gap.includes("bad"));
});

t("dispo: nothing picked on a fresh call", () => {
  const e = mk(); e.openDispo();
  const v = e.renderVals();
  assert.equal(v.dispo.saveLabel, "Pick how it ended");
  assert.ok(v.dispo.cantSave);
});

t("dispo: call back needs a reason and a time", () => {
  const e = mk(); e.openDispo();
  e.dispoPick("callback");
  let v = e.renderVals();
  assert.equal(v.dispo.saveLabel, "Pick a reason");
  v.dispo.why.find((w: any) => w.label === "Driving").pick();
  v = e.renderVals();
  assert.equal(v.dispo.saveLabel, "Pick a time");
  v.dispo.when.find((w: any) => w.label === "Tonight").pick();
  v = e.renderVals();
  assert.equal(v.dispo.saveLabel, "Save dispo");
  assert.deepEqual(e.state.dispo.why, ["driving"]);
  v.dispo.save();
  assert.equal(calls.at(-1), "saveDispo");
});

t("dispo: disqualified pre-checks reason keys from the red lights", () => {
  const e = mk();
  e.setState({ story: { ...e.state.story, fault: "Caller" } });
  e.setState({ body: { ...e.state.body, willing: "No", check: "Yes, for injuries" } });
  e.openDispo(); e.dispoPick("dq");
  assert.deepEqual([...e.state.dispo.why].sort(), ["at_fault", "no_treatment", "settled"]);
  const v = e.renderVals();
  assert.ok(v.dispo.fromCall);
  assert.ok(v.dispo.summary !== undefined);
});

t("dispo: a sent agreement pre-picks E-sign sent", () => {
  const e = mk({ esign: { status: "opened", configured: true, pax: {} } }); e.openDispo();
  assert.equal(e.state.dispo.pick, "esign");
});

t("dispo: signed pre-picks Signed and lists Brett", () => {
  const e = mk({ esign: { status: "signed", configured: true, pax: {} } }); e.openDispo();
  const v = e.renderVals();
  assert.equal(e.state.dispo.pick, "signed");
  assert.equal(v.dispo.notify[0].how, "bmc@innovativeintake.com");
  assert.ok(!v.dispo.cantSave);
});

t("dispo: DNC saves with no reason", () => {
  const e = mk(); e.openDispo(); e.dispoPick("dnc");
  assert.ok(!e.renderVals().dispo.cantSave);
});

t("send and complete go to the api, never simulate", () => {
  const e = mk();
  e.setState({ phase: "send", story: { ...e.state.story, city: "Houston, TX", when: "Yesterday" }, send: { ...e.state.send, client: "Jane Doe", phone: "2055550142" } });
  e.renderVals().next.go();
  assert.equal(calls.at(-1), "sendAgreement");
  assert.equal(e.state.send.status, "ready");
});

t("send tapped with something missing says what, and sends nothing", () => {
  const e = mk();
  const before = calls.length;
  e.setState({ phase: "send", story: { ...e.state.story, city: "Las Vegas" }, send: { ...e.state.send, client: "Jane Doe", phone: "DS" } });
  const v = e.renderVals();
  assert.ok(v.next.muted);
  v.next.go();
  assert.equal(calls.length, before);
  const n = e.renderVals().nudge;
  assert.ok(/state/.test(n) && /cell/.test(n) && /date of the wreck/.test(n), n);
  assert.ok(e.renderVals().needDoi);
  e.setState({ story: { ...e.state.story, city: "Las Vegas, NV", when: "Pick a date", date: isoAgo(12) }, send: { ...e.state.send, phone: "7025551212" } });
  assert.equal(e.renderVals().nudge, "");
  assert.ok(!e.renderVals().next.muted);
});

t("autosave never keeps the SSN", () => {
  const e = mk();
  e.setState({ file: { ...e.state.file, ssn: "123456789", dob: "01/02/1990" } });
  const p: any = e.persistable();
  assert.equal(p.file.ssn, undefined);
  assert.equal(p.file.dob, "01/02/1990");
});

t("a saved call restores answers but not screen state", () => {
  const e = mk({ saved: { phase: "body", story: { fault: "Other driver", city: "Houston, TX" }, body: { pain: ["Neck"] }, file: { ssn: "999" } } });
  assert.equal(e.state.phase, "body");
  assert.equal(e.state.story.fault, "Other driver");
  assert.deepEqual(e.state.body.pain, ["Neck"]);
  assert.equal(e.state.file.ssn, "");
  assert.equal(e.state.sheet, false);
});

// ---- The 30-day calculator ----
function crashAgo(n: number) {
  const e = mk();
  e.setState({ phase: "body", story: { ...e.state.story, when: "Pick a date", date: isoAgo(n), city: "Houston, TX" } });
  return e;
}
const pickBody = (e: CallEngine, key: string, label: string) => {
  const row = e.renderVals().bodyRows.find((r: any) => r.key === key);
  assert.ok(row && row.q, "row " + key + " is open");
  row.q.chips.find((c: any) => c.label === label).pick();
};
const light = (e: CallEngine, label: string): string => (e.gates().find((g: any) => g.label === label) as any).cls;
const liveKeys = (e: CallEngine) => e.renderVals().bodyRows.map((r: any) => r.key);

t("gap: not seen, 15 days left, no today-or-tomorrow", () => {
  const e = crashAgo(15);
  e.setState({ body: { ...e.state.body, pain: ["Neck"], done: { pain: true } } });
  pickBody(e, "seen", "Not yet");
  const v = e.renderVals();
  assert.ok(v.gapCard.lines.some((l: any) => /15 days left/.test(l.t)), JSON.stringify(v.gapCard));
  assert.ok(!v.gapCard.lines.some((l: any) => /today or tomorrow/.test(l.t)));
  assert.equal(e.currentQ()?.key, "willing");
  assert.equal(v.q.line, "If we get you in with somebody local this week, are you able to go?");
  assert.ok(light(e, "Gap").includes("ok"));
});

t("gap: not seen, under 5 days left asks today or tomorrow", () => {
  const e = crashAgo(27);
  e.setState({ body: { ...e.state.body, pain: ["Neck"], done: { pain: true } } });
  pickBody(e, "seen", "Not yet");
  let v = e.renderVals();
  assert.ok(v.gapCard.lines.some((l: any) => /3 days left/.test(l.t)), JSON.stringify(v.gapCard));
  assert.equal(v.gapCard.value, "3 days left");
  assert.equal(v.q.line, "Can you get in today or tomorrow?");
  assert.ok(light(e, "Gap").includes("flag"));
  pickBody(e, "willing", "No");
  // A no to today or tomorrow is a gap coming, not a refusal to treat.
  assert.ok(light(e, "Treat").includes("flag"));
  e.setState({ body: { ...e.state.body, willing: "Yes" } });
  assert.ok(light(e, "Gap").includes("ok"));
});

t("gap: 120 days, seen, walks first visit, last visit, a month off", () => {
  const e = crashAgo(120);
  e.setState({ body: { ...e.state.body, pain: ["Back"], done: { pain: true } } });
  let v = e.renderVals();
  assert.ok(/120 days ago/.test(v.gapCard.head), v.gapCard.head);
  e.bodyPick(BODYQ_BY("seen"), "Chiropractor", false);
  e.renderVals().q.next();
  v = e.renderVals();
  assert.ok(/at least 3 times/.test(v.gapCard.head), v.gapCard.head);
  assert.equal(e.currentQ()?.key, "firstAt");
  pickBody(e, "firstAt", "Same day");
  assert.equal(e.currentQ()?.key, "lastAt");
  e.renderVals().q.date.set({ target: { value: isoAgo(10) } });
  assert.equal(e.currentQ()?.key, "stretch");
  pickBody(e, "stretch", "No");
  v = e.renderVals();
  assert.ok(v.gapCard.lines.some((l: any) => /20 days left/.test(l.t)), JSON.stringify(v.gapCard));
  assert.ok(!liveKeys(e).includes("willing"));
  assert.ok(light(e, "Gap").includes("ok"));
  assert.equal(v.bodyRows.find((r: any) => r.key === "firstAt").value, "Same day as the wreck");
  assert.ok(/10 days ago/.test(v.bodyRows.find((r: any) => r.key === "lastAt").value));
});

t("gap: last visit over 30 days ago goes red and asks if she will go back", () => {
  const e = crashAgo(90);
  e.setState({ body: { ...e.state.body, seen: ["ER"], done: { seen: true }, firstAt: "same", lastAt: isoAgo(45) } });
  const v = e.renderVals();
  assert.ok(light(e, "Gap").includes("bad"));
  assert.ok(v.gapCard.lines.some((l: any) => /45 days ago. That is a gap/.test(l.t)));
  assert.equal(v.gapCard.value, "Gap");
  assert.ok(liveKeys(e).includes("willing"));
});

t("gap: a month with no visit is a gap; a date before the wreck is refused", () => {
  const e = crashAgo(100);
  e.setState({ body: { ...e.state.body, seen: ["ER"], done: { seen: true }, firstAt: isoAgo(98), lastAt: isoAgo(5), stretch: "Yes" } });
  assert.ok(light(e, "Gap").includes("bad"));
  e.setState({ body: { ...e.state.body, firstAt: isoAgo(130), focus: "firstAt" } });
  const row = e.renderVals().bodyRows.find((r: any) => r.key === "firstAt");
  assert.equal(row.q.dateWhy, "That date is before the wreck.");
  assert.ok(!e.answered(e.state.body, BODYQ_BY("firstAt")));
});

t("gap: a fresh wreck she was seen for asks no dates", () => {
  const e = crashAgo(10);
  e.setState({ body: { ...e.state.body, pain: ["Neck"], done: { pain: true }, seen: ["Urgent care"] } });
  e.setState({ body: { ...e.state.body, done: { ...e.state.body.done, seen: true } } });
  const keys = liveKeys(e);
  assert.ok(!keys.includes("firstAt") && !keys.includes("lastAt") && !keys.includes("stretch"));
  assert.ok(light(e, "Gap").includes("ok"));
});

// ---- Story as one list ----
t("story: one row open, a finished row moves to the next missing", () => {
  const e = mk();
  e.setState({ phase: "story" });
  let rows = e.renderVals().storyRows;
  assert.deepEqual(rows.map((r: any) => r.key), ["city", "when", "seat", "fault", "police"]);
  assert.equal(rows.filter((r: any) => r.open).length, 1);
  assert.equal(rows.find((r: any) => r.open).key, "city");
  assert.equal(rows[0].ask, "What city and state was that in?");
  // Typing keeps Where open, even once the state reads.
  e.renderVals().storyWhere.set("Mobile, AL");
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "city");
  e.renderVals().storyWhere.done();
  rows = e.renderVals().storyRows;
  assert.equal(rows.find((r: any) => r.open).key, "when");
  assert.equal(rows[0].value, "Mobile, AL");
  e.renderVals().storyWhen.chips.find((c: any) => c.label === "Yesterday").pick();
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "seat");
  // Tapping another row opens it; tapping the open one closes everything.
  e.renderVals().storyRows.find((r: any) => r.key === "police").toggle();
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "police");
  e.renderVals().storyRows.find((r: any) => r.key === "police").toggle();
  assert.equal(e.renderVals().storyRows.filter((r: any) => r.open).length, 0);
  e.renderVals().storyFault.find((c: any) => c.label === "Other driver").pick();
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "seat");
});

t("story: pick a date stays open until the date is whole", () => {
  const e = mk();
  e.setState({ phase: "story", storyOpen: "when" });
  e.renderVals().storyWhen.chips.find((c: any) => c.label === "Pick a date").pick();
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "when");
  e.renderVals().storyWhen.date.set({ target: { value: "0002-09-14" } });
  assert.equal(e.renderVals().storyRows.find((r: any) => r.open).key, "when");
  e.renderVals().storyWhen.date.set({ target: { value: isoAgo(40) } });
  const rows = e.renderVals().storyRows;
  assert.notEqual(rows.find((r: any) => r.open)?.key, "when");
  const when = rows.find((r: any) => r.key === "when");
  assert.ok(/40 days ago/.test(when.value), when.value);
  assert.equal(when.sub, "She needs to have been seen, never more than 30 days apart.");
});

t("the crash date reads one way everywhere", () => {
  assert.equal(doiOf({ when: "Pick a date", date: "2026-09-14" }), "09/14/2026");
  assert.equal(doiOf({ when: "Pick a date", date: "0002-09-14" }), "");
  assert.equal(doiOf({ when: null }), "");
  assert.equal(doiOf({ when: "Today" }).length, 10);
});

console.log(passed, "passed");
