// Plaintiff fact sheet. Questions live in intake_forms (claim_type m6_pfs).
// Answers live on claims.answers with pfs_ ids so intake keys stay untouched.
// Do not invent a second store.

import type { Field, FieldKind } from "./questionnaire";

export const PFS_FORM_KEY = "m6_pfs";
export const PFS_ID_PREFIX = "pfs_";

const SKIP_KINDS = new Set(["section", "script", "gate"]);

export function isPfsFieldId(id: string): boolean {
  return id.startsWith(PFS_ID_PREFIX);
}

export function mergePfsAnswers(
  existing: Record<string, any> | null | undefined,
  patch: Record<string, any> | null | undefined,
): Record<string, any> {
  const next: Record<string, any> = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (isPfsFieldId(k)) next[k] = v;
  }
  return next;
}

export function pfsAnswersOnly(answers: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (isPfsFieldId(k)) out[k] = v;
  }
  return out;
}

export function pfsAskable(fields: Field[]): Field[] {
  return fields.filter((f) => !SKIP_KINDS.has(f.kind) && f.scope !== "property");
}

// Same kinds the staff FormBuilder uses for a real question. Section is a
// grouping row, not an answer. Do not invent a second type list.
export const PFS_ASK_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "text", label: "Short text" },
  { kind: "longtext", label: "Long text" },
  { kind: "bool", label: "Yes / No" },
  { kind: "select", label: "Dropdown" },
  { kind: "multiselect", label: "Checkboxes" },
  { kind: "int", label: "Number" },
  { kind: "date", label: "Date" },
];

const PFS_KIND_LABEL: Record<string, string> = Object.fromEntries(
  PFS_ASK_KINDS.map((k) => [k.kind, k.label]),
);
PFS_KIND_LABEL.section = "Section";

export function pfsKindLabel(kind: string): string {
  return PFS_KIND_LABEL[kind] ?? kind;
}

export function isPfsAskKind(kind: string): kind is FieldKind {
  return PFS_ASK_KINDS.some((k) => k.kind === kind);
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function usedIds(fields: Field[]): Set<string> {
  return new Set(fields.map((f) => f.id));
}

function uniquePfsId(fields: Field[], n: number, raw?: string): string {
  const used = usedIds(fields);
  let id = slugId(n, raw);
  if (!used.has(id)) return id;
  let i = n;
  while (used.has(`${PFS_ID_PREFIX}q${String(i).padStart(3, "0")}`)) i += 1;
  return `${PFS_ID_PREFIX}q${String(i).padStart(3, "0")}`;
}

function sectionFieldId(fields: Field[], section: string): string {
  const slug = section.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || String(fields.length);
  const sid = `${PFS_ID_PREFIX}s_${slug}`;
  const used = usedIds(fields);
  return used.has(sid) ? `${sid}_${fields.length}` : sid;
}

export function pfsSectionOf(fields: Field[], id: string): string {
  let section = "";
  for (const f of fields) {
    if (f.kind === "section") section = f.label;
    if (f.id === id) return f.kind === "section" ? f.label : section;
  }
  return "";
}

export function pfsListRows(fields: Field[]): { field: Field; section: string }[] {
  let section = "";
  const rows: { field: Field; section: string }[] = [];
  for (const f of fields) {
    if (f.kind === "section") { section = f.label; continue; }
    if (SKIP_KINDS.has(f.kind) || f.scope === "property") continue;
    rows.push({ field: f, section });
  }
  return rows;
}

function dropEmptySections(fields: Field[]): Field[] {
  return fields.filter((f, i) => {
    if (f.kind !== "section") return true;
    for (let j = i + 1; j < fields.length; j++) {
      if (fields[j].kind === "section") return false;
      if (!SKIP_KINDS.has(fields[j].kind) && fields[j].scope !== "property") return true;
    }
    return false;
  });
}

function ensureSection(fields: Field[], section: string): Field[] {
  const label = section.trim();
  if (!label) return fields;
  if (fields.some((f) => f.kind === "section" && normLabel(f.label) === normLabel(label))) {
    return fields;
  }
  return [...fields, {
    id: sectionFieldId(fields, label),
    scope: "lead",
    kind: "section",
    label,
    origin: "custom",
  }];
}

function placeAfterSection(fields: Field[], field: Field, section: string): Field[] {
  const label = section.trim();
  const without = fields.filter((f) => f.id !== field.id);
  if (!label) return [...without, field];
  let last = -1;
  let current = "";
  for (let i = 0; i < without.length; i++) {
    if (without[i].kind === "section") current = without[i].label;
    if (normLabel(current) === normLabel(label)) last = i;
  }
  if (last < 0) return [...without, field];
  const next = [...without];
  next.splice(last + 1, 0, field);
  return next;
}

export function addPfsQuestion(
  fields: Field[],
  input: { label: string; kind: string; section?: string; options?: string[] },
): { fields: Field[]; error?: string; id?: string } {
  const label = (input.label || "").trim();
  if (!label) return { fields, error: "Type the question." };
  const kind = isPfsAskKind(input.kind) ? input.kind : "longtext";
  const options = (input.options ?? []).map((s) => s.trim()).filter(Boolean);
  if ((kind === "select" || kind === "multiselect") && !options.length) {
    return { fields, error: "Add at least one choice." };
  }
  const section = (input.section || "").trim();
  let next = ensureSection(fields, section);
  const id = uniquePfsId(next, pfsAskable(next).length + 1, label);
  const field: Field = { id, scope: "lead", kind, label, origin: "custom" };
  if (kind === "select" || kind === "multiselect") field.options = options;
  next = placeAfterSection(next, field, section);
  return { fields: dropEmptySections(next), id };
}

export function updatePfsQuestion(
  fields: Field[],
  id: string,
  input: { label?: string; kind?: string; section?: string; options?: string[] },
): { fields: Field[]; error?: string } {
  const idx = fields.findIndex((f) => f.id === id);
  if (idx < 0) return { fields, error: "That question is gone." };
  const prev = fields[idx];
  if (SKIP_KINDS.has(prev.kind)) return { fields, error: "That row is not a question." };
  const label = input.label !== undefined ? input.label.trim() : prev.label;
  if (!label) return { fields, error: "Type the question." };
  const kind = input.kind !== undefined
    ? (isPfsAskKind(input.kind) ? input.kind : prev.kind)
    : prev.kind;
  const options = input.options !== undefined
    ? input.options.map((s) => s.trim()).filter(Boolean)
    : (prev.options ?? []);
  if ((kind === "select" || kind === "multiselect") && !options.length) {
    return { fields, error: "Add at least one choice." };
  }
  const nextField: Field = { ...prev, label, kind };
  if (kind === "select" || kind === "multiselect") nextField.options = options;
  else delete nextField.options;
  const prevSection = pfsSectionOf(fields, id);
  const section = input.section !== undefined ? input.section.trim() : prevSection;
  let next = fields.map((f) => (f.id === id ? nextField : f));
  if (normLabel(section) !== normLabel(prevSection)) {
    next = ensureSection(next, section);
    next = placeAfterSection(next, nextField, section);
  }
  return { fields: dropEmptySections(next) };
}

export function removePfsQuestion(fields: Field[], id: string): { fields: Field[]; error?: string } {
  if (!fields.some((f) => f.id === id)) return { fields, error: "That question is gone." };
  return { fields: dropEmptySections(fields.filter((f) => f.id !== id)) };
}

export function movePfsQuestion(
  fields: Field[],
  id: string,
  dir: -1 | 1,
): { fields: Field[]; error?: string } {
  const askable = fields
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !SKIP_KINDS.has(f.kind) && f.scope !== "property");
  const pos = askable.findIndex((x) => x.f.id === id);
  if (pos < 0) return { fields, error: "That question is gone." };
  const dest = pos + dir;
  if (dest < 0 || dest >= askable.length) return { fields };
  const i = askable[pos].i;
  const j = askable[dest].i;
  const next = [...fields];
  [next[i], next[j]] = [next[j], next[i]];
  return { fields: next };
}

export function mergePfsFields(existing: Field[], incoming: Field[]): Field[] {
  const usedId = usedIds(existing);
  const usedLabel = new Set(
    existing.filter((f) => !SKIP_KINDS.has(f.kind)).map((f) => normLabel(f.label)),
  );
  const usedSection = new Set(
    existing.filter((f) => f.kind === "section").map((f) => normLabel(f.label)),
  );
  const next = [...existing];
  for (const f of incoming) {
    if (f.kind === "section") {
      if (usedSection.has(normLabel(f.label)) || usedId.has(f.id)) continue;
      usedSection.add(normLabel(f.label));
      usedId.add(f.id);
      next.push(f);
      continue;
    }
    if (usedId.has(f.id) || usedLabel.has(normLabel(f.label))) continue;
    usedId.add(f.id);
    usedLabel.add(normLabel(f.label));
    next.push(f);
  }
  return next;
}

export function pfsProgress(fields: Field[], answers: Record<string, any> | null | undefined): {
  asked: number; answered: number;
} {
  const cols = pfsAskable(fields);
  let answered = 0;
  for (const f of cols) {
    const v = answers?.[f.id];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    answered++;
  }
  return { asked: cols.length, answered };
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = []; i++; continue;
    }
    cell += ch; i++;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  question: "label", q: "label", text: "label", prompt: "label", label: "label",
  type: "kind", kind: "kind", field_type: "kind",
  section: "section", group: "section", heading: "section",
  options: "options", choices: "options", answers: "options",
  id: "id", key: "id", field_id: "id",
};

function headerMap(cells: string[]): Record<string, number> | null {
  const mapped: Record<string, number> = {};
  let hits = 0;
  cells.forEach((c, i) => {
    const key = HEADER_ALIASES[c.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")];
    if (key && mapped[key] === undefined) { mapped[key] = i; hits++; }
  });
  return hits ? mapped : null;
}

function mapKind(raw: string | undefined): FieldKind {
  const t = (raw ?? "").toLowerCase().replace(/[\s/-]+/g, "_");
  if (["yes_no", "yesno", "bool", "boolean", "yn", "y_n"].includes(t)) return "bool";
  if (["long", "longtext", "paragraph", "textarea", "narrative"].includes(t)) return "longtext";
  if (["select", "dropdown", "choice", "pick"].includes(t)) return "select";
  if (["multi", "multiselect", "check", "checkbox", "checkboxes"].includes(t)) return "multiselect";
  if (["int", "number", "integer", "count"].includes(t)) return "int";
  if (t === "date") return "date";
  if (["text", "short", "string", "line"].includes(t)) return "text";
  return "longtext";
}

function slugId(n: number, raw?: string): string {
  const keep = (raw ?? "").trim();
  if (keep && isPfsFieldId(keep)) return keep;
  if (keep) {
    const slug = keep.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    if (slug) return `${PFS_ID_PREFIX}${slug}`;
  }
  return `${PFS_ID_PREFIX}q${String(n).padStart(3, "0")}`;
}

function splitOptions(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function fieldsFromPfsCsv(text: string): { fields: Field[]; error?: string } {
  const rows = parseCsvRows(text);
  if (!rows.length) return { fields: [], error: "That file is empty." };

  let header = headerMap(rows[0]);
  let body = rows;
  if (header && header.label !== undefined) {
    body = rows.slice(1);
  } else if (header && header.label === undefined && rows[0].length > 1) {
    return { fields: [], error: "Need a question column. Call it question, label, or text." };
  } else {
    header = { label: 0 };
  }

  const fields: Field[] = [];
  const used = new Set<string>();
  let section = "";
  let n = 0;

  for (const row of body) {
    const label = (row[header.label] ?? "").trim();
    if (!label) continue;
    const nextSection = header.section !== undefined ? (row[header.section] ?? "").trim() : "";
    if (nextSection && nextSection !== section) {
      section = nextSection;
      const sid = `${PFS_ID_PREFIX}s_${section.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || fields.length}`;
      fields.push({
        id: used.has(sid) ? `${sid}_${fields.length}` : sid,
        scope: "lead",
        kind: "section",
        label: section,
        origin: "custom",
      });
      used.add(fields[fields.length - 1].id);
    }
    n += 1;
    let id = slugId(n, header.id !== undefined ? row[header.id] : undefined);
    if (used.has(id)) id = `${PFS_ID_PREFIX}q${String(n).padStart(3, "0")}_${n}`;
    used.add(id);
    const kind = mapKind(header.kind !== undefined ? row[header.kind] : undefined);
    const options = splitOptions(header.options !== undefined ? row[header.options] : undefined);
    const field: Field = {
      id,
      scope: "lead",
      kind: options && kind === "longtext" ? "select" : kind,
      label,
      origin: "custom",
    };
    if (options) field.options = options;
    fields.push(field);
  }

  if (!pfsAskable(fields).length) {
    return { fields: [], error: "No questions found in that file." };
  }
  return { fields };
}

function esc(v: any): string {
  const s = v === undefined || v === null ? ""
    : Array.isArray(v) ? v.join("; ")
    : typeof v === "boolean" ? (v ? "Yes" : "No")
    : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildPfsAnswersCsv(
  fields: Field[],
  rows: { lead_no?: string | null; claimant_name?: string | null; answers?: Record<string, any> | null }[],
): string {
  const cols = pfsAskable(fields);
  const header = ["Lead #", "Claimant", ...cols.map((f) => f.label || f.id)];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    const a = r.answers ?? {};
    lines.push([r.lead_no, r.claimant_name, ...cols.map((f) => a[f.id])].map(esc).join(","));
  }
  return lines.join("\n");
}
