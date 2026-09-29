import { QUESTION_PATHS } from './mva-call/question-spine';
import { SOL } from './mva-call/state';

/** Pure, PRESIGN-only proposal builder. It never changes a record, workflow,
 * signing evidence or contact. The caller must resolve the exact firm/matter,
 * retain this provenance, and compare revisions INCLUDING open call snapshots
 * before applying a reviewed patch. Do not shallow-merge a whole mva_call. */
export const LAWRULER_PRESIGN_VERSION = 'inno-mva-presign-7823-v1' as const;
export type PresignValue = null | boolean | number | string | PresignValue[] | { [key: string]: PresignValue };
export type PresignLeaf = string | boolean | string[];
export interface PresignWarning { code: string; tokens: string[]; message: string }
export interface PresignEvidence { token: string; sourceKey: string; raw: PresignValue; disposition: 'candidate' | 'review' | 'evidence_only' }
export interface PresignCandidate {
  id: string;
  questionId: string;
  sources: string[];
  /** Relative to claims.answers.mva_call; apply all leaves together or none. */
  changes: Record<string, PresignLeaf>;
  /** Related answers that must not be silently combined with imported facts. */
  guardPaths: string[];
}
export type PresignContactColumn = 'claimant_name' | 'dob' | 'mail_addr1' | 'mail_addr2' | 'mail_city' | 'mail_state' | 'mail_zip' | 'email';
export interface PresignContactBinding { sourceKey: string; column: PresignContactColumn; sourceLabel: string }
export interface PresignContactCandidate extends PresignContactBinding { raw: PresignValue; value: string }
export interface PresignOptions {
  /** Explicit clock makes previews/replays deterministic. ISO calendar date. */
  asOfDate: string;
  /** Set only after verifying the source's date convention. */
  slashDateOrder?: 'MDY' | 'DMY';
  /** Explicit source option-id to state-label map; no numeric ID guessing. */
  stateValueMap?: Readonly<Record<string, string>>;
  /** Verified standard/contact field metadata, not guessed question labels. */
  contactBindings?: readonly PresignContactBinding[];
}
export interface PresignMapping {
  schemaVersion: typeof LAWRULER_PRESIGN_VERSION;
  evidence: PresignEvidence[];
  candidates: PresignCandidate[];
  contacts: PresignContactCandidate[];
  warnings: PresignWarning[];
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const blank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
const textOf = (v: unknown) => typeof v === 'string' ? v.trim() : null;
const placeholderOnly = (v: unknown) => typeof v === 'string' && /^(?:<<[^<>]+>>|\{\{[^{}]+\}\})$/.test(v.trim());
const containsPlaceholder = (v: unknown) => typeof v === 'string' && /(?:<<[^<>]+>>|\{\{[^{}]+\}\})/.test(v);

/** Only explicit token spellings, never display prefixes, fuzzy labels or
 * nested sections. The caller must isolate PRESIGN from a multi-tab export. */
function tokenOf(key: string): string | null {
  const match = key.trim().match(/^(?:Custom(41\d{2})|<<Custom(41\d{2})>>)$/i);
  const n = Number(match?.[1] || match?.[2]);
  return n >= 4119 && n <= 4144 ? `Custom${n}` : null;
}

function calendarDate(raw: string, order?: 'MDY' | 'DMY'): string | null {
  let m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y: number, month: number, day: number;
  if (m) { y = +m[1]; month = +m[2]; day = +m[3]; }
  else {
    m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m || !order) return null;
    y = +m[3]; month = +(order === 'MDY' ? m[1] : m[2]); day = +(order === 'MDY' ? m[2] : m[1]);
  }
  if (y < 1000 || y > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, month - 1, day));
  return d.getUTCFullYear() === y && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}
function stateCode(raw: string, mapping?: Readonly<Record<string, string>>): string | null {
  const label = (mapping && own(mapping, raw) ? mapping[raw] : raw).trim().toUpperCase();
  return SOL.find(([code, name]) => code === label || name.toUpperCase() === label)?.[0] || null;
}

export function mapLawRulerPresign(payload: Readonly<Record<string, PresignValue>>, options: PresignOptions): PresignMapping {
  if (!calendarDate(options.asOfDate)) throw new Error('asOfDate must be a valid ISO calendar date');
  const result: PresignMapping = { schemaVersion: LAWRULER_PRESIGN_VERSION, evidence: [], candidates: [], contacts: [], warnings: [] };
  const byToken = new Map<string, PresignEvidence[]>();
  const warning = (code: string, tokens: string[], message: string) => {
    result.warnings.push({ code, tokens, message });
    for (const token of tokens) for (const e of byToken.get(token) || []) e.disposition = 'review';
  };
  for (const [key, raw] of Object.entries(payload)) {
    const token = tokenOf(key);
    if (!token || blank(raw)) continue;
    // An unexpanded template token is missing data, not a claimant's answer.
    if (placeholderOnly(raw)) continue;
    const e: PresignEvidence = { token, sourceKey: key, raw: copy(raw), disposition: 'evidence_only' };
    result.evidence.push(e); byToken.set(token, [...(byToken.get(token) || []), e]);
  }
  const values = new Map<string, PresignValue>();
  for (const [token, rows] of byToken) {
    if (rows.some(e => containsPlaceholder(e.raw))) warning('unexpanded_placeholder', [token], 'Source text contains an unexpanded template placeholder; preserve it for review, not as an answer.');
    else if (rows.some(e => !equal(e.raw, rows[0].raw))) warning('conflicting_aliases', [token], 'Different values were supplied for aliases of the same source field.');
    else values.set(token, rows[0].raw);
  }
  const has = (n: number) => byToken.has(`Custom${n}`);
  const value = (n: number) => values.get(`Custom${n}`);
  const sourceText = (n: number): string | null => {
    const v = value(n);
    if (v === undefined) return null;
    const t = textOf(v);
    if (t == null) warning('unsupported_encoding', [`Custom${n}`], 'Expected an explicit text value; numeric/boolean/object encodings require a verified mapping.');
    return t;
  };
  const add = (id: string, questionId: string, ns: number[], changes: Record<string, PresignLeaf>, guardPaths = QUESTION_PATHS[questionId] || []) => {
    if (Object.keys(changes).some(p => !Object.values(QUESTION_PATHS).some(paths => paths.includes(p)))) throw new Error('Unknown canonical MVA path');
    const sources = ns.map(n => `Custom${n}`).filter(t => byToken.has(t));
    result.candidates.push({ id, questionId, sources, changes, guardPaths });
    for (const token of sources) for (const e of byToken.get(token) || []) if (e.disposition !== 'review') e.disposition = 'candidate';
  };
  const date = (n: number): string | null => {
    const text = sourceText(n); if (text == null) return null;
    const iso = calendarDate(text, options.slashDateOrder);
    if (!iso || iso < (n === 4124 ? '1990-01-01' : '2000-01-01') || iso > options.asOfDate) {
      warning('invalid_date', [`Custom${n}`], 'Use a valid, nonfuture absolute date in the App date range; relative or ambiguous dates require review.'); return null;
    }
    return iso;
  };

  const accident = date(4124);
  if (accident) add('accident_date', 'when', [4124], { 'story.when': 'Pick a date', 'story.date': accident });
  const city = sourceText(4125), stateRaw = sourceText(4126);
  const state = stateRaw ? stateCode(stateRaw, options.stateValueMap) : null;
  if (city && state && !/[,\r\n]/.test(city)) add('accident_location', 'city', [4125, 4126], { 'story.city': `${city}, ${state}` });
  else if (has(4125) || has(4126)) warning('incomplete_location', ['Custom4125', 'Custom4126'], 'Accident city and a recognized accident state must be reviewed together; mailing state is not a substitute.');

  const seat = sourceText(4121), other = sourceText(4122);
  if (seat && ['Driver', 'Passenger', 'Pedestrian', 'Other'].includes(seat)) {
    add('seat', 'seat', [4121, ...(seat === 'Other' && other ? [4122] : [])], { 'story.seat': seat, ...(seat === 'Other' && other ? { 'story.seatOther': other } : {}) });
    if (seat === 'Other' && !other) warning('missing_other_explanation', ['Custom4121', 'Custom4122'], 'Other remains incomplete until its explanation is supplied.');
  } else if (seat) warning('unknown_choice', ['Custom4121'], 'Driver/passenger choice is not one of the verified labels.');
  const fault = sourceText(4127);
  if (fault === 'Caller at fault (DQ)' || fault === 'Other Vehicle') add('fault', 'fault', [4127], { 'story.fault': fault === 'Caller at fault (DQ)' ? 'Caller' : 'Other driver' });
  else if (fault) warning('fault_review', ['Custom4127', 'Custom4128'], 'Same-vehicle driver and Other are not exact App choices; preserve the source and review the explanation.');

  const account = sourceText(4141), summary = sourceText(4123);
  if (account && summary && account !== summary) warning('narrative_conflict', ['Custom4123', 'Custom4141'], 'Both narratives are preserved; review a labeled merge instead of dropping either original.');
  else if ((account || summary) && ![4123, 4141].some(n => has(n) && value(n) === undefined)) {
    const n = account ? 4141 : 4123;
    // Preserve narrative bytes/line breaks rather than the trimmed comparison.
    add('narrative', 'notes', [n], { 'story.text': value(n) as string });
  }
  if (sourceText(4130)) add('injury_detail', 'pain', [4130], { 'body.painNote': value(4130) as string });

  const seenRaw = value(4131);
  let seen: string[] | null = null;
  if (seenRaw !== undefined) {
    let list: unknown = seenRaw;
    if (typeof list === 'string') {
      const t = list.trim();
      if (t.startsWith('[')) { try { list = JSON.parse(t); } catch { list = null; } }
      else list = [t];
    }
    const choices: Record<string, string> = { 'NO TREATMENT': 'Not yet', 'Primary Care Physician': 'Own doctor', Chiropractor: 'Chiropractor', 'Urgent Care': 'Urgent care' };
    if (!Array.isArray(list) || !list.length || list.some(x => typeof x !== 'string' || !(own(choices, x) || x === 'Hospital'))) {
      warning('treatment_encoding_or_choice', ['Custom4131'], 'Use an explicit array/JSON array or one exact label; unknown values and delimited strings are not guessed.');
    } else if (list.includes('Hospital')) warning('hospital_not_er', ['Custom4131'], 'Hospital does not establish ER; hold the entire treatment group for review.');
    else if (list.includes('NO TREATMENT') && list.some(x => x !== 'NO TREATMENT')) warning('treatment_conflict', ['Custom4131'], 'No treatment conflicts with a selected treatment type.');
    else seen = [...new Set((list as string[]).map(x => choices[x]))];
  }
  let first = date(4132), last = date(4133);
  if ((first && accident && first < accident) || (last && accident && last < accident) || (first && last && last < first)) {
    warning('treatment_date_order', ['Custom4124', 'Custom4132', 'Custom4133'], 'Treatment dates conflict with the accident date or first/last order.'); first = null; last = null;
  }
  if (seen?.includes('Not yet') && (has(4132) || has(4133))) {
    warning('treatment_conflict', ['Custom4131', 'Custom4132', 'Custom4133'], 'No treatment conflicts with supplied treatment dates.'); seen = null; first = null; last = null;
  }
  if (seen) add('treatment', 'seen', [4131], { 'body.seen': seen, 'body.done.seen': true });
  if (first) add('first_treatment', 'firstAt', [4132], { 'body.firstAt': first });
  if (last) add('last_treatment', 'lastAt', [4133], { 'body.lastAt': last });

  for (const [n, path] of [[4137, 'body.uim'], [4140, 'body.check']] as const) {
    const v = sourceText(n); if (v == null) continue;
    if (v !== 'Yes' && v !== 'No') { warning('unknown_yes_no', [`Custom${n}`], 'Only the verified Yes/No labels can be normalized.'); continue; }
    if (n === 4137 && has(4138)) { warning('insurance_note_review', ['Custom4137', 'Custom4138'], 'Review the insurance notes alongside the checkbox; do not infer certainty from prose.'); continue; }
    add(n === 4137 ? 'uim' : 'injury_payment', n === 4137 ? 'uim' : 'check', [n], { [path]: n === 4140 && v === 'Yes' ? 'Yes, for injuries' : v });
  }
  const preserve: Record<number, string> = {
    4120: 'Current representation is not the App question about already signing elsewhere.',
    4128: 'Preserve fault explanation as a source fact; do not overwrite the accident narrative.',
    4129: 'Injury at the accident is not a current pain-region answer; do not infer pain or DQ.',
    4134: 'The combined gap-check Yes/No polarity is unknown; do not map to body.stretch.',
    4135: 'Health insurance is not willingness to treat or auto insurance.',
    4136: 'Other-driver insurance is not PNC coverage, exchanged information or insurer name.',
    4138: 'Preserve insurance notes; do not execute their DQ instruction or infer answers.',
    4139: 'Government/emergency vehicle is not police attendance; no automatic DQ.',
    4143: 'An entered agreement-script note is not evidence of sending, signing or consent.',
  };
  for (const [n, reason] of Object.entries(preserve)) if (has(+n)) warning('source_fact_only', [`Custom${n}`], reason);
  for (const n of [4119, 4142, 4144]) if (has(n)) warning('script_only', [`Custom${n}`], 'Script text is not an answer or workflow evidence.');

  for (const b of options.contactBindings || []) {
    if (!own(payload, b.sourceKey) || blank(payload[b.sourceKey])) continue;
    const raw = payload[b.sourceKey];
    if (placeholderOnly(raw)) continue;
    const evidence: PresignEvidence = { token: b.sourceKey, sourceKey: b.sourceKey, raw: copy(raw), disposition: 'evidence_only' };
    result.evidence.push(evidence);
    if (containsPlaceholder(raw)) {
      evidence.disposition = 'review'; warning('unexpanded_placeholder', [b.sourceKey], 'Contact text contains an unexpanded template placeholder; review its source binding.'); continue;
    }
    let v = textOf(raw);
    if (v && b.column === 'dob') v = calendarDate(v, options.slashDateOrder);
    if (v && b.column === 'dob' && v > options.asOfDate) v = null;
    if (v && b.column === 'mail_state') v = stateCode(v, options.stateValueMap);
    if (!v) { evidence.disposition = 'review'; warning('contact_review', [b.sourceKey], 'Contact value needs review against the verified field binding.'); continue; }
    evidence.disposition = 'candidate';
    result.contacts.push({ ...b, raw: copy(raw), value: v });
  }
  for (const column of new Set(result.contacts.map(c => c.column))) {
    const rows = result.contacts.filter(c => c.column === column);
    if (rows.some(c => c.value !== rows[0].value)) {
      warning('contact_conflict', rows.map(c => c.sourceKey), 'Contact aliases disagree; retain originals and review before applying.');
      result.contacts = result.contacts.filter(c => c.column !== column);
    }
  }
  return result;
}

export interface PresignMergeOptions {
  /** Only actual provenance authorizing a default blank, never inferred from its appearance. */
  untouchedPaths?: readonly string[];
  /** Durable explicit clears win even if a leaf is now absent. Parent paths accepted. */
  clearedPaths?: readonly string[];
}
export interface PresignMergeDecision {
  candidate: PresignCandidate;
  status: 'eligible' | 'same' | 'conflict' | 'needs_review';
  reasons: string[];
  expected: Record<string, { exists: boolean; value?: PresignValue }>;
}
export interface PresignMergePreview { decisions: PresignMergeDecision[]; patch: Record<string, PresignLeaf> }

function readPath(root: unknown, path: string): { exists: boolean; value?: PresignValue; blocked?: boolean } {
  const parts = path.split('.'); let current: unknown = root;
  for (let i = 0; i < parts.length; i++) {
    if (!record(current)) return { exists: true, value: copy(current ?? null) as PresignValue, blocked: true };
    if (!own(current, parts[i])) return { exists: false };
    current = current[parts[i]];
  }
  return { exists: true, value: copy(current ?? null) as PresignValue };
}

/** Review-only missing-leaf patch. No mutation. Atomic question groups refuse
 * populated siblings and explicit blank/false/null values. Caller must use the
 * entire expected snapshot + row revision; this is not database concurrency. */
export function previewLawRulerPresignMerge(mapping: PresignMapping, currentMvaAnswers: unknown, options: PresignMergeOptions = {}): PresignMergePreview {
  const untouched = new Set(options.untouchedPaths || []);
  const cleared = (p: string) => (options.clearedPaths || []).some(c => p === c || p.startsWith(c + '.') || c.startsWith(p + '.'));
  const decisions: PresignMergeDecision[] = mapping.candidates.map(candidate => {
    const paths = [...new Set([...candidate.guardPaths, ...Object.keys(candidate.changes)])];
    const expected = Object.fromEntries(paths.map(p => [p, readPath(currentMvaAnswers, p)]));
    const reasons: string[] = []; let needsReview = false; let pending = false;
    for (const path of paths) {
      const cur = expected[path], changing = own(candidate.changes, path);
      if (cleared(path)) { reasons.push(`${path} was explicitly cleared.`); continue; }
      if (cur.blocked) { reasons.push(`${path} has a non-object or cleared parent.`); continue; }
      if (changing && cur.exists && equal(cur.value, candidate.changes[path])) continue;
      if (!cur.exists) { if (changing) pending = true; continue; }
      if (blank(cur.value)) {
        if (!untouched.has(path)) { needsReview = true; reasons.push(`${path} is present but blank; its edit history is unknown.`); }
        else if (changing) pending = true;
      } else reasons.push(`${path} already has a local answer.`);
    }
    const conflict = reasons.some(r => !r.includes('edit history is unknown'));
    return { candidate, expected, status: conflict ? 'conflict' : needsReview ? 'needs_review' : pending ? 'eligible' : 'same', reasons };
  });
  // Cross-question dates must also agree with existing/same/eligible answers.
  const prospective = (path: string) => {
    const d = decisions.find(d => (d.status === 'eligible' || d.status === 'same') && own(d.candidate.changes, path));
    return d ? d.candidate.changes[path] : readPath(currentMvaAnswers, path).value;
  };
  const accident = prospective('story.date'), first = prospective('body.firstAt'), last = prospective('body.lastAt'), seen = prospective('body.seen');
  for (const d of decisions) {
    if (d.status !== 'eligible' || !['accident_date', 'first_treatment', 'last_treatment', 'treatment'].includes(d.candidate.id)) continue;
    const iso = (v: unknown): v is string => typeof v === 'string' && calendarDate(v) !== null;
    if ((iso(accident) && iso(first) && first < accident) || (iso(accident) && iso(last) && last < accident) || (iso(first) && iso(last) && last < first) || (Array.isArray(seen) && seen.includes('Not yet') && (!!first || !!last))) {
      d.status = 'conflict'; d.reasons.push('Proposed dates/treatment conflict with the existing or proposed accident/treatment answers.');
    }
  }
  const patch: Record<string, PresignLeaf> = {};
  for (const d of decisions) if (d.status === 'eligible') for (const [path, value] of Object.entries(d.candidate.changes)) {
    if (!d.expected[path].exists || !equal(d.expected[path].value, value)) patch[path] = copy(value);
  }
  return { decisions, patch };
}
