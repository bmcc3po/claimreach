import assert from "node:assert/strict";
import { applyStorySuggestions, storySuggestions, STORY_FIELDS } from "./story-assist";
import { BODYQ, CallEngine } from "./engine";
import { mergeCallAnswerDelta } from "./answer-merge";

const today = "2026-10-03";
const notes = "On 09/26/2026 in Birmingham, AL I was driving. Neck and back pain. Went to\nTEST Urgent Care on 09/27/2026. My insurer is State Farm. Report TEST-1003.";
const rows = [
  { id: "when", value: "2026-09-26", evidence: "On 09/26/2026" },
  { id: "city", value: "Birmingham, AL", evidence: "in Birmingham, AL" },
  { id: "seat", value: "Driver", evidence: "I was driving" },
  { id: "pain", value: ["Neck", "Back"], evidence: "Neck and back pain" },
  { id: "seen", value: ["Urgent care"], evidence: "Went to TEST Urgent Care on 09/27/2026" },
  { id: "providers", value: ["TEST Urgent Care"], evidence: "Went to TEST Urgent Care" },
  { id: "firstAt", value: "2026-09-27", evidence: "TEST Urgent Care on 09/27/2026" },
  { id: "ownCarrier", value: "State Farm", evidence: "My insurer is State Farm" },
  { id: "report", value: "TEST-1003", evidence: "Report TEST-1003" },
];
const fresh = () => ({ story: { text: notes }, body: { seen: [], pain: [], done: {} }, file: { carrier: "Pick one" }, car: { justMe: false, people: [] } });
const proposed = storySuggestions(rows, notes, fresh(), today);
assert.equal(proposed.length, 9);
assert.equal(proposed.find(r => r.id === "seen")?.evidence, "Went to\nTEST Urgent Care on 09/27/2026");
assert.ok(proposed.every(r => notes.includes(r.evidence)));
assert.deepEqual(storySuggestions(proposed, notes, fresh(), today), proposed, "second validation preserves original quotes");
for (const q of BODYQ) assert.deepEqual(STORY_FIELDS.find(f => f.id === q.key)?.choices, q.date ? undefined : q.opts);

const result = applyStorySuggestions(proposed, notes, fresh(), today);
assert.equal(result.stale, false);
assert.equal(result.groups.story.when, "Pick a date");
assert.equal(result.groups.story.date, "2026-09-26");
assert.deepEqual(result.groups.body.seen, ["Urgent care"]);
assert.deepEqual(result.groups.body.done, { pain: true, seen: true });
assert.equal(result.groups.file.ownCarrier, "State Farm");
assert.equal(result.groups.story.text, notes);
assert.equal(result.groups.story.notesAssist.fields.length, 9);
assert.deepEqual(storySuggestions(rows, notes, { ...fresh(), ...result.groups }, today), [], "replays do not overwrite");
assert.equal(applyStorySuggestions(rows, notes, { ...fresh(), story: { text: notes + " edited" } }, today).stale, true);

const existing = fresh() as any;
existing.story.city = "Atlanta, GA";
existing.body.seen = ["Not yet"]; existing.body.done.seen = true;
existing.file.reportUnavailable = true;
existing.file.ownCarrier = "GEICO";
const safe = storySuggestions(rows, notes, existing, today);
for (const id of ["city", "seen", "providers", "firstAt", "report", "ownCarrier"]) assert.ok(!safe.some(r => r.id === id), id);
assert.ok(storySuggestions(rows.filter(r => r.id !== "seen"), notes, fresh(), today).every(r => !["providers", "firstAt"].includes(r.id)), "unchecked parent cannot fill hidden dependents");

const invalid = [
  { id: "file.ssn", value: "123456789", evidence: "Neck and back pain" },
  { id: "__proto__", value: "anything", evidence: "Neck and back pain" },
  { id: "status", value: "delivered", evidence: "Neck and back pain" },
  { id: "fault", value: "Other driver", evidence: "I was driving" },
  { id: "seen", value: ["Not yet", "ER"], evidence: "Neck and back pain" },
  { id: "pain", value: ["Neck", "Says they're fine"], evidence: "Neck and back pain" },
  { id: "work", value: "Probably", evidence: "Neck and back pain" },
  { id: "when", value: "2026-02-30", evidence: "On 09/26/2026" },
  { id: "when", value: "2027-01-01", evidence: "On 09/26/2026" },
  { id: "when", value: "09/26/2026", evidence: "On 09/26/2026" },
  { id: "road", value: "Invented Road", evidence: "A quote not in the notes" },
];
assert.deepEqual(storySuggestions(invalid, notes, fresh(), today), []);
assert.deepEqual(storySuggestions([{ id: "work", value: "Yes", evidence: "I was driving" }, { id: "work", value: "No", evidence: "I was driving" }], notes, fresh(), today), []);
assert.ok(!storySuggestions(rows.map(r => r.id === "firstAt" ? { ...r, value: "2026-09-25" } : r), notes, fresh(), today).some(r => r.id === "firstAt"), "care before accident rejected");

const base = fresh(), filled = { ...base, ...result.groups };
const concurrent = { ...base, file: { ...base.file, report: "MANUAL-CORRECTION" } };
const merged = mergeCallAnswerDelta(base, concurrent, filled);
assert.deepEqual(merged.conflicts, ["file.report"], "existing autosave protects a concurrent answer");
assert.equal(merged.value.file.report, "MANUAL-CORRECTION");

// Real engine can reopen the canonical output; no second storage format.
const engine = new CallEngine({
  callerName: "TEST STORY", agentName: "TEST Agent", firmSpoken: "TEST Firm", textFrom: "",
  startedAt: Date.now(), reasons: { esign: [], callback: [], dq: [], ni: [] }, notifyDefaults: [], esign: { status: "ready", configured: false, pax: {} },
  saved: filled,
}, {} as any);
assert.equal(engine.fiInfo("seen").answered, true);
assert.equal(engine.fiInfo("pain").answered, true);
assert.equal(engine.fiInfo("providers").answered, true);
assert.equal(engine.fiInfo("when").answered, true);
assert.deepEqual(engine.persistable().body.seen, ["Urgent care"]);
assert.equal(engine.persistable().file.report, "TEST-1003");
assert.equal(engine.persistable().story.text, notes);
const extraNotes = "Police came out. No passengers. My car is a 2024 Ford Escape. Crash September 26, 2026.";
const extra = applyStorySuggestions([
  { id: "police", value: "Came out", evidence: "Police came out" },
  { id: "people", value: "None", evidence: "No passengers" },
  { id: "vehicleYear", value: "2024", evidence: "2024 Ford Escape" },
  { id: "vehicleMake", value: "Ford", evidence: "2024 Ford Escape" },
  { id: "vehicleModel", value: "Escape", evidence: "2024 Ford Escape" },
  { id: "when", value: "2026-09-26", evidence: "Crash September 26, 2026" },
], extraNotes, { ...fresh(), story: { text: extraNotes }, file: { vYear: "Year" } }, today);
assert.equal(extra.applied.length, 6);
assert.equal(extra.groups.car.justMe, true);
assert.equal(extra.groups.car.othersPresent, false);
assert.deepEqual(extra.groups.car.people, []);
assert.equal(extra.groups.file.vYear, "2024");
assert.deepEqual(storySuggestions([{ id: "when", value: "2026-09-25", evidence: "Crash September 26, 2026" }], extraNotes, fresh(), today), [], "date must match cited evidence");
assert.deepEqual(storySuggestions([{ id: "people", value: "None", evidence: "No passengers" }], extraNotes, { car: { people: [{ name: "Existing passenger" }] } }, today), [], "passenger cards are never removed");
console.log("Story helper: canonical fields, evidence, dependency, overwrite, stale-note, date, concurrent-save and engine-reopen checks passed");
