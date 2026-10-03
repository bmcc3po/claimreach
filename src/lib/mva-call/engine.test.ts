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

t("every engine-owned top-level property in CallView resolves", () => {
  const src = readFileSync(new URL("../../components/calls/CallView.tsx", import.meta.url), "utf8");
  const roots = new Set(Array.from(src.matchAll(/\bv\.([A-Za-z_]\w*)/g)).map((m) => m[1]));
  roots.delete("clientContact"); roots.delete("agreementId"); // inline record editor and agreement identity from CallConsole
  roots.delete("leadId"); // added by CallConsole, not the engine
  roots.delete("claimId"); // added by CallConsole for the pinned matter
  roots.delete("canOverrideDownload"); roots.delete("passengerLinks"); // authenticated role and linked passenger files from CallConsole
  roots.delete("previewHref"); // added by CallConsole
  roots.delete("onPreview"); // added by CallConsole
  roots.delete("phoneRows"); roots.delete("callOut"); roots.delete("copyNum"); // added by CallConsole
  roots.delete("ws"); // the layout, picked by CallConsole
  roots.delete("ssnRequireFull"); // campaign rule, added by CallConsole
  roots.delete("saveText"); roots.delete("saveNow"); // autosave line, added by CallConsole
  // These depend on current provider evidence and responsive panel state.
  // CallConsole supplies them; optional callbacks are intentionally absent
  // when re-sign is unavailable or the case-tools panel is already inline.
  roots.delete("emergencyNotice"); roots.delete("prepareResign");
  roots.delete("openCaseTools"); roots.delete("openFile");
  // Supplied by CallConsole's secure identity state, not the shared engine.
  roots.delete("identityStatus");
  roots.delete("identitySaveError");
  roots.delete("identityRetry");
  roots.delete("identitySavedMode");
  // Owner reconciliation controls are supplied by CallConsole from the
  // authenticated role and the durable send reservation, not by the engine.
  roots.delete("reconcileActions"); roots.delete("reconcileBusy"); roots.delete("reconcileMessage");
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

t("Today saves as the calendar date, so the crash day never drifts", () => {
  const e = mk();
  e.setState({ story: { ...e.state.story, when: "Today" } });
  const saved = e.persistable();
  assert.equal(saved.story.when, "Pick a date");
  assert.match(saved.story.date, /^\d{4}-\d{2}-\d{2}$/);
  // The screen still shows the chip; the record keeps the date.
  assert.equal(e.state.story.when, "Today");
});

t("a parked agreement can be reopened and finished", () => {
  const e = mk(); e.setState({ phase: "file", send: { ...e.state.send, status: "signed" } });
  let v = e.renderVals();
  assert.equal(v.agreementOpen, true);
  v.leaveForQa();
  v = e.renderVals();
  assert.equal(v.agreementParked, true);
  assert.equal(v.agreementOpen, false);
  v.reopenAgreement();
  v = e.renderVals();
  assert.equal(v.agreementOpen, true);
  assert.equal(v.agreementParked, false);
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
  assert.equal(v.lines[0].head, "The PNC will not stop talking");
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

t("signed disposition names the next step without inventing firm delivery status", () => {
  const e = mk(); e.openDispo(); e.dispoPick("signed");
  const v = e.renderVals();
  assert.equal(v.dispo.saveLabel, "Save & review intake");
  assert.equal(v.dispo.cantSave, false);
  assert.ok(!v.dispo.summary.some((row: any) => row.k === "Firm packet"));
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
  assert.equal(v.dispo.saveLabel, "Save the call");
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

t("saved signed disposition can move between answer review and final QA without changing answers", () => {
  const e = mk({ esign: { status: "signed", configured: true, pax: {} } });
  e.set('story', 'text', 'Stopped at a red light; struck from behind.');
  const before = e.persistable().story.text;
  e.openDispo(); e.setState({ dispo: { ...e.state.dispo, saved: true } });
  e.renderVals().reviewIntake();
  assert.equal(e.renderVals().postCallReview, true);
  assert.equal(e.renderVals().dispoOpen, false);
  e.renderVals().finishReview();
  assert.equal(e.renderVals().postCallReview, false);
  assert.equal(e.renderVals().dispoOpen, true);
  assert.equal(e.persistable().story.text, before);
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

t("a fresh wreck still captures the first treatment date without extra gap questions", () => {
  const e = crashAgo(10);
  e.setState({ body: { ...e.state.body, pain: ["Neck"], done: { pain: true }, seen: ["Urgent care"] } });
  e.setState({ body: { ...e.state.body, done: { ...e.state.body.done, seen: true } } });
  const keys = liveKeys(e);
  assert.ok(keys.includes("firstAt") && !keys.includes("lastAt") && !keys.includes("stretch"));
  assert.ok(light(e, "Gap").includes("ok"));
});

t("first-call essentials persist real facts and unavailable markers without fake values", () => {
  const e = mk({ callerPhone: '2025550100', callerEmail: 'client@example.test', homeAddress: '100 Test St, Houston, TX 77001' });
  e.setState({ view: 'form', story: { ...e.state.story, city: 'Houston, TX', when: 'Yesterday', police: 'Came out' }, body: { ...e.state.body, seen: ['Not yet'] } });
  const question = (id: string) => e.renderVals().fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === id);
  question('road').c.field.set({ target: { value: 'Main at First' } });
  question('policeAgency').c.field.set({ target: { value: 'Houston Police' } });
  question('report').c.unavailable.pick();
  question('carrier').c.own.set({ target: { value: 'Client insurer' } });
  question('carrier').c.details.set({ target: { value: 'Policy TEST-42' } });
  question('people').c.others.pick();
  const saved = e.persistable();
  assert.equal(saved.file.report, '', 'unknown report must remain blank');
  assert.equal(saved.file.reportUnavailable, true);
  const reopened = mk({ saved, callerPhone: '2025550100', callerEmail: 'client@example.test', homeAddress: '100 Test St, Houston, TX 77001' });
  const rows = reopened.renderVals().fi.firstConversation;
  assert.deepEqual(rows.filter((r: any) => r.pending).map((r: any) => r.id), ['report']);
  assert.equal(reopened.state.file.ownCarrier, 'Client insurer');
  assert.equal(reopened.state.story.road, 'Main at First');
  assert.equal(reopened.state.car.othersPresent, true);
  assert.equal(reopened.fiInfo('people').answered, true, 'passenger demographics must not block the caller');
  question('report').c.field.set({ target: { value: 'CASE-123' } });
  assert.equal(e.state.file.reportUnavailable, false);
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
  assert.equal(when.sub, "The PNC needs to have been seen, never more than 30 days apart.");
});

t("the crash date reads one way everywhere", () => {
  assert.equal(doiOf({ when: "Pick a date", date: "2026-09-14" }), "09/14/2026");
  assert.equal(doiOf({ when: "Pick a date", date: "0002-09-14" }), "");
  assert.equal(doiOf({ when: null }), "");
  assert.equal(doiOf({ when: "Today" }).length, 10);
});

// ---- Full Intake: one engine, the caller's order ----
const fiOf = (e: CallEngine) => e.renderVals().fi;
const fiQ = (e: CallEngine, id: string) => { for (const s of fiOf(e).sections) for (const q of s.questions) if (q.id === id) return q; return null as any; };
const fiSec = (e: CallEngine, id: string) => fiOf(e).sections.find((s: any) => s.id === id);
const fiTap = (e: CallEngine, id: string, label: string) => { const q = fiQ(e, id); assert.ok(q && q.c.opts, "no chips for " + id); q.c.opts.find((o: any) => o.label === label).pick(); };

t("full intake: the caller's story, captured out of order", () => {
  const e = mk();
  e.setState({ phase: "story" });
  e.setView("full");
  assert.equal(e.renderVals().fullView, true);
  assert.equal(fiOf(e).openSec, "incident");
  // "Last Thursday" is one tap on the week strip.
  const four = isoAgo(4);
  const chip = fiQ(e, "when").c.opts.find((o: any) => /^\w{3} \d+$/.test(o.label) && o.label.endsWith(" " + Number(four.slice(8))));
  chip.pick();
  assert.equal(e.state.story.when, "Pick a date");
  assert.equal(e.state.story.date, four);
  fiQ(e, "city").c.where.set("Las Vegas, NV");
  // Jump to Injury, then Treatment, then Insurance, without finishing Incident.
  fiOf(e).bookmarks.find((b: any) => b.id === "injury").go();
  fiTap(e, "pain", "Neck"); fiTap(e, "pain", "Back");
  fiOf(e).bookmarks.find((b: any) => b.id === "treatment").go();
  fiTap(e, "seen", "ER");
  fiTap(e, "firstAt", "Same day");
  const pv = fiQ(e, "providers").c;
  pv.draft.set({ target: { value: "Sunrise Hospital" } }); fiQ(e, "providers").c.add();
  fiOf(e).bookmarks.find((b: any) => b.id === "insurance").go();
  fiQ(e, "carrier").c.query.set({ target: { value: "state" } });
  fiQ(e, "carrier").c.opts.find((o: any) => o.label === "State Farm").pick();
  // The same answers, in the engine every view reads.
  assert.deepEqual(e.state.body.pain, ["Neck", "Back"]);
  assert.deepEqual(e.state.body.seen, ["ER"]);
  assert.deepEqual(e.state.body.providers, ["Sunrise Hospital"]);
  assert.equal(e.state.file.carrier, "State Farm");
  // Glance: what's captured, what's left behind, what's untouched.
  assert.equal(fiSec(e, "incident").status, "missing");
  assert.equal(fiSec(e, "treatment").status, "done");
  assert.equal(fiSec(e, "vehicle").status, "empty");
  assert.ok(/Sunrise Hospital/.test(fiSec(e, "treatment").summary));
  assert.equal(fiSec(e, "insurance").summary, "State Farm");
  // Back to what's missing, in call order.
  const nx = fiOf(e).next;
  assert.equal(nx.label, "Next: The PNC was");
  nx.go();
  assert.equal(fiOf(e).openSec, "incident");
  assert.equal(fiQ(e, "seat").flash, true);
  fiTap(e, "seat", "Driver");
  assert.equal(fiQ(e, "seat").flash, false);
  assert.equal(fiOf(e).next.label, "Next: Fault");
});

t("full intake: switching views keeps every answer and lands in the same place", () => {
  const e = mk();
  e.setState({ phase: "body", story: { ...e.state.story, city: "Houston, TX", when: "Yesterday", seat: "Driver", fault: "Other driver", police: "No" } });
  e.setState({ body: { ...e.state.body, pain: ["Neck"], done: { pain: true }, focus: "seen" } });
  // Answers only; "at" is where the agent is (the screen position), saved so
  // another device lands on the same section.
  const answers = (x: any) => { const { at, atQuestion, ...rest } = x; return JSON.stringify(rest); };
  const before = answers(e.persistable());
  e.setView("full");
  assert.equal(fiOf(e).openSec, "treatment");
  assert.equal(answers(e.persistable()), before);
  assert.equal(e.persistable().at, "treatment");
  fiTap(e, "seen", "Urgent care");
  e.setView("guided");
  assert.equal(e.state.phase, "body");
  assert.deepEqual(e.state.body.seen, ["Urgent care"]);
  e.setView("qa");
  assert.ok(e.renderVals().bare);
  e.setView("full");
  assert.deepEqual(e.state.body.seen, ["Urgent care"]);
});

t("full intake: a multi-pick stays open, a single pick closes, answers can be changed", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("full");
  fiOf(e).bookmarks.find((b: any) => b.id === "injury").go();
  fiTap(e, "pain", "Head");
  assert.equal(fiQ(e, "pain").editing, true);
  fiQ(e, "pain").c.done();
  assert.equal(fiQ(e, "pain").editing, false);
  assert.equal(fiQ(e, "pain").value, "Head");
  fiQ(e, "pain").edit();
  fiTap(e, "pain", "Chest");
  assert.deepEqual(e.state.body.pain, ["Head", "Chest"]);
  fiTap(e, "work", "No");
  assert.equal(fiQ(e, "work").editing, false);
});

t("full intake: a quick note lands in the call notes with the time", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("full");
  fiOf(e).quick.toggle();
  fiOf(e).quick.draft.set({ target: { value: "Witness at the gas station" } });
  fiOf(e).quick.save();
  assert.ok(/^\d{1,2}:\d{2} (AM|PM): Witness at the gas station$/.test(e.state.story.text), e.state.story.text);
  assert.equal(fiOf(e).quick.open, false);
  assert.equal(fiQ(e, "notes").answered, true);
  assert.equal(fiSec(e, "incident").questions[0].id, "notes");
});

t("full intake: a red light shows as a problem, nothing else does", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("full");
  assert.equal(fiOf(e).lights.bad, false);
  fiTap(e, "fault", "Caller");
  assert.equal(fiOf(e).lights.bad, true);
  assert.equal(fiOf(e).lights.text, "Fault");
  assert.equal(fiSec(e, "incident").bad, true);
});

// ---- Simple Chorelist: the same intake as a numbered paper form ----
const chOf = (e: CallEngine) => fiOf(e).chore;
const chRow = (e: CallEngine, id: string) => chOf(e).rows.find((r: any) => r.id === id);

t("chorelist: story notes lead six numbered sections, with the same answers", () => {
  const e = mk();
  e.setState({ phase: "story" });
  e.setView("chore");
  const v = e.renderVals();
  assert.equal(v.choreView, true);
  assert.deepEqual(chOf(e).rows.map((r: any) => r.n + ". " + r.label),
    ["1. Incident", "2. Injury", "3. Treatment", "4. Insurance", "5. Vehicle / Property", "6. Retainer"]);
  assert.deepEqual(chOf(e).rows.map((r: any) => r.statusText), ["DO THIS NOW", "NOT STARTED", "NOT STARTED", "NOT STARTED", "NOT STARTED", "NOT STARTED"]);
  assert.equal(chOf(e).progress.text, "0 sections finished, 6 sections left");
  assert.equal(chOf(e).nextText, "Next section: Incident");
  // Every question is drawn with its answers showing, like paper.
  for (const s of fiOf(e).sections) for (const q of s.questions) assert.equal(q.editing, true, q.id);
  // The controls are Full Intake's: the same taps land in the same engine state.
  fiQ(e, "city").c.where.set("Houston, TX");
  fiQ(e, "when").c.opts.find((o: any) => o.label === "Yesterday").pick();
  fiTap(e, "seat", "Driver"); fiTap(e, "fault", "Other driver"); fiTap(e, "police", "No");
  assert.equal(e.state.story.fault, "Other driver");
  assert.equal(chRow(e, "incident").statusText, "DONE");
  assert.equal(chOf(e).progress.text, "1 section finished, 5 sections left");
  assert.equal(chOf(e).nextText, "Next section: Injury");
  assert.equal(chRow(e, "injury").statusText, "DO THIS NOW");
});

t("chorelist: moving on with blanks says NEEDS AN ANSWER; the agreement out is DO THIS NOW", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("chore");
  fiTap(e, "seat", "Passenger");
  chRow(e, "incident").next(); // GO TO NEXT SECTION
  assert.equal(fiOf(e).openSec, "injury");
  assert.equal(chRow(e, "incident").statusText, "NEEDS AN ANSWER");
  assert.equal(chRow(e, "injury").statusText, "DO THIS NOW");
  // Working anywhere in a section makes it the one she is in.
  chRow(e, "insurance").enter();
  assert.equal(chRow(e, "insurance").statusText, "DO THIS NOW");
  assert.equal(chRow(e, "injury").statusText, "NEEDS AN ANSWER");
  assert.equal(chRow(e, "vehicle").statusText, "NOT STARTED");
  e.setState({ send: { ...e.state.send, status: "sent" } });
  assert.equal(chRow(e, "retainer").statusText, "DO THIS NOW");
  e.setState({ send: { ...e.state.send, status: "signed" } });
  assert.notEqual(chRow(e, "retainer").statusText, "DONE"); // Signing does not complete office fields.
  e.set("file", "agreement", "done");
  assert.equal(chRow(e, "retainer").statusText, "DONE");
});

t("chorelist: FINISH INTAKE says what is not finished, then ends the call", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("chore");
  const last = chOf(e).rows[5];
  assert.equal(last.next, null);
  chOf(e).finish.go();
  assert.equal(e.state.dispo.open, false);
  assert.ok(chOf(e).finish.ask);
  assert.ok(chOf(e).finish.askText.startsWith("Not finished yet."), chOf(e).finish.askText);
  assert.equal(chOf(e).finish.missing.at(-1).label, "6. Retainer");
  chOf(e).finish.go();
  assert.equal(e.state.dispo.open, true);
});

t("chorelist: switching views keeps every answer and the spot", () => {
  const e = mk();
  e.setState({ phase: "body", story: { ...e.state.story, city: "Houston, TX", when: "Yesterday" }, body: { ...e.state.body, pain: ["Neck"], done: { pain: true }, focus: "seen" } });
  const answers = (x: any) => { const { at, atQuestion, ...rest } = x; return JSON.stringify(rest); };
  const before = answers(e.persistable());
  e.setView("chore");
  assert.equal(fiOf(e).openSec, "treatment");
  assert.equal(chRow(e, "treatment").statusText, "DO THIS NOW");
  assert.equal(answers(e.persistable()), before);
  e.setView("full");
  assert.equal(fiOf(e).openSec, "treatment");
  e.setView("chore");
  // Same questions in both views, from the one intake map.
  const ids = (x: any) => x.sections.map((s: any) => s.questions.map((q: any) => q.id).join(",")).join("|");
  const inChore = ids(fiOf(e));
  e.setView("full");
  assert.equal(ids(fiOf(e)), inChore);
  // From the Retainer section back to Guided lands on Send.
  e.setView("chore");
  chRow(e, "retainer").enter();
  e.setView("guided");
  assert.equal(e.state.phase, "send");
  assert.deepEqual(e.state.body.pain, ["Neck"]);
});

t("the same call opened on another device lands on the same section", () => {
  const a = mk();
  a.setState({ phase: "story" }); a.setView("full");
  fiOf(a).bookmarks.find((b: any) => b.id === "insurance").go();
  const saved = JSON.parse(JSON.stringify(a.persistable()));
  const b = mk({ saved });
  b.setView("full");
  assert.equal(fiOf(b).openSec, "insurance");
  const c = mk({ saved: { ...saved, at: "nonsense" } });
  c.setView("full");
  assert.equal(fiOf(c).openSec, "incident");
});

t("full intake: the missing list and the next question agree", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("full");
  const fi = fiOf(e);
  assert.equal(fi.missing[0].id, "city");
  assert.equal(fi.next.label, "Next: " + fi.missing[0].label);
  assert.ok(fi.next.ask.length > 0);
  fi.missing.find((m: any) => m.id === "work").go();
  assert.equal(fiOf(e).openSec, "injury");
  assert.equal(fiQ(e, "work").flash, true);
});

// ---- Conversation and Quick Capture: one question at a time ----
const oneOf = (e: CallEngine) => fiOf(e).one;
const oneTap = (e: CallEngine, label: string) => oneOf(e).q.c.opts.find((o: any) => o.label === label).pick();

t("conversation: one question at a time in call order; an answer moves on", () => {
  const e = mk();
  e.setState({ phase: "story" }); e.setView("convo");
  const v = e.renderVals();
  assert.equal(v.oneQ, true);
  assert.equal(oneOf(e).q.id, "city");
  assert.equal(oneOf(e).n, 1);
  oneOf(e).q.c.where.set("Houston, TX"); oneOf(e).q.c.where.done();
  assert.equal(oneOf(e).q.id, "when");
  oneTap(e, "Yesterday");
  assert.equal(e.state.story.when, "Yesterday");
  assert.equal(oneOf(e).q.id, "seat");
  assert.deepEqual(oneOf(e).before && oneOf(e).before.label, "When");
  oneTap(e, "Driver");
  assert.equal(oneOf(e).q.id, "fault");
  // Previous goes back to look or change; Skip moves on without an answer.
  oneOf(e).prev();
  assert.equal(oneOf(e).q.id, "seat");
  oneOf(e).skip();
  assert.equal(oneOf(e).q.id, "fault");
  oneOf(e).skip();
  assert.equal(oneOf(e).q.id, "police");
  // Several taps (every place it hurts) wait for Done.
  oneTap(e, "No");
  assert.equal(oneOf(e).q.id, "pain");
  oneTap(e, "Neck"); oneTap(e, "Back");
  assert.equal(oneOf(e).q.id, "pain");
  assert.equal(oneOf(e).q.needDone, true);
  oneOf(e).q.done();
  assert.equal(oneOf(e).q.id, "seen");
  assert.deepEqual(e.state.body.pain, ["Neck", "Back"]);
});

t("quick capture: same answers as Full Intake, and switching lands on the same question", () => {
  const e = mk();
  e.setState({ phase: "story", story: { ...e.state.story, city: "Houston, TX", when: "Yesterday", seat: "Driver", fault: "Other driver", police: "No" } });
  e.setView("quick");
  assert.equal(oneOf(e).q.id, "pain");
  assert.equal(oneOf(e).facts.map((f: any) => f.value).join("|").startsWith("Houston, TX|"), true);
  oneTap(e, "Head"); oneOf(e).q.done();
  oneTap(e, "ER"); oneOf(e).q.done();
  const at = oneOf(e).q.id;
  assert.equal(at, "firstAt"); // even yesterday's wreck needs the first treatment date
  e.setView("full");
  assert.equal(fiOf(e).openSec, "treatment");
  assert.deepEqual(e.state.body.seen, ["ER"]);
  e.setView("convo");
  assert.equal(oneOf(e).q.id, at);
  oneTap(e, "Same day");
  assert.equal(oneOf(e).q.id, "work");
  // The missing list on the side jumps the one-question views too.
  fiOf(e).missing.find((m: any) => m.id === "work").go();
  assert.equal(oneOf(e).q.id, "work");
});

t("conversation: when every question is answered, the way on is How we work", () => {
  const e = mk();
  e.setState({ phase: "body", story: { ...e.state.story, city: "Houston, TX", when: "Yesterday", seat: "Driver", fault: "Other driver", police: "No" } });
  e.setView("convo");
  let guard = 0;
  while (oneOf(e).q && guard++ < 40) {
    const q = oneOf(e).q;
    if (q.c.kind === "people") { q.c.justMe.pick(); continue; }
    const pick = q.c.opts.find((o: any) => /^(No|Not yet|Yes|Full coverage)$/.test(o.label)) || q.c.opts[0];
    pick.pick();
    if (oneOf(e).q && oneOf(e).q.id === q.id) oneOf(e).q.done();
  }
  assert.equal(oneOf(e).q, null);
  fiOf(e).finish.go();
  assert.equal(e.state.phase, "money");
  assert.equal(e.renderVals().oneQ, false);
});


t("crash date: every WHEN handler pins the real calendar date", () => {
  const e = mk();
  const md = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; };
  // A picked calendar date, then Today via the row handler: Today must win.
  e.storyPick("when", "Pick a date");
  e.storyDate(isoAgo(9));
  assert.equal(doiOf(e.state.story), md(isoAgo(9)));
  e.storyPick("when", "Today");
  assert.equal(e.state.story.date, isoAgo(0), "storyPick(Today) pins today's date");
  assert.equal(doiOf(e.state.story), md(isoAgo(0)));
  // The set() path pins too.
  e.set("story", "when", "Yesterday");
  assert.equal(e.state.story.date, isoAgo(1), "set(Yesterday) pins yesterday's date");
  // Toggling the answer off clears the date entirely.
  e.storyPick("when", "Yesterday");
  assert.equal(e.state.story.when, null);
  assert.equal(doiOf(e.state.story), "");
});

t("pain notes: checking an injury box opens the notes box, saved with the call", () => {
  const e = mk();
  e.setState({ phase: "body" });
  const painRow = () => e.renderVals().bodyRows.find((r: any) => r.key === "pain");
  assert.equal(painRow().q.note, null, "no notes box before an injury is checked");
  e.bodyPick(BODYQ_BY("pain"), "Neck", false);
  const note = painRow().q.note;
  assert.ok(note, "checking Neck opens the notes box");
  note.set({ target: { value: "Sharp in the mornings, worse driving" } });
  assert.equal(e.state.body.painNote, "Sharp in the mornings, worse driving");
  // Saved with the call, back on a reopen; a file from before the field
  // existed opens with it empty, not undefined.
  const saved = JSON.parse(JSON.stringify(e.persistable()));
  const e2 = mk({ saved });
  assert.equal(e2.state.body.painNote, "Sharp in the mornings, worse driving");
  const old = mk({ saved: { phase: "body", body: { pain: ["Back"] } } });
  assert.equal(old.state.body.painNote, "");
  assert.ok(old.renderVals().bodyRows.find((r: any) => r.key === "pain").q.note, "old saved file still opens the box");
  // "Says she's fine" alone is not an injury: no notes box, the rebuttal
  // owns that moment.
  const fine = mk();
  fine.setState({ phase: "body" });
  fine.bodyPick(BODYQ_BY("pain"), "Says they're fine", false);
  assert.equal(fine.renderVals().bodyRows.find((r: any) => r.key === "pain").q.note, null);
  // Full Intake reads the same note through its control.
  e.setView("full");
  fiQ(e, "pain").edit();
  const painQ = fiQ(e, "pain");
  assert.ok(painQ.c.note, "Full Intake pain control carries the notes box");
  assert.equal(painQ.c.note.value, "Sharp in the mornings, worse driving");
});

t("PNC wording: calls saved with the old her/she answer strings still light their chips", () => {
  const e = mk({ saved: { phase: "body", body: { pain: ["Neck", "Says she's fine"], repUnhappy: "She says she's unhappy with them" } } });
  assert.deepEqual(e.state.body.pain, ["Neck", "Says they're fine"]);
  assert.equal(e.state.body.repUnhappy, "The PNC says they're unhappy with them");
});

t("contact is the record's: an old call's blank email never hides the email on file", () => {
  const e = mk({ callerPhone: "(708) 916-1007", callerEmail: "pnc@example.com", homeAddress: "18475 Zurich Ln, Tinley Park, IL 60477",
    saved: { phase: "send", send: { email: "", phone: "", via: "Email" }, file: { addr: "" } } });
  assert.equal(e.state.send.email, "pnc@example.com");
  assert.equal(e.state.send.phone, "7089161007");
  assert.equal(e.state.file.addr, "18475 Zurich Ln, Tinley Park, IL 60477");
});
t("contact: a text going to another number stays on that number", () => {
  const e = mk({ callerPhone: "7089161007", saved: { phase: "send", send: { phone: "3125550199", toOther: true } } });
  assert.equal(e.state.send.phone, "3125550199");
  assert.equal(JSON.parse(JSON.stringify(e.persistable())).send.toOther, true);
});
t("contact: the File tab's card updates the call at once", () => {
  const e = mk({ callerPhone: "7089161007", callerEmail: "" });
  e.onChange = () => {};
  e.applyRecord({ email: "new@example.com", phone: "7085550000", addr: "1 A St, Joliet, IL 60431" });
  assert.equal(e.state.send.email, "new@example.com");
  assert.equal(e.state.send.phone, "7085550000");
  assert.equal(e.state.file.addr, "1 A St, Joliet, IL 60431");
  assert.equal(e.props.callerEmail, "new@example.com");
});
t("agreement row names the crash place, not the home address", () => {
  const e = mk({ homeAddress: "18475 Zurich Ln, Tinley Park, IL 60477" });
  const v = e.renderVals();
  assert.equal(v.agreementKnown, false);
  assert.match(v.agreement, /where the wreck happened/);
});

t("void: offered only to an owner once an agreement is out or signed", () => {
  const e = mk({ agentRole: "owner", esign: { status: "ready", configured: true, pax: {} } });
  (e.api as any).voidAgreement = () => calls.push("void");
  assert.equal(e.renderVals().canVoid, false);
  e.setState({ send: { ...e.state.send, status: "opened" } });
  let v = e.renderVals();
  assert.equal(v.canVoid, true);
  assert.equal(v.voidLabel, "Void this agreement");
  v.voidAgreement();
  assert.equal(calls[calls.length - 1], "void");
  e.setState({ send: { ...e.state.send, status: "signed" } });
  assert.equal(e.renderVals().voidLabel, "Void the signed agreement");
  const agent = mk({ agentRole: "agent", esign: { status: "opened", configured: true, pax: {} } });
  assert.equal(agent.renderVals().canVoid, false);
  assert.equal(agent.renderVals().canReplace, true);
});

t("name correction updates only matching unsent signer draft", () => {
  const e = mk();
  e.applyRecord({ name: "Maria Garcia", previousName: "Maria Lopez" });
  assert.equal(e.props.callerName, "Maria Garcia");
  assert.equal(e.state.send.client, "Maria Garcia");
  assert.equal(e.state.send.nameReview, "");
  assert.equal((e.persistable() as any).send.recordName, "Maria Garcia");
});
t("name correction preserves OBO signer and corrects injured person", () => {
  const e = mk({ saved: { send: { who: "Someone else", client: "Guardian Lopez", injured: "Maria Lopez" } } });
  e.applyRecord({ name: "Maria Garcia", previousName: "Maria Lopez" });
  assert.equal(e.state.send.client, "Guardian Lopez");
  assert.equal(e.state.send.injured, "Maria Garcia");
});
t("different draft signer needs explicit review rather than being overwritten", () => {
  const e = mk(); e.set("send", "client", "Separate Signer");
  e.applyRecord({ name: "Maria Garcia", previousName: "Maria Lopez" });
  assert.equal(e.state.send.client, "Separate Signer");
  assert.match(e.renderVals().nameReview, /Review/);
  e.renderVals().useRecordName(); assert.equal(e.state.send.client, "Maria Garcia"); assert.equal(e.state.send.nameReview, "");
});
t("record correction keeps sent evidence but prepares a corrected replacement draft", () => {
  for (const status of ["sent", "opened", "signed"]) {
    const e = mk({ esign: { status, configured: true, pax: {} } });
    e.applyRecord({ name: "Maria Garcia", previousName: "Maria Lopez" });
    assert.equal(e.state.send.client, "Maria Garcia"); assert.equal(e.state.send.status, status);
    assert.equal(e.state.send.nameReview, ""); assert.match(e.state.send.sentNameReview, /original agreement keeps Maria Lopez/);
    assert.equal(e.renderVals().canUseRecordName, false);
    assert.equal(e.renderVals().canReplace, true);
    assert.equal(e.renderVals().agreementLocked, true);
  }
});
t("an unchanged contact name never creates a false signed-agreement mismatch", () => {
  const e = mk({ esign: { status: "signed", configured: true, pax: {} } });
  e.applyRecord({ name: "Maria Lopez", previousName: "Maria Lopez", phone: "2025550100" });
  assert.equal(e.state.send.sentNameReview, undefined);
  assert.equal(e.renderVals().agreementLocked, false);
});
t("a signed typo can send a corrected replacement without completing the old packet", () => {
  const e = mk({ callerPhone: "2025550199", agentRole: "agent", esign: { status: "signed", configured: true, pax: {}, templateKeys: ["NV", "NV_FLAT"], templateKey: "NV" } });
  e.setState({ story: { ...e.state.story, city: "Las Vegas, NV", when: "Pick a date", date: "2026-09-24" } });
  e.applyRecord({ name: "Maria Garcia", previousName: "Maria Lopez" });
  let sent: { reason?: string; signer?: string } | null = null;
  (e.api as any).sendAgreement = (reason?: string) => { sent = { reason, signer: e.state.send.client }; };
  const before = calls.length;
  e.renderVals().completeAgreement();
  assert.equal(calls.length, before); assert.match(e.state.file.error, /do not complete the original/);
  assert.equal(sent, null);
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { prompt: () => "Correcting claimant's legal name" };
  try { e.renderVals().replaceAgreement(); }
  finally { (globalThis as any).window = originalWindow; }
  assert.deepEqual(sent, { reason: "Correcting claimant's legal name", signer: "Maria Garcia" });
  assert.match(e.state.send.sentNameReview, /original agreement keeps Maria Lopez/);
  const reopened = mk({ callerName: "Maria Garcia", callerPhone: "2025550199", esign: { status: "signed", configured: true, pax: {}, templateKeys: ["NV", "NV_FLAT"], templateKey: "NV" }, saved: e.persistable() });
  assert.equal(reopened.state.send.client, "Maria Garcia");
  assert.equal(reopened.renderVals().agreementLocked, true);
});
t("reopening saved known draft follows canonical corrected record", () => {
  const e = mk({ callerName: "Maria Garcia", saved: { send: { client: "Maria Lopez", recordName: "Maria Lopez" } } });
  assert.equal(e.state.send.client, "Maria Garcia");
});
t("reopening ambiguous draft flags mismatch and preserves deliberate name", () => {
  const e = mk({ callerName: "Maria Garcia", saved: { send: { client: "Separate Signer" } } });
  assert.equal(e.state.send.client, "Separate Signer"); assert.match(e.renderVals().nameReview, /Review/);
});

t("superseded primary completion is disabled across engine views and cannot invoke provider API", () => {
  const e = mk({ agreementSuperseded: true, esign: { status: "signed", configured: true, pax: {} } });
  for (const view of ["guided", "full", "chore", "form"]) {
    e.setView(view); const v = e.renderVals();
    assert.equal(v.agreementLocked, true); assert.match(v.completeLabel, /re-sign first/);
    const before = calls.length; v.completeAgreement(); assert.equal(calls.length, before);
    assert.match(e.state.file.error, /original stays in history/);
  }
});
t("a completed primary re-sign can resume ordinary office completion", () => {
  const e = mk({ agreementSuperseded: true, esign: { status: "signed", configured: true, pax: {} } });
  e.props.agreementSuperseded = false;
  const before = calls.length; e.renderVals().completeAgreement();
  assert.equal(calls.length, before + 1); assert.equal(calls[calls.length - 1], "completeAgreement");
});

t("agent view picker offers All questions, Simple form and Step by step without changing answers", () => {
  const e = mk();
  e.setState({ story: { ...e.state.story, city: "Las Vegas, NV" } });
  const before = e.state.story.city;
  assert.deepEqual(e.renderVals().modes.map((mode: any) => mode.label), ["All questions", "Simple form", "Step by step"]);
  e.setView("chore");
  e.setView("form");
  e.setView("steps");
  assert.equal(e.state.story.city, before);
});

t("terminal agreement states reopen selection on reload and polling without sending", () => {
  for (const status of ["expired", "declined", "voided", "failed"]) {
    const before = calls.length;
    const e = mk({ esign: { status, configured: true, pax: {} } });
    assert.equal(e.state.send.status, "ready");assert.equal(e.renderVals().sendReady, true);
    e.setState({ send: { ...e.state.send, status: "opened" } });
    e.setState({ send: { ...e.state.send, status, error: "Cancellation failed to save; review history." } });
    assert.equal(e.state.send.status, "ready");assert.equal(e.renderVals().sendReady, true);
    assert.equal(e.state.send.error, "Cancellation failed to save; review history.");
    assert.equal(calls.length, before);
  }
});

t("passenger agreements are available before the caller signs, with their own destination", () => {
  const e = mk({ callerPhone: "2025550100", callerEmail: "caller@example.invalid" });
  e.setState({ story: { ...e.state.story, city: "Las Vegas, NV", when: "Pick a date", date: isoAgo(2) } });
  e.renderVals().addPerson();
  for (const [key, value] of Object.entries({ name: "Synthetic Friend", age: "Adult", hurt: "Yes", wantsRep: "Yes", cell: "2025550101" })) e.setPerson(0, key, value);
  assert.equal(e.state.send.status, "ready");
  assert.equal(e.renderVals().paxSend[0].ready, true);
  calls.length = 0; e.sendPax(0); assert.deepEqual(calls, ["sendPax:0"]);
  e.setPerson(0, "cell", "2025550100"); assert.equal(e.renderVals().paxSend[0].ready, false);
  e.setPerson(0, "shareOk", true); assert.equal(e.renderVals().paxSend[0].ready, true);
  e.renderVals().paxSend[0].setVia("Email"); assert.equal(e.renderVals().paxSend[0].ready, false);
  e.setPerson(0, "email", "friend@example.invalid"); assert.equal(e.renderVals().paxSend[0].ready, true);
  assert.equal(e.persistable().car.people[0].via, "Email");
  e.props.esign.sendGate = "held"; assert.equal(e.renderVals().paxSend[0].ready, false);
  e.props.esign.sendGate = "clear"; e.setPerson(0, "wantsRep", "No"); assert.equal(e.renderVals().paxSend[0].ready, false);
  e.setPerson(0, "wantsRep", "Yes"); e.setPerson(0, "age", ""); assert.match(e.passengerSendIssue(0), /adult or under 18/);
});

console.log(passed, "passed");

