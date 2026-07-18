// ============================================================================
// Question sets. `script` is spoken verbatim. `note` is agent-only and must
// never be read aloud. Option labels are tap targets, not a script — several
// carry an explicit do-not-read instruction.
// ============================================================================
import type { CaseTypeKey } from "./engine";

export interface QOption { value: string; label: string; note?: string }
export interface Question {
  key: string;
  script: string;
  note?: string;
  kind: "single" | "multi" | "text";
  options?: QOption[];
}

const YN: QOption[] = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

// Injury classification drives routing. Strain vs tear is the dividing line.
export const INJURY_OPTIONS: { value: string; label: string; serious: boolean; catastrophic: boolean }[] = [
  { value: "neck_back",  label: "Neck or back pain",                   serious: false, catastrophic: false },
  { value: "strain",     label: "Muscle strain",                       serious: false, catastrophic: false },
  { value: "whiplash",   label: "Whiplash",                            serious: false, catastrophic: false },
  { value: "lig_strain", label: "Shoulder / knee ligament STRAIN",     serious: false, catastrophic: false },
  { value: "anxiety",    label: "Anxiety / emotional distress",        serious: false, catastrophic: false },
  { value: "head",       label: "Head injury / concussion",            serious: true,  catastrophic: true  },
  { value: "broken",     label: "Broken bones",                        serious: true,  catastrophic: false },
  { value: "lig_tear",   label: "Shoulder / knee ligament TEAR",       serious: true,  catastrophic: false },
  { value: "internal",   label: "Internal bleeding / ruptured organ",  serious: true,  catastrophic: true  },
  { value: "scarring",   label: "Scarring / permanent marks",          serious: true,  catastrophic: true  },
  { value: "death",      label: "Death",                               serious: true,  catastrophic: true  },
];

const INJURY_Q: Question = {
  key: "injuries",
  script: "Tell me about your injuries. What is hurting?",
  note: "Do not read this list. Let them describe it, then mark what they said. Strain and tear route differently — never upgrade it for them.",
  kind: "multi",
  options: INJURY_OPTIONS.map((i) => ({ value: i.value, label: i.label })),
};

const SURGERY_Q: Question = {
  key: "surgery",
  script: "Has any surgery been done, or has a doctor recommended surgery?",
  kind: "single",
  options: [
    { value: "no", label: "No" },
    { value: "yes", label: "Yes", note: "Flags for secondary review" },
  ],
};

const TREATMENT_Q: Question = {
  key: "treatment",
  script: "Where are you at with treatment? Have you been seen, are you still going, or have you wrapped up?",
  kind: "single",
  options: [
    { value: "treated",  label: "Already treated" },
    { value: "still",    label: "Still treating" },
    { value: "finished", label: "Finished treatment" },
    { value: "stopped",  label: "Stopped early, or one-time only" },
    { value: "never",    label: "Has not seen a doctor yet" },
  ],
};

const WILLING_Q: Question = {
  key: "willing",
  script: "Are you willing to get checked out by a doctor?",
  note: "If they hesitate, use the tell on the next line. Do not move on until you have an answer.",
  kind: "single",
  options: [{ value: "yes", label: "Yes, willing" }, { value: "no", label: "No" }],
};

const billsQ = (): Question => ({
  key: "bills",
  script: "Do you have a rough idea what your medical bills are so far?",
  note: "Do NOT read these ranges aloud. Ask it open, listen, then tap the range they land on.",
  kind: "single",
  options: [
    { value: "none",      label: "Nothing yet" },
    { value: "under_10k", label: "Under $10,000" },
    { value: "10k_50k",   label: "$10,000 to $50,000" },
    { value: "over_50k",  label: "Over $50,000" },
    { value: "unknown",   label: "Not sure" },
  ],
});

// ---------------------------------------------------------------- AUTO
export const AUTO_QUESTIONS: Question[] = [
  {
    key: "authority",
    script: "Are you the person who was injured, or are you calling for someone close to you?",
    kind: "single",
    options: [
      { value: "self", label: "The caller was injured" },
      { value: "alive", label: "Calling for someone else (they are alive)" },
      { value: "deceased", label: "The injured person passed away", note: "Wrongful death" },
    ],
  },
  {
    key: "role",
    script: "Were you the driver, a passenger, a pedestrian, or a cyclist?",
    kind: "single",
    options: [
      { value: "driver",     label: "Driver" },
      { value: "passenger",  label: "Passenger" },
      { value: "pedestrian", label: "Pedestrian" },
      { value: "cyclist",    label: "Cyclist" },
    ],
  },
  {
    key: "poa",
    script: "Do you have power of attorney for them, or are you their parent or legal guardian?",
    kind: "single",
    options: [
      { value: "yes", label: "Yes — power of attorney, or parent/guardian of a minor", note: "May continue and sign" },
      { value: "no", label: "No authority", note: "Callback the injured person" },
    ],
  },
  {
    key: "attorney", script: "Are you already working with an attorney on this accident?", kind: "single",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", note: "Do not ask who; do not comment on the other firm" },
    ],
  },
  {
    key: "commercial",
    script: "The vehicle that hit you, was it a work truck, a semi, a delivery van, a rideshare, a bus, or anything with a company name on it?",
    kind: "single",
    options: [
      { value: "no",      label: "No, a regular passenger vehicle" },
      { value: "yes",     label: "Yes, a commercial vehicle", note: "Flags for secondary review" },
      { value: "unknown", label: "Not sure" },
    ],
  },
  { key: "injured", script: "Were you hurt in the accident?", kind: "single",
    options: [{ value: "yes", label: "Yes, injured" }, { value: "no", label: "No injuries at all" }] },
  INJURY_Q,
  {
    key: "symptoms_ongoing",
    script: "Are you still having symptoms?",
    kind: "single",
    options: [{ value: "yes", label: "Yes, still having symptoms" }, { value: "no", label: "No, symptoms resolved" }],
  },
  SURGERY_Q,
  {
    key: "hosp",
    script: "Were you kept in the hospital overnight?",
    kind: "single",
    options: [
      { value: "no",    label: "No, or a same-day ER visit" },
      { value: "short", label: "Yes, but less than 3 days" },
      { value: "long",  label: "Yes, more than 3 days", note: "Flags for secondary review, escalate while on the call" },
    ],
  },
  {
    key: "fault",
    script: "In your own words, whose fault was the accident?",
    note: "The caller states fault. Never tell them who was at fault.",
    kind: "single",
    options: [
      { value: "other",  label: "The other driver" },
      { value: "shared", label: "Shared or not sure" },
      { value: "caused", label: "The caller caused it" },
    ],
  },
  {
    key: "police_report",
    script: "Was a police report made?",
    kind: "single",
    options: [
      { value: "yes",     label: "Yes" },
      { value: "no",      label: "No" },
      { value: "unsure",  label: "Not sure" },
    ],
  },
  {
    key: "citations",
    script: "Were any citations issued, and to whom?",
    kind: "single",
    options: [
      { value: "other",  label: "The other driver was cited" },
      { value: "caller", label: "The caller was cited", note: "Does not automatically disqualify. Keep going" },
      { value: "none",   label: "No citations" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  { key: "settled", script: "Have you already settled this, or signed a release with any insurance company?", kind: "single",
    options: [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", note: "Car repair money alone is not an injury release" },
    ] },
  {
    key: "what_happened",
    script: "Tell me, to the best of your ability, a brief description of what happened. Do not worry about exact details right now. I just need the broad strokes so I can understand it from a high level.",
    kind: "text",
    note: "Outline only. If they ramble or start giving exact speeds and directions, cut them off and redirect: \"Sorry to interrupt, remember, I just need an outline of what happened. We will get into specifics afterwards.\"",
  },
  {
    key: "agent_read",
    script: "",
    kind: "single",
    note: "Your call, not the caller's. This is recorded and compared against the outcome.",
    options: [
      { value: "yes",   label: "Yes, this sounds like a case" },
      { value: "maybe", label: "Not sure yet" },
      { value: "no",    label: "No, this does not sound like a case", note: "Keep going anyway. The questions decide, not the hunch" },
    ],
  },
  {
    key: "date",
    script: "When did the accident happen?",
    kind: "single",
    options: [
      { value: "le30", label: "Within the last 30 days" },
      { value: "mid",  label: "31 days to under 9 months" },
      { value: "old",  label: "9 months or older" },
    ],
  },
  TREATMENT_Q,
  WILLING_Q,
  {
    key: "ins_other",
    script: "Was there insurance on the other driver?",
    kind: "single",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure", note: "Not sure is not a no. Keep going" },
    ],
  },
  {
    key: "ins_own",
    script: "And do you carry insurance yourself?",
    kind: "single",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure", note: "Not sure is not a no. Keep going" },
    ],
  },
  {
    key: "ins_uim",
    script: "Do you have uninsured or underinsured motorist coverage on your own policy?",
    kind: "single",
    note: "Most people do not know. Unsure is the most common honest answer and it is fine.",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure", note: "Not sure is not a no. Keep going" },
    ],
  },
  billsQ(),
];

// ---------------------------------------------------------------- GENERAL PI
export const GPI_QUESTIONS: Question[] = [
  {
    key: "presence",
    script: "Were you allowed to be where this happened? Were you a customer, a guest, a tenant, or an employee?",
    kind: "single",
    options: [
      { value: "yes", label: "Yes, lawfully there" },
      { value: "no",  label: "No / trespassing" },
    ],
  },
  { key: "injured", script: "Were you hurt in the incident?", kind: "single", options: YN },
  INJURY_Q,
  {
    key: "symptoms_ongoing",
    script: "Are you still having symptoms?",
    kind: "single",
    options: [{ value: "yes", label: "Yes, still having symptoms" }, { value: "no", label: "No, symptoms resolved" }],
  },
  SURGERY_Q,
  {
    key: "date",
    script: "When did the incident happen?",
    kind: "single",
    options: [
      { value: "le30", label: "Within the last 30 days" },
      { value: "mid",  label: "31 days to under 9 months" },
      { value: "old",  label: "9 months or older" },
    ],
  },
  TREATMENT_Q,
  WILLING_Q,
  billsQ(),
];

// ---------------------------------------------------------------- EVERYTHING ELSE
// Brief capture only. No criteria, no screening, no agent judgment.
export const BRIEF_QUESTIONS: Question[] = [
  {
    key: "what_happened",
    script: "Okay, tell me what is going on and I will get this over to the right attorney in our network.",
    note: "Capture it in their words. Do not screen it, do not evaluate it, do not react to it.",
    kind: "text",
  },
  { key: "incident_date", script: "When did this happen?", kind: "text" },
  { key: "state", script: "What state did this happen in?", kind: "text" },
  {
    key: "represented",
    script: "Are you working with an attorney on this right now?",
    kind: "single",
    options: [
      { value: "no",              label: "No" },
      { value: "yes_satisfied",   label: "Yes, and happy with them" },
      { value: "yes_unsatisfied", label: "Yes, but not happy" },
    ],
  },
];

export const CASE_TYPES: { key: CaseTypeKey; label: string; sub: string }[] = [
  { key: "mva",       label: "Auto accident",          sub: "Full screening" },
  { key: "prem",        label: "Slip / fall / premises",  sub: "Full screening" },
  { key: "employment", label: "Employment",              sub: "Brief capture" },
  { key: "family",     label: "Family",                  sub: "Brief capture" },
  { key: "criminal",   label: "Criminal",                sub: "Brief capture" },
  { key: "contract",   label: "Contract / business",     sub: "Brief capture" },
  { key: "other",      label: "Other",                   sub: "Brief capture" },
];

export function questionsFor(caseType: CaseTypeKey): Question[] {
  if (caseType === "mva") return AUTO_QUESTIONS;
  if (caseType === "prem") return GPI_QUESTIONS;
  return BRIEF_QUESTIONS;
}

export function questionByKey(caseType: CaseTypeKey, key: string): Question | undefined {
  return questionsFor(caseType).find((q) => q.key === key);
}
