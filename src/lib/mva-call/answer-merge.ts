// Answers are sparse documents. An absent leaf is unasked; null/empty/false
// are stored answers (including an agent's intentional clear), never import gaps.
export type AnswerDocument = Record<string, any>;
const blockedKeys = new Set(["__proto__", "prototype", "constructor"]);
export const isAnswerObject = (v: any): v is AnswerDocument => !!v && typeof v === "object" && !Array.isArray(v);
const own = (v: any, key: string) => isAnswerObject(v) && Object.prototype.hasOwnProperty.call(v, key);
const copy = (v: any): any => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const equal = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!isAnswerObject(a) || !isAnswerObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && equal(a[k], b[k]));
};
type Change = { path: string[]; before: any; beforeExists: boolean; value: any };
function changes(base: any, incoming: any, path: string[] = [], out: Change[] = []): Change[] {
  for (const key of new Set([...Object.keys(isAnswerObject(base) ? base : {}), ...Object.keys(isAnswerObject(incoming) ? incoming : {})])) {
    if (blockedKeys.has(key)) continue;
    const had = own(base, key), has = own(incoming, key), before = had ? base[key] : undefined, next = has ? incoming[key] : undefined;
    if (had === has && equal(before, next)) continue;
    if (has && isAnswerObject(next) && (!had || isAnswerObject(before))) changes(before, next, path.concat(key), out);
    else out.push({ path: path.concat(key), before, beforeExists: had, value: has ? copy(next) : null });
  }
  return out;
}
function read(doc: any, path: string[]) {
  let at = doc;
  for (let i = 0; i < path.length; i++) {
    if (!isAnswerObject(at)) return { exists: false, blocked: true, value: undefined };
    if (!own(at, path[i])) return { exists: false, blocked: false, value: undefined };
    at = at[path[i]];
  }
  return { exists: true, blocked: false, value: at };
}
function put(doc: AnswerDocument, path: string[], value: any) {
  let at = doc;
  for (const key of path.slice(0, -1)) {
    if (!isAnswerObject(at[key])) at[key] = {};
    at = at[key];
  }
  at[path[path.length - 1]] = copy(value);
}

/** Only the caller's changed leaves apply; a concurrent edit to the same leaf
 * refuses the whole merge. Identical retries are safe. Arrays are atomic. */
export function mergeAnswerDelta(base: AnswerDocument, current: AnswerDocument, incoming: AnswerDocument) {
  const delta = changes(base, incoming), value = copy(current), conflicts: string[] = [];
  for (const change of delta) {
    const seen = read(current, change.path);
    if (!seen.blocked && ((seen.exists === change.beforeExists && equal(seen.value, change.before)) || (seen.exists && equal(seen.value, change.value)))) put(value, change.path, change.value);
    else conflicts.push(change.path.join("."));
  }
  return { value: conflicts.length ? copy(current) : value, conflicts, changedPaths: delta.map(c => c.path.join(".")) };
}

/** Client-only projection: put edits since the rendered baseline onto the raw
 * server document. This keeps engine defaults out of storage. Also preserves
 * edits made while a save was in flight when its canonical acknowledgement arrives. */
export function applyAnswerDelta(base: AnswerDocument, incoming: AnswerDocument, target: AnswerDocument): AnswerDocument {
  const value = copy(target);
  for (const change of changes(base, incoming)) put(value, change.path, change.value);
  return value;
}

/** Import is deliberately narrower than editing: only genuinely absent leaves.
 * In particular, an explicit empty parent or array is not expanded/replaced. */
export function fillMissingAnswerLeaves(current: AnswerDocument, candidates: AnswerDocument) {
  const value = copy(current), filledPaths: string[] = [];
  function fill(at: AnswerDocument, from: AnswerDocument, path: string[]) {
    for (const [key, candidate] of Object.entries(from)) {
      if (blockedKeys.has(key) || candidate === undefined) continue;
      if (isAnswerObject(candidate)) {
        if (!own(at, key)) at[key] = {};
        if (isAnswerObject(at[key])) fill(at[key], candidate, path.concat(key));
      } else if (!own(at, key)) {
        at[key] = copy(candidate); filledPaths.push(path.concat(key).join("."));
      }
    }
  }
  fill(value, candidates, []);
  return { value, filledPaths };
}
