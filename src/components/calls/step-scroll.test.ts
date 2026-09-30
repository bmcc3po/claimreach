import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Execute the actual components' post-render effects, including the deferred
// child scroll that previously hid the new screen heading after navigation.
function effectFrom(file: string, names: string[], values: any[]) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!effect && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(effect);
  const code = ts.transpileModule(`const effect = ${effect.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...names, code + '; return effect;')(...values) as () => void;
}
const scrolled: string[] = [], frames: (() => void)[] = [];
const element = (name: string) => ({ focus() {}, scrollIntoView() { scrolled.push(name); } });
const fi: any = { jump: 0, openSec: 'insurance', target: 'car' };
const step = { index: 2 }, previousStep = { current: null as number | null }, first = { current: true };
const heading = effectFrom('StepByStep.tsx', ['step', 'v', 'previousStep', 'heading'], [step, { fi }, previousStep, { current: element('heading') }]);
const child = effectFrom('ChoreList.tsx', ['fi', 'first', 'scrollSections', 'document', 'requestAnimationFrame'],
  [fi, first, false, { getElementById: (id: string) => element(id) }, (fn: () => void) => frames.push(fn)]);
const renderEffects = () => { child(); heading(); while (frames.length) frames.shift()!(); };

renderEffects();
assert.deepEqual(scrolled.splice(0), ['heading'], 'reload restores the stage with its navigation visible, not a stale saved question target');
for (const index of [3, 4, 3, 0]) {
  step.index = index; fi.openSec = index === 4 ? 'retainer' : index === 0 ? 'incident' : 'vehicle'; fi.target = null; fi.jump++;
  renderEffects();
  assert.deepEqual(scrolled.splice(0), ['heading'], 'Next, Back and selected stage land at the heading without a later child scroll');
}
step.index = 1; fi.openSec = 'treatment'; fi.target = 'firstAt'; fi.jump++;
renderEffects();
assert.deepEqual(scrolled.splice(0), ['ch-q-firstAt'], 'explicit missing-question jump across stages remains focused on that question');
fi.target = 'lastAt'; fi.jump++;
renderEffects();
assert.deepEqual(scrolled.splice(0), ['ch-q-lastAt'], 'explicit question jump within a stage remains supported');

const allQuestions = effectFrom('ChoreList.tsx', ['fi', 'first', 'scrollSections', 'document', 'requestAnimationFrame'],
  [fi, { current: false }, true, { getElementById: (id: string) => element(id) }, (fn: () => void) => frames.push(fn)]);
fi.target = null; allQuestions(); while (frames.length) frames.shift()!();
assert.deepEqual(scrolled, ['ch-sec-treatment'], 'All Questions retains its existing section navigation');
console.log('6 step header, question jump and existing All Questions scroll scenarios passed');
