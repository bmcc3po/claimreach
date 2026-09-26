// Run: npx tsx src/lib/mva-call/engine.test.ts
// Drives the ported call engine through the flows Brett approved on the canvas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CallEngine, REBS, type CallProps } from "./engine";

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
  e.setState({ phase: "send", story: { ...e.state.story, city: "Houston, TX" } });
  e.renderVals().next.go();
  assert.equal(calls.at(-1), "sendAgreement");
  assert.equal(e.state.send.status, "ready");
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

console.log(passed, "passed");
