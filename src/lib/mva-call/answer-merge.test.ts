import assert from "node:assert/strict";
import { applyAnswerDelta, fillMissingAnswerLeaves, mergeAnswerDelta } from "./answer-merge";

let count = 0;
function check(name: string, fn: () => void) { fn(); count++; console.log("ok", name); }
check("import only fills absent leaves; explicit clears, false, zero and empty arrays remain", () => {
  const current = { story: { text: "", fault: null }, body: { pain: [], willing: false, work: 0 }, file: null };
  const imported = fillMissingAnswerLeaves(current, { story: { text: "Old text", fault: "Other driver", city: "Austin, TX" }, body: { pain: ["Neck"], willing: true, work: 4 }, file: { dob: "01/01/1990" } });
  assert.deepEqual(imported.value, { ...current, story: { ...current.story, city: "Austin, TX" } });
  assert.deepEqual(imported.filledPaths, ["story.city"]);
  assert.equal((current.story as any).city, undefined);
});
check("stale autosave preserves unrelated imported answers", () => {
  const base = { story: { text: "Before" } };
  const result = mergeAnswerDelta(base, { story: { text: "Before", city: "Austin, TX" }, body: { rep: "No" } }, { story: { text: "Agent edit" } });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.value, { story: { text: "Agent edit", city: "Austin, TX" }, body: { rep: "No" } });
});
check("same-leaf conflict refuses the whole patch, including otherwise independent changes", () => {
  const current = { story: { text: "Another agent", city: "Austin, TX" } };
  const result = mergeAnswerDelta({ story: { text: "Before" } }, current, { story: { text: "Mine", fault: "Other driver" } });
  assert.deepEqual(result.conflicts, ["story.text"]);
  assert.deepEqual(result.value, current);
});
check("explicit clear persists and repeated imports cannot fill it again", () => {
  const base = { story: { city: "Austin, TX" } }, clear = { story: { city: "" } };
  const saved = mergeAnswerDelta(base, base, clear).value;
  assert.equal(saved.story.city, "");
  assert.deepEqual(fillMissingAnswerLeaves(saved, base).filledPaths, []);
});
check("arrays replace as one answer; they never splice unrelated passengers or providers", () => {
  const base = { car: { people: [{ pid: "one", name: "Synthetic" }] } };
  assert.deepEqual(mergeAnswerDelta(base, base, { car: { people: [] } }).value.car.people, []);
  assert.deepEqual(mergeAnswerDelta(base, { car: { people: [{ pid: "two" }] } }, { car: { people: [] } }).conflicts, ["car.people"]);
});
check("identical retry after a partial mirror failure is accepted", () => {
  const base = { story: { text: "Old" } }, sent = { story: { text: "New" } };
  assert.deepEqual(mergeAnswerDelta(base, sent, sent), { value: sent, conflicts: [], changedPaths: ["story.text"] });
});
check("engine display defaults do not become persisted import-blocking empty answers", () => {
  const raw = { story: { city: "Austin, TX" } };
  const rendered = { story: { city: "Austin, TX", text: "", fault: null }, body: { pain: [] } };
  const editing = { ...rendered, story: { ...rendered.story, text: "Agent narrative" } };
  assert.deepEqual(applyAnswerDelta(rendered, editing, raw), { story: { city: "Austin, TX", text: "Agent narrative" } });
});
check("acknowledgement keeps newly imported fields and typing made in flight", () => {
  const rawBase = { story: { text: "Old" } };
  const sentView = { story: { text: "First edit", city: "", fault: null }, body: { pain: [] } };
  const ack = { story: { text: "First edit", city: "Austin, TX" } };
  const typedDuringRequest = { ...sentView, story: { ...sentView.story, text: "Second edit" } };
  const acknowledged = applyAnswerDelta(rawBase, ack, sentView);
  const visible = applyAnswerDelta(sentView, typedDuringRequest, acknowledged);
  assert.equal(visible.story.text, "Second edit");
  assert.equal(visible.story.city, "Austin, TX");
  const nextRequest = applyAnswerDelta(acknowledged, visible, ack);
  assert.deepEqual(nextRequest, { story: { text: "Second edit", city: "Austin, TX" } });
});
check("a deleted leaf becomes a durable clear rather than a future import gap", () => {
  assert.deepEqual(mergeAnswerDelta({ story: { text: "Old" } }, { story: { text: "Old" } }, { story: {} }).value, { story: { text: null } });
});
check("a concurrent cleared parent is not silently expanded by a child update", () => {
  assert.deepEqual(mergeAnswerDelta({}, { body: null }, { body: { rep: "No" } }).conflicts, ["body.rep"]);
});
check("object key ordering is irrelevant and prototype keys cannot be applied", () => {
  assert.deepEqual(mergeAnswerDelta({ body: { a: 1, b: 2 } }, { body: { b: 2, a: 1 } }, { body: { b: 2, a: 1 } }).changedPaths, []);
  const bad = JSON.parse('{"__proto__":{"polluted":true},"story":{"city":"Austin, TX"}}');
  assert.deepEqual(fillMissingAnswerLeaves({}, bad).value, { story: { city: "Austin, TX" } });
  assert.equal(({} as any).polluted, undefined);
});
console.log(`${count} passed`);
