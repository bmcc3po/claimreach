// ============================================================================
// STORED FORM -> CONSOLE QUESTIONS
//
// The call console asks questions from a shape defined in questions.ts. The rest
// of the platform stores questions as rows in intake_forms. Those are the same
// idea in two formats, and until now the console only knew the first one, so a
// form an owner built, edited and published was NOT the form an agent read on a
// live call. Both screens looked correct in isolation, which is exactly why it
// went unnoticed: the builder showed 195 questions, the console asked 11.
//
// This converts one into the other at load time. The console keeps its own
// runner, its own pacing and its own scripts panel; only the source of the
// questions changes.
// ============================================================================
import type { Field } from "../questionnaire";
import { fieldVisible } from "../questionnaire";
import type { Question, QOption } from "./questions";

/** Stored kinds mapped onto the four the console runner can render. */
function toKind(f: Field): Question["kind"] {
  switch (f.kind) {
    case "select":
    case "bool":
      return "single";
    case "multiselect":
      return "multi";
    case "date":
    case "monthyear":
      return "date";
    case "time":
      return "time";
    default:
      return "text";
  }
}

function toOptions(f: Field): QOption[] | undefined {
  // choices carry the stored VALUE the engine matches on. options are display
  // strings only, kept as a fallback for older forms that never had choices.
  if (f.choices?.length) {
    return f.choices.map((c) => (c.note ? { value: c.value, label: c.label, note: c.note } : { value: c.value, label: c.label }));
  }
  if (f.options?.length) return f.options.map((o) => ({ value: o, label: o }));
  if (f.kind === "bool") return [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
  return undefined;
}

export interface ConsoleForm {
  questions: Question[];
  /** id -> stored field, so visibility can be evaluated against showIf. */
  byId: Record<string, Field>;
}

export function fieldsToConsoleForm(fields: Field[]): ConsoleForm {
  const questions: Question[] = [];
  const byId: Record<string, Field> = {};

  for (const f of fields || []) {
    if (!f || !f.id) continue;
    // Section headers and read-only script blocks are layout, not questions. The
    // console shows one question at a time, so a heading with nothing to answer
    // would be a dead screen the agent has to click past mid-call.
    if (f.kind === "section" || f.kind === "script") continue;

    byId[f.id] = f;
    const q: Question = {
      key: f.id,
      // A field with no script has nothing to read aloud, so its label becomes
      // the heading instead. Falling back to the raw id would put "sol_status"
      // in front of an agent as though it were a question.
      script: f.script ?? "",
      kind: toKind(f),
    };
    if (!f.script) q.label = f.label || f.id;
    if (f.agentNote) q.note = f.agentNote;
    if (f.multiline || f.kind === "longtext") q.multiline = true;
    if (f.lookup) q.lookup = f.lookup;
    const opts = toOptions(f);
    if (opts) q.options = opts;
    questions.push(q);
  }

  return { questions, byId };
}

/**
 * Whether a stored question applies, given what has been answered so far.
 * Delegates to the same evaluator the form builder and the file view use, so a
 * condition cannot mean one thing on a call and another on the file.
 */
export function storedQuestionApplies(byId: Record<string, Field>, key: string, answers: Record<string, any>): boolean {
  const f = byId[key];
  if (!f) return false;
  return fieldVisible(f, answers);
}

/** The next unanswered question that currently applies, or null when done. */
export function nextStoredQuestion(
  form: ConsoleForm,
  answers: Record<string, any>,
  askOrder?: string[] | null,
): string | null {
  const order = askOrder?.length
    ? askOrder.filter((id) => form.byId[id])
    : form.questions.map((q) => q.key);

  for (const key of order) {
    if (!storedQuestionApplies(form.byId, key, answers)) continue;
    const v = answers[key];
    const blank = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (blank) return key;
  }
  return null;
}
