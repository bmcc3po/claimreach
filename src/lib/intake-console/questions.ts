// ============================================================================
// Question sets. `script` is spoken verbatim. `note` is agent-only and must
// never be read aloud. Option labels are tap targets, not a script — several
// carry an explicit do-not-read instruction.
// ============================================================================
import type { CaseTypeKey } from "./engine";

export interface QOption { value: string; label: string; note?: string }
export interface Question {
  /** Heading shown when there is nothing to read aloud. */
  label?: string;
  /** Render as a paragraph box: Enter adds a line instead of advancing. */
  multiline?: boolean;
  key: string;
  script: string;
  note?: string;
  kind: "single" | "multi" | "text" | "date" | "time";
  options?: QOption[];
  /**
   * Render this text field with a Google-backed picker instead of a plain input:
   * "city" = standardized "City, ST" autocomplete; "agency" = incident-location
   * lookup that suggests the police department that likely holds the report.
   */
  lookup?: "city" | "agency";
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

export const WILLING_MORE_Q: Question = {
  key: "willing_more",
  script: "If a doctor suggests more treatment, are you willing to go?",
  kind: "single",
  note: "Only asked when treatment has already ended. A finished or abandoned course of care is worth far more if they are still willing to be seen.",
  options: [
    { value: "yes",    label: "Yes, willing to go back" },
    { value: "no",     label: "No, they are done", note: "Weakens the file. Flag it in your notes" },
    { value: "unsure", label: "Not sure" },
  ],
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

// Asked LAST on every intake, of every case type. Agent-only: a plain-language
// handoff to the case manager. The empty script keeps it off the read-aloud
// rail — the label is the heading and the note is the instruction.
export const CASE_MANAGER_NOTES_Q: Question = {
  key: "case_manager_notes",
  label: "Agent — summarize the case and add notes for the case manager",
  multiline: true,
  script: "",
  kind: "text",
  note: "In your own words, summarize what happened and flag anything the case manager needs to know: injuries, urgency, tricky facts, follow-ups. This is not read to the caller.",
};

// ---------------------------------------------------------------- AUTO
export const AUTO_QUESTIONS: Question[] = [
  {
    key: "authority",
    // Asked in the greeting. Re-reading it makes the agent sound like they were
    // not listening, which is the opposite of the impression we want in the
    // first fifteen seconds.
    script: "",
    label: "Record what they just told you",
    note: "They answered this in the greeting. Do not ask again, just tap it.",
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
  WILLING_MORE_Q,
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
    script: "Do you believe you or the other party was at fault?",
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
    key: "police_agency",
    script: "Do you know which department responded?",
    kind: "text",
    lookup: "agency",
    note: "City police, county sheriff, or a state trooper. Drop the crash location in the picker to narrow the likely department, or just type what they tell you.",
  },
  {
    key: "police_report_number",
    script: "And do you have the report or case number?",
    kind: "text",
    note: "Often on a card or slip handed over at the scene. If they do not have it, that is fine, we order it by date and location.",
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
    key: "incident_city_state",
    script: "And where did this happen? City and state.",
    kind: "text",
    lookup: "city",
    note: "Ask this every single time, right alongside the date. State drives the statute of limitations and the venue.",
  },
  {
    key: "what_happened",
    multiline: true,
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
    script: "What was the exact date of the accident?",
    kind: "date",
    note: "Get the real date, not a rough guess. The statute of limitations runs from this day and the firm calculates deadlines off it.",
  },
  {
    key: "incident_time",
    script: "And roughly what time of day was it?",
    kind: "time",
    note: "Close enough is fine. Police pull reports by date AND time, so an approximate hour still narrows it.",
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
  // -------------------------------------------------------------- added capture
  // Data-capture and marketing questions. None of these feed the SIGN/REFER/DQ
  // math in engine.ts — they are recorded on the file and flow to the paperwork.
  {
    key: "how_found_us",
    script: "Before we dig in, can you tell me how you found us?",
    note: "Marketing attribution. Tap what they say — do not read the list.",
    kind: "single",
    options: [
      { value: "ref_attorney",  label: "Referral from an attorney" },
      { value: "online",        label: "Online search engine" },
      { value: "ai",            label: "AI search" },
      { value: "ref_friend",    label: "Referral from a friend" },
      { value: "ref_firm",      label: "Referral from an outside firm" },
      { value: "ref_marketing", label: "Referral from a marketing source" },
      { value: "return",        label: "Return client" },
      { value: "other",         label: "Other" },
    ],
  },
  {
    key: "referral_source",
    label: "Agent — name or company of the referring source (if known)",
    script: "",
    kind: "text",
    note: "Capture who referred them — the attorney, friend, firm, or marketing source by name or company. If unknown, type unknown.",
  },
  {
    key: "collision_type",
    script: "What type of collision was it?",
    note: "Tap the closest match to what they described. Do not read the list.",
    kind: "single",
    options: [
      { value: "rear_end", label: "Rear-end" },
      { value: "head_on",  label: "Head-on" },
      { value: "side",     label: "Side / T-bone" },
      { value: "rollover", label: "Rollover" },
      { value: "multi",    label: "Multi-vehicle" },
      { value: "hit_run",  label: "Hit and run" },
    ],
  },
  {
    key: "treatment_followup",
    script: "Did the doctor suggest any follow-up treatment?",
    note: "Only asked once they have actually been seen. A recommended course of care strengthens the file.",
    kind: "single",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "auto_policy_id",
    script: "Can you read me your auto policy ID number?",
    kind: "text",
    note: "Their own policy number. If they do not have it on hand, type unknown and we will get it later.",
  },
  {
    key: "others_in_vehicle",
    script: "Was there anyone else in the vehicle with you?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  },
  {
    key: "others_names",
    script: "What are their names?",
    kind: "text",
    note: "List everyone else who was in the vehicle.",
  },
  {
    key: "others_injured",
    script: "Did anyone else in the vehicle get injured?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  },
  {
    key: "others_injured_contact",
    script: "Can I get their name and a good phone number for them?",
    kind: "text",
    note: "Name and phone for each injured passenger. These are potential additional clients — capture them cleanly.",
  },
  {
    key: "others_need_help",
    script: "Do they need us to help them as well?",
    kind: "single",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "ins_forms",
    script: "Have you been given any forms to sign by any insurance company?",
    kind: "single",
    options: [
      { value: "yes",    label: "Yes" },
      { value: "no",     label: "No" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "ins_forms_signed",
    script: "Did you sign them?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  },
  {
    key: "ins_forms_said",
    script: "What did they tell you when they gave you those forms?",
    multiline: true,
    kind: "text",
    note: "Capture what the insurer said. A signed release or recorded-statement authorization can affect the claim — flag it for the case manager.",
  },
  CASE_MANAGER_NOTES_Q,
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
  WILLING_MORE_Q,
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
  CASE_MANAGER_NOTES_Q,
];

// ---------------------------------------------------------------- EVERYTHING ELSE
// Brief capture only. No criteria, no screening, no agent judgment.

// ---------------------------------------------------------------- CRIMINAL
// The firm's own written list, verbatim. Brief capture: enough to route it to
// the right attorney in the network, not a full screening.
export const CRIMINAL_QUESTIONS: Question[] = [
  {
    key: "what_happened",
    multiline: true,
    script: "Tell me what is going on, and I will get this over to the right attorney in our network.",
    kind: "text",
    note: "Outline only. Do not ask them to explain or justify anything.",
  },
  { key: "incident_date", script: "What date did this happen?", kind: "date" },
  { key: "charges", script: "What charges or accusations are you facing?", kind: "text" },
  {
    key: "court_date",
    script: "Do you have a scheduled court date or any pending deadlines?",
    kind: "text",
    note: "If there is a date inside a week, say so in your notes. It changes how fast this has to move.",
  },
  {
    key: "law_enforcement_contact",
    script: "Were you arrested, questioned, or searched by law enforcement?",
    kind: "single",
    options: [
      { value: "arrested",  label: "Arrested" },
      { value: "questioned", label: "Questioned" },
      { value: "searched",  label: "Searched" },
      { value: "multiple",  label: "More than one of these" },
      { value: "none",      label: "None of these" },
    ],
  },
  {
    key: "agency",
    script: "Which law enforcement agency was involved?",
    kind: "text",
    note: "State police, park police, DEA, city police, sheriff. Their words are fine.",
  },
  {
    key: "represented",
    script: "Do you have, or have you previously had, an attorney for this case?",
    kind: "single",
    options: [
      { value: "no",      label: "No" },
      { value: "current", label: "Yes, currently represented", note: "Do not ask who; do not comment on the other firm" },
      { value: "past",    label: "Had one before, not now" },
    ],
  },
  { key: "state", script: "And what state is this in?", kind: "text" },
  CASE_MANAGER_NOTES_Q,
];

// ---------------------------------------------------------------- FAMILY LAW
export const FAMILY_QUESTIONS: Question[] = [
  {
    key: "what_happened",
    multiline: true,
    script: "Tell me a little about what is going on, and I will get this to the right attorney in our network.",
    kind: "text",
    note: "Outline only. This is often a hard call for them. Let them talk, do not push for detail.",
  },
  { key: "state",  script: "What state do you need legal help in?", kind: "text" },
  { key: "county", script: "And what county do you live in?", kind: "text" },
  { key: "began",  script: "About when did this issue begin?", kind: "text", note: "Approximate is fine." },
  {
    key: "matter_type",
    script: "What is the main reason you are looking for representation today?",
    kind: "single",
    options: [
      { value: "divorce",     label: "Divorce or dissolution" },
      { value: "separation",  label: "Legal separation" },
      { value: "custody",     label: "Child custody" },
      { value: "parenting",   label: "Parenting time or visitation" },
      { value: "child_support", label: "Child support" },
      { value: "spousal",     label: "Spousal support or alimony" },
      { value: "modification", label: "Modifying an existing order" },
      { value: "contempt",    label: "Contempt or enforcement" },
      { value: "paternity",   label: "Paternity" },
      { value: "adoption",    label: "Adoption" },
      { value: "guardianship", label: "Guardianship" },
      { value: "prenup",      label: "Prenuptial or postnuptial agreement" },
      { value: "dv",          label: "Domestic violence or protective order", note: "Handle gently. Ask if they are safe to talk right now" },
      { value: "property",    label: "Property division" },
      { value: "other",       label: "Something else" },
    ],
  },
  {
    key: "other_side_counsel",
    script: "Has the other party already hired an attorney?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }],
  },
  {
    key: "minor_children",
    script: "Are there minor children involved?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  },
  {
    key: "existing_orders",
    script: "Is there already a custody, parenting, or child support order in place?",
    kind: "single",
    options: [
      { value: "custody",  label: "Custody or parenting plan" },
      { value: "support",  label: "Child support order" },
      { value: "both",     label: "Both" },
      { value: "none",     label: "Neither" },
      { value: "unsure",   label: "Not sure" },
    ],
  },
  {
    key: "case_filed",
    script: "Has a court case already been filed?",
    kind: "single",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }],
  },
  { key: "goal", script: "What are you hoping to get out of this?", kind: "text", multiline: true },
  {
    key: "represented",
    script: "Are you working with an attorney on this already?",
    kind: "single",
    options: [
      { value: "no", label: "No" },
      { value: "yes_satisfied", label: "Yes, and happy with them", note: "Disqualifier. Wish them well" },
      { value: "yes_unhappy",   label: "Yes, but looking to change" },
    ],
  },
  CASE_MANAGER_NOTES_Q,
];

export const BRIEF_QUESTIONS: Question[] = [
  {
    key: "what_happened",
    multiline: true,
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
  CASE_MANAGER_NOTES_Q,
];

export const CASE_TYPES: { key: CaseTypeKey; label: string; sub: string }[] = [
  { key: "motel_trafficking", label: "Motel 6 / trafficking", sub: "Full intake" },
  { key: "mva",       label: "Auto accident",          sub: "Full screening" },
  { key: "prem",        label: "Slip / fall / premises",  sub: "Full screening" },
  { key: "employment", label: "Employment",              sub: "Brief capture" },
  { key: "family",     label: "Family",                  sub: "Brief capture" },
  { key: "criminal",   label: "Criminal",                sub: "Brief capture" },
  { key: "contract",   label: "Contract / business",     sub: "Brief capture" },
  { key: "other",      label: "Other",                   sub: "Brief capture" },
];

// ---------------------------------------------------------------- ASK ORDER
// The order questions are ASKED is not the order they print. This sequence is
// built to kill a bad file fast: the story, then the date and the state, then
// injury and treatment. A wreck from last year where nobody ever treated is
// disqualified inside the first ten questions instead of the last five, so the
// agent stops burning call time on a file that was never going to sign.
//
// State rides with the date because it drives the statute of limitations.
// Anything a question does not depend on gets asked later.
const AUTO_ASK_ORDER = [
  "authority", "poa", "role", "attorney",
  "how_found_us", "referral_source",
  "what_happened", "collision_type", "agent_read",
  "date", "incident_time", "incident_city_state",
  "injured", "symptoms_ongoing", "treatment", "treatment_followup", "willing", "willing_more",
  "injuries", "surgery", "hosp",
  "fault", "police_report", "police_agency", "police_report_number", "citations", "commercial", "settled", "bills",
  "ins_other", "ins_own", "auto_policy_id", "ins_uim",
  "others_in_vehicle", "others_names", "others_injured", "others_injured_contact", "others_need_help",
  "ins_forms", "ins_forms_signed", "ins_forms_said",
  "case_manager_notes",
];

const GPI_ASK_ORDER = [
  "presence", "what_happened", "agent_read",
  "date", "incident_time", "incident_city_state",
  "injured", "symptoms_ongoing", "treatment", "willing", "willing_more",
  "injuries", "surgery", "bills",
  "case_manager_notes",
];

function inAskOrder(qs: Question[], order: string[]): Question[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  // Anything missing from the order list keeps its original position at the end
  // rather than vanishing, so adding a question can never silently drop it.
  return [...qs].sort((a, b) => (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999));
}

export function questionsFor(caseType: CaseTypeKey): Question[] {
  if (caseType === "mva") return inAskOrder(AUTO_QUESTIONS, AUTO_ASK_ORDER);
  if (caseType === "prem") return inAskOrder(GPI_QUESTIONS, GPI_ASK_ORDER);
  if (caseType === "criminal") return CRIMINAL_QUESTIONS;
  if (caseType === "family") return FAMILY_QUESTIONS;
  return BRIEF_QUESTIONS;
}

export function questionByKey(caseType: CaseTypeKey, key: string): Question | undefined {
  return questionsFor(caseType).find((q) => q.key === key);
}
