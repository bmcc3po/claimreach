// ============================================================================
// LEXAMICA PAYLOAD
//
// Builds the JSON body for a network referral. Pure: no I/O, no database, so it
// can be tested against a fixture without a live lead.
//
// This is deliberately written as the FIRST outbound destination, not as a
// Lexamica feature. The shape (field map, summary construction, audit row) is
// the same shape the next referral network needs, and the same shape the ~22
// existing outbound hooks want. Lexamica is row one.
//
// Three traps are handled here explicitly, because all three have already
// caused a production bug in this codebase:
//
//   1. BOOLEANS. The guided console stores "yes"/"no" strings while the rest of
//      the app stores real booleans. String(answer) would print `true` into a
//      synopsis an attorney reads.
//   2. CHOICE VALUES. Answers store engine keys ("under_10k"), not labels
//      ("Under $10,000"). Sending the raw value gives the receiving firm
//      gibberish, so values are resolved back through the form's choices.
//   3. FORM RESOLUTION. The summary is built from ONE form lookup passed in by
//      the caller. A second, independent lookup is what printed the Motel 6
//      exports with every question and no answers.
// ============================================================================

export interface LexamicaPayload {
  FirstName: string;
  LastName: string;
  Phone: string;
  PracticeArea: string;
  IncidentDate: string;
  IncidentAddressState: string;
  Summary: string;
  Email?: string;
  LeadId?: string;
}

/** The minimum shape of a stored form field the summary needs. */
export interface SummaryField {
  id: string;
  label?: string;
  script?: string;
  kind?: string;
  choices?: { value: string; label: string }[];
}

// ONE list. It is the intake question's answer options AND the Lexamica
// vocabulary at the same time, because they are the same fact stated once.
//
// ClaimReach carries two case types for TMT: MVA and PI. Everything else on
// Lexamica's list is a SUBTYPE of PI, not a case type of its own. Eleven case
// types would mean eleven campaigns, eleven pickers and eleven forms to keep in
// step, to describe what is one personal injury intake wearing a label. This is
// the same call already made for commercial vehicle, motorcycle and pedestrian:
// a thing that varies INSIDE a case is a modifier, not a kind of case.
//
// The `label` values are TMT's exact strings, supplied by Kacie Girgenti on
// Aug 6 2026. They are not ours to tidy. Casey Mahoney, Aug 6: a case type that
// does not match exactly "will come into Lexamica as Other and will not be
// referred out". That is a silent death, not an error. The POST succeeds, the
// case lands, and it never reaches a firm. It has already happened once here:
// the 7/21 chatbot test arrived as "Other" on everything except Medical
// Malpractice.
//
// Add a subtype by adding a row here. The question and the mapping both update,
// because there is only one of them.
export interface CaseSubtype { value: string; label: string }

export const PI_SUBTYPES: CaseSubtype[] = [
  { value: "mva",        label: "Motor Vehicle Accident" },
  { value: "general",    label: "Personal Injury" },
  { value: "dogbite",    label: "Dog Bite Injuries" },
  { value: "workplace",  label: "Workplace Injuries" },
  { value: "workcomp",   label: "Workers' Compensation" },
  { value: "pedestrian", label: "Pedestrian Injuries" },
  { value: "commprop",   label: "Commercial Property Injuries" },
  { value: "construct",  label: "Construction Accidents" },
  { value: "medmal",     label: "Medical Malpractice" },
  { value: "prodliab",   label: "Product Liability" },
  { value: "nursing",    label: "Nursing Home Injuries" },
  { value: "referout",   label: "Personal Injury" },
];

// Matters TMT does not handle at all, captured on the refer-out branch at R1.
export const REFERRAL_SUBTYPES: CaseSubtype[] = [
  { value: "family_law",                    label: "Family Law" },
  { value: "social_injustice_or_civil_righ", label: "Social Injustice" },
  { value: "criminal_law",                  label: "Criminal Law" },
  { value: "bankruptcy",                    label: "Bankruptcy" },
  { value: "landlord_tenant_dispute",       label: "Landlord-Tenant Disputes" },
  { value: "wills_and_trusts",              label: "Wills and Trusts" },
  { value: "civil_litigation",              label: "Civil Litigation" },
];

// The two real case types. Everything else resolves through a subtype.
export const CASE_TYPE_PRACTICE_AREA: Record<string, string> = {
  mva:  "Motor Vehicle Accident",
  prem: "Personal Injury",
};

const SUBTYPE_LOOKUP: Record<string, string> = Object.fromEntries(
  [...PI_SUBTYPES, ...REFERRAL_SUBTYPES].map((s) => [s.value, s.label]),
);

/**
 * What goes in PracticeArea. The subtype is the more specific fact, so it wins.
 * With no subtype captured, an MVA is a Motor Vehicle Accident and anything
 * else is Personal Injury, both of which are on TMT's list, so a file that
 * skipped the question still routes instead of landing in Other.
 */
export function practiceAreaFor(caseType: string | null | undefined, subtype?: unknown): string {
  const sub = String(subtype ?? "").trim();
  if (sub && SUBTYPE_LOOKUP[sub]) return SUBTYPE_LOOKUP[sub];
  return CASE_TYPE_PRACTICE_AREA[String(caseType ?? "")] ?? "Personal Injury";
}

const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
};

/** "Las Vegas, NV" or "Miami, Florida" or "TN" all resolve to a 2-letter code. */
export function toStateCode(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const tail = s.includes(",") ? s.split(",").pop()!.trim() : s;
  const bare = tail.replace(/[^A-Za-z ]/g, "").trim();
  if (/^[A-Za-z]{2}$/.test(bare)) {
    const up = bare.toUpperCase();
    return Object.values(STATE_ABBR).includes(up) ? up : "";
  }
  return STATE_ABBR[bare.toLowerCase()] ?? "";
}

/** Anything date-ish to ISO YYYY-MM-DD. Returns "" rather than an invalid date. */
export function toIsoDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * One answer rendered as something a human reads. Handles the boolean and
 * choice-value traps above.
 */
export function renderAnswer(field: SummaryField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (Array.isArray(value)) {
    return value.map((v) => renderAnswer(field, v)).filter(Boolean).join(", ");
  }

  const s = String(value).trim();
  if (!s) return "";

  // The stored answer is a key ("under_10k", "yes"); the label is the wording
  // the agent actually used ("Under $10,000", "Yes, injured"). The label wins,
  // because that is what makes the synopsis read like the call.
  const hit = field.choices?.find((c) => c.value === s);
  if (hit) return hit.label;

  // No choices to resolve against. The guided view stores plain yes/no strings,
  // so normalize the casing rather than leaving "yes" next to a "Yes".
  if (s === "yes") return "Yes";
  if (s === "no") return "No";

  return s;
}

/**
 * The whole intake as one string, which is what Lexamica asks for: not one
 * custom field per question.
 *
 * `fields` must arrive in PRINT order, the narrative sequence. Ask order is
 * dynamic and tuned to disqualify fast, so it would produce a scrambled
 * synopsis. Unanswered questions are skipped entirely rather than emitted as a
 * blank stub.
 */
export function buildSummary(fields: SummaryField[], answers: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (f.kind === "section" || f.kind === "script") continue;
    const rendered = renderAnswer(f, answers[f.id]);
    if (!rendered) continue;
    const question = (f.script || f.label || f.id).trim();
    parts.push(`${question}:\n${rendered}`);
  }
  return parts.join("\n\n");
}

export interface BuildInput {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  caseType?: string | null;
  leadId?: string | null;
  answers: Record<string, unknown>;
  fields: SummaryField[];
}

export interface BuildResult {
  payload: LexamicaPayload;
  /** Required fields that came back empty. Non-empty means do not send. */
  missing: string[];
}

export function buildLexamicaPayload(input: BuildInput): BuildResult {
  const a = input.answers ?? {};

  const summary = buildSummary(input.fields ?? [], a);
  const state = toStateCode(a.incident_city_state ?? a.state ?? a.incident_state);
  const date = toIsoDate(a.date ?? a.incident_date);
    // The refer-out branch names the matter precisely at R1; otherwise the
  // core screen's case_subtype is the answer.
  const practice = practiceAreaFor(input.caseType, a.referout_not_read_aloud_select_what_t ?? a.case_subtype ?? a.subtype);

  const payload: LexamicaPayload = {
    FirstName: String(input.firstName ?? "").trim(),
    LastName: String(input.lastName ?? "").trim(),
    Phone: String(input.phone ?? "").trim(),
    PracticeArea: practice,
    IncidentDate: date,
    IncidentAddressState: state,
    Summary: summary,
  };

  // Omitted rather than sent empty: an empty string is a value, and a receiving
  // system cannot tell it apart from a real one.
  const email = String(input.email ?? "").trim();
  if (email) payload.Email = email;
  const leadId = String(input.leadId ?? "").trim();
  if (leadId) payload.LeadId = leadId;

  const missing: string[] = [];
  if (!payload.FirstName) missing.push("FirstName");
  if (!payload.LastName) missing.push("LastName");
  if (!payload.Phone) missing.push("Phone");
  if (!payload.PracticeArea) missing.push("PracticeArea");
  if (!payload.IncidentDate) missing.push("IncidentDate");
  if (!payload.IncidentAddressState) missing.push("IncidentAddressState");
  if (!payload.Summary) missing.push("Summary");

  return { payload, missing };
}

// ---------------------------------------------------------------- the question
// The agent-facing question, generated from the list above rather than typed out
// again. If these were two lists they would drift, and the drift would show up
// as cases quietly landing in Other.
//
// Asked on the PI intake only. An MVA does not need it: the case type already
// says what it is.
export function subtypeQuestion(kind: "pi" | "referral") {
  const opts = kind === "referral" ? REFERRAL_SUBTYPES : PI_SUBTYPES;
  return {
    key: "case_subtype",
    script: kind === "referral"
      ? "What kind of legal matter is this?"
      : "What kind of injury case is this?",
    note: "Do not read the list. Listen to what happened, then tap the closest match. This decides which firm the file reaches, so if nothing fits cleanly, leave it on Personal Injury.",
    kind: "single" as const,
    options: opts.map((o) => ({ value: o.value, label: o.label })),
  };
}

// ---------------------------------------------------------------- transport
// These live here, not in the route file. A Next.js App Router route may only
// export HTTP handlers plus a short list of config fields, so exporting helpers
// from route.ts fails the build with "not a valid Route export field". tsc does
// not check that rule, only next build does, which is why it passed locally and
// broke on deploy. Both routes import them from here instead.

export interface LexamicaResponse {
  status: number;
  ok: boolean;
  text: string;
  parsed: any;
}

export async function postToLexamica(payload: LexamicaPayload, url: string, key: string): Promise<LexamicaResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Key ${key}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* not json, keep the raw text */ }
  return { status: res.status, ok: res.ok, text, parsed };
}

/**
 * Their docs say to store the returned LexamicaId but never show a success
 * body, so this looks across the plausible names rather than assuming one.
 */
export function extractLexamicaId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  for (const k of ["LexamicaId", "lexamicaId", "id", "caseId", "CaseId", "_id"]) {
    const v = body[k];
    if (typeof v === "string" && v) return v;
  }
  if (body.data) return extractLexamicaId(body.data);
  return null;
}
