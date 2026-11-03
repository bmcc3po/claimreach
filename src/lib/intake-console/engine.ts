// ============================================================================
// Intake routing engine. Pure functions, no React and no Supabase, so the
// decision trees can be exercised on their own. Everything here is the LOCKED
// tree approved by the firm — change it only against a new approved spec.
// ============================================================================
import { INJURY_OPTIONS, questionsFor } from "./questions";
import type { FirmConsoleConfig } from "./config";

export type Disposition = "SIGN" | "REFER" | "DISQUALIFY" | "SECONDARY_REVIEW" | "CALLBACK" | "TRANSFER";
export type CaseTypeKey = "mva" | "prem" | "employment" | "family" | "criminal" | "contract" | "other" | "motel_trafficking";
export type CallType = "new_potential" | "existing" | "non_client" | "not_legal";
export type Answers = Record<string, any>;

export interface Outcome {
  disposition: Disposition;
  reason: string;
  flags: string[];
  closeKey?: string;   // selects the matched close script
}

const isFull = (t: CaseTypeKey) => t === "mva" || t === "prem";

// ---------------------------------------------------------------- skip logic
// The date question now captures a REAL date, not a bucket, because a statute of
// limitations cannot be computed from "31 days to under 9 months" and neither
// can a demand letter. The criteria still think in buckets, so derive one.
// Accepts a legacy bucket value so old files keep evaluating.
export function dateBucket(v: any): "le30" | "mid" | "old" | undefined {
  if (!v) return undefined;
  if (v === "le30" || v === "mid" || v === "old") return v;
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return undefined;
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days <= 30) return "le30";
  if (days < 274) return "mid";      // roughly nine months
  return "old";
}

const REPORT_ONLY = new Set(["police_agency", "police_report_number"]);
// "How did you find us" values that have a name or company worth capturing. A
// plain online/AI search or a return client has no referring source to ask for.
const REFERRAL_SOURCES = new Set(["ref_attorney", "ref_friend", "ref_firm", "ref_marketing", "other"]);

export function questionApplies(caseType: CaseTypeKey, key: string, a: Answers): boolean {
  if (caseType === "mva") {
    if (key === "poa") return a.authority === "alive";
    if (["injuries", "surgery", "hosp", "treatment", "bills"].includes(key)) return a.injured === "yes";
    // No report means there is no agency or number to ask about.
    if (REPORT_ONLY.has(key)) return a.police_report === "yes";
    // Only worth asking once a course of care has ended.
    if (key === "willing_more") return a.injured === "yes" && (a.treatment === "finished" || a.treatment === "stopped");
    if (key === "willing") return a.injured === "yes" && a.treatment === "never";
    // The commitment only matters for someone who has never been seen, says
    // they will go, AND is past the thirty day window. Anyone already treating
    // has proved it, and inside thirty days any real injury qualifies anyway,
    // so asking there would be a question whose answer cannot change anything.
    if (key === "commit_appointment")
      return a.injured === "yes" && a.treatment === "never" && a.willing === "yes"
        && dateBucket(a.date) === "mid";
    // Follow-up care is only meaningful once they have actually been seen.
    if (key === "treatment_followup") return a.injured === "yes" && !!a.treatment && a.treatment !== "never";
    // Name/company of the referrer only when there is one to name.
    if (key === "referral_source") return REFERRAL_SOURCES.has(a.how_found_us);
    // Their own policy number only if they carry insurance.
    if (key === "auto_policy_id") return a.ins_own === "yes";
    // Passenger tree: names/injury only if there were passengers; contact and
    // the "help them too" ask only if a passenger was actually hurt.
    if (key === "others_names" || key === "others_injured") return a.others_in_vehicle === "yes";
    if (key === "others_injured_contact" || key === "others_need_help") return a.others_injured === "yes";
    // Insurance-forms tree: did-you-sign only if they were given forms; what did
    // they say only once they actually signed.
    if (key === "ins_forms_signed") return a.ins_forms === "yes";
    if (key === "ins_forms_said") return a.ins_forms_signed === "yes";
    // Dual-rep Q2/Q3 are not asked once current representation already ended the file.
    if (key === "attorney_consult" || key === "pending_legal") return a.attorney !== "yes";
    return true;
  }
  if (caseType === "prem") {
    if (["injuries", "surgery", "treatment", "bills"].includes(key)) return a.injured === "yes";
    // No report means there is no agency or number to ask about.
    if (REPORT_ONLY.has(key)) return a.police_report === "yes";
    // Only worth asking once a course of care has ended.
    if (key === "willing_more") return a.injured === "yes" && (a.treatment === "finished" || a.treatment === "stopped");
    if (key === "willing") return a.injured === "yes" && a.treatment === "never";
    // The commitment only matters for someone who has never been seen, says
    // they will go, AND is past the thirty day window. Anyone already treating
    // has proved it, and inside thirty days any real injury qualifies anyway,
    // so asking there would be a question whose answer cannot change anything.
    if (key === "commit_appointment")
      return a.injured === "yes" && a.treatment === "never" && a.willing === "yes"
        && dateBucket(a.date) === "mid";
    return true;
  }
  return true;
}

function firstBlank(caseType: CaseTypeKey, a: Answers, rail: "qualify" | "details" | "all"): string | null {
  for (const q of questionsFor(caseType, rail)) {
    if (!questionApplies(caseType, q.key, a)) continue;
    const v = a[q.key];
    const blank = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (blank) return q.key;
  }
  return null;
}

// Next unanswered QUALIFY question. Details never live on this rail — evaluate()
// uses this, so police report / occupants / how-found cannot block a signature.
export function nextQuestionKey(caseType: CaseTypeKey, a: Answers): string | null {
  return firstBlank(caseType, a, caseType === "mva" ? "qualify" : "all");
}

// Next unanswered DETAILS question. Asked after CONTRACT / signature.
export function nextDetailQuestionKey(caseType: CaseTypeKey, a: Answers): string | null {
  if (caseType !== "mva") return null;
  return firstBlank(caseType, a, "details");
}

// ---------------------------------------------------------------- injuries
function injuryList(a: Answers): string[] {
  return Array.isArray(a.injuries) ? a.injuries : [];
}
export function hasSeriousInjury(a: Answers): boolean {
  const sel = injuryList(a);
  return INJURY_OPTIONS.some((i) => i.serious && sel.includes(i.value));
}
export function isCatastrophic(a: Answers): boolean {
  const sel = injuryList(a);
  if (INJURY_OPTIONS.some((i) => i.catastrophic && sel.includes(i.value))) return true;
  if (a.surgery === "yes") return true;
  if (a.hosp === "long") return true;
  return false;
}

// Override sits above everything, including a disqualifier.
export function computeFlags(caseType: CaseTypeKey, a: Answers): string[] {
  const f: string[] = [];
  if (caseType === "mva" && a.commercial === "yes") f.push("commercial vehicle");
  if (isCatastrophic(a)) f.push("catastrophic injury");
  if (a.hosp === "long") f.push("hospitalized more than 3 days");
  return f;
}

function billsAtLeast(bills: any, threshold: number): boolean {
  // Buckets straddle both retainer lines so neither number is ever spoken.
  if (bills === "over_50k") return true;
  if (bills === "10k_50k") return threshold <= 10000;
  return false;
}

// ---------------------------------------------------------------- terminals
// Fire the moment the answer lands, ending the call flow on the spot.
export function terminalOutcome(caseType: CaseTypeKey, a: Answers): Outcome | null {
  if (caseType === "mva") {
    if (a.authority === "deceased")
      return { disposition: "SECONDARY_REVIEW", reason: "Wrongful death, set aside for the firm", flags: [], closeKey: "wrongful_death" };
    if (a.poa === "no")
      return { disposition: "CALLBACK", reason: "Caller has no authority for the injured person", flags: [], closeKey: "no_authority" };
    if (a.attorney === "yes")
      return { disposition: "DISQUALIFY", reason: "Already has an attorney for this accident", flags: [], closeKey: "attorney" };
  }

  // Gates that end the call the moment they are answered, on any case type.
  //
  // These were all checked at the END, after every remaining question had been
  // asked, which made putting them first pointless: the agent worked the whole
  // intake and only then found out the file was dead. A gate that does not stop
  // the call is not a gate, it is a field.
  //
  // Two things they must NOT do, both learned from the tests:
  //
  // A flag does not lose its override. A catastrophic injury or a commercial
  // vehicle sends a would-be disqualification to a human instead, and a gate
  // firing earlier must not skip that. The wrong answer on fault is exactly the
  // kind of thing a supervisor should see on a file with a serious injury.
  //
  // Old is a REFER, not a disqualification. A case past the window is still
  // worth something to the network, and calling it dead throws that away.
  {
    const flags = computeFlags(caseType, a);
    const end = (reason: string, closeKey: string): Outcome =>
      flags.length > 0
        ? { disposition: "SECONDARY_REVIEW", reason: `${reason}, but the file carries a flag`, flags, closeKey: "elevated" }
        : { disposition: "DISQUALIFY", reason, flags, closeKey };

    if (a.settled === "yes") return end("Already settled or signed a release with an insurer", "settled");
    if (a.fault === "caused") return end("The caller caused the accident", "at_fault");
    if (a.premises_fault === "no") return end("Not caused by an unsafe condition on someone else's property", "no_liability");
    if (a.dog_owner === "own") return end("It was the caller's own dog", "own_dog");
    if (a.injured === "no" || a.injured === "property_only") return end("No injuries, property damage only", "no_injury");
    if (a.injured === "unwilling") return end("Injured but unwilling to be seen by a doctor", "wont_treat");

    // Dog bite is exempt: a minor's time to file has not started, so an older
    // bite on a child is still live. Checked on both keys because the door sets
    // one and the derivation sets the other.
    const isDogBite = String(a.what_happened_type ?? "") === "dog" || String(a.case_subtype ?? "") === "dogbite";
    if (dateBucket(a.date) === "old" && !isDogBite)
      return { disposition: "REFER", reason: "Incident is more than 9 months old", flags, closeKey: "sol" };
  }

  return null;
}

// ---------------------------------------------------------------- final
function autoOutcome(a: Answers, cfg: FirmConsoleConfig): Outcome {
  const flags = computeFlags("mva", a);
  const override = flags.length > 0;

  let dq: string | null = null;
  let closeKey = "";
  if (a.injured === "no") { dq = "No injuries"; closeKey = "no_injury"; }
  else if (a.fault === "caused") { dq = "Caller caused the accident"; closeKey = "caused"; }
  else if (a.settled === "yes") { dq = "Already settled or signed a release"; closeKey = "settled"; }
  else if (a.injured === "yes" && a.treatment === "never" && a.willing === "no") { dq = "Unwilling to seek treatment"; closeKey = "wont_treat"; }

  if (dq) {
    if (override) return { disposition: "SECONDARY_REVIEW", reason: `${dq}, elevated by ${flags.join(", ")}`, flags, closeKey: "elevated" };
    return { disposition: "DISQUALIFY", reason: dq, flags, closeKey };
  }

  // Nobody to recover from. A definite no on all three coverage questions is the
  // only version of this that blocks a signature: "not sure" is never treated as
  // a no, because coverage nobody knew about is exactly what rescues these files
  // (an unsigned UIM waiver turned a dead claim into a six-figure policy).
  if (a.ins_other === "no" && a.ins_own === "no" && a.ins_uim === "no") {
    if (override)
      return { disposition: "SECONDARY_REVIEW", reason: `No coverage on any of the three, elevated by ${flags.join(", ")}`, flags, closeKey: "elevated" };
    return { disposition: "REFER", reason: "No insurance on the other driver, the caller, or UIM", flags, closeKey: "no_coverage" };
  }

  if (dateBucket(a.date) === "le30") return { disposition: "SIGN", reason: "Within 30 days, injured, treated or willing", flags };
  if (dateBucket(a.date) === "mid") {
    if (a.treatment === "still") return { disposition: "SIGN", reason: "Over 30 days, still treating", flags };
    if (hasSeriousInjury(a) && a.treatment === "finished")
      return { disposition: "SIGN", reason: "Over 30 days, serious injury, finished treating", flags };
    // Never treated but willing. Willingness alone is not a qualifier past the
    // thirty day window: there are no bills and no records, so the whole file
    // rests on whether they actually attend the appointment the firm books. A
    // refusal to commit is the file telling you now instead of in three weeks.
    if (a.treatment === "never" && a.willing === "yes") {
      if (a.commit_appointment === "no")
        return { disposition: "REFER", reason: "Over 30 days, never treated, would not commit to the appointment", flags };
      if (a.commit_appointment === "yes" && hasSeriousInjury(a))
        return { disposition: "SIGN", reason: "Over 30 days, serious injury, committed to the appointment", flags };
    }
    if (billsAtLeast(a.bills, cfg.autoBillsThreshold))
      return { disposition: "SIGN", reason: "Over 30 days, medical bills over the retainer line", flags };
    return { disposition: "REFER", reason: "Over 30 days, does not meet a retainer line", flags };
  }
  return { disposition: "REFER", reason: "Accident is 9 months old or older", flags };
}


// ---------------------------------------------------------------- dog bite
// A dog bite is not screened like the rest of personal injury and running it
// through that screen gets the answer wrong in both directions. There is no
// bills test and no treatment test: a bite that needed one urgent care visit
// and left a facial scar is a better case than one with months of therapy and
// no mark. The qualifier is permanent scarring, or corrective surgery in place
// of it.
//
// The nine month window also works differently. A minor's time to file is
// tolled until they turn eighteen, so an older bite on a child is still live
// where the same bite on an adult is time barred. Our date bucket has no idea
// how old the claimant is, which is why this has to be checked here.
//
// Reads the questions the dog bite branch already asks. Nothing new to capture.
function dogBiteOutcome(a: Answers, cfg: FirmConsoleConfig): Outcome {
  const flags = computeFlags("prem", a);
  const scars = String(a.dogbite_are_there_visible_scars_or_marks ?? "");
  const childBitten = String(a.dogbite_was_a_child_bitten ?? "") === "yes"
    || String(a.authority ?? "") === "alive" && String(a.ip_adult ?? "") === "no";

  if (a.attorney === "yes")
    return { disposition: "DISQUALIFY", reason: "Already represented", flags, closeKey: "represented" };
  if (a.settled === "yes")
    return { disposition: "DISQUALIFY", reason: "Claim already settled", flags, closeKey: "settled" };

  // Past nine months, only a minor survives, because their clock has not
  // started. An adult that far out is time barred and no amount of scarring
  // changes it.
  if (dateBucket(a.date) === "old" && !childBitten)
    return { disposition: "DISQUALIFY", reason: "Bite is more than 9 months old and the victim is an adult", flags, closeKey: "sol" };

  // Scarring is the whole test. Too early to tell is not a no: a bite two weeks
  // old has not finished healing, and disqualifying it would throw away a case
  // that has not happened yet.
  if (scars === "too_early_to_tell" || scars === "")
    return { disposition: "SECONDARY_REVIEW", reason: "Scarring not yet known, worth a look once it has healed", flags, closeKey: "elevated" };
  if (scars === "no")
    return { disposition: "DISQUALIFY", reason: "No permanent scarring or mark from the bite", flags, closeKey: "no_scarring" };

  // A facial or neck scar is the strongest version of this case.
  if (scars === "yes_on_the_face_or_neck")
    return { disposition: "SIGN", reason: "Permanent scarring to the face or neck", flags: [...flags, "facial scarring"] };
  return { disposition: "SIGN", reason: "Permanent scarring or mark from the bite", flags };
}

function gpiOutcome(a: Answers, cfg: FirmConsoleConfig): Outcome {
  const flags = computeFlags("prem", a);
  const override = flags.length > 0;
  const elevate = (reason: string, closeKey: string): Outcome =>
    override
      ? { disposition: "SECONDARY_REVIEW", reason: `${reason}, elevated by ${flags.join(", ")}`, flags, closeKey: "elevated" }
      : { disposition: "DISQUALIFY", reason, flags, closeKey };

  if (a.presence === "no")
    return { disposition: "DISQUALIFY", reason: "No lawful right to be where the incident happened", flags, closeKey: "presence" };
  if (a.injured === "no") return elevate("No injuries", "no_injury");
  if (a.injured === "yes" && a.treatment === "never" && a.willing === "no")
    return elevate("Unwilling to seek treatment", "wont_treat");

  // Nobody to recover from. A definite no on all three coverage questions is the
  // only version of this that blocks a signature: "not sure" is never treated as
  // a no, because coverage nobody knew about is exactly what rescues these files
  // (an unsigned UIM waiver turned a dead claim into a six-figure policy).
  if (a.ins_other === "no" && a.ins_own === "no" && a.ins_uim === "no") {
    if (override)
      return { disposition: "SECONDARY_REVIEW", reason: `No coverage on any of the three, elevated by ${flags.join(", ")}`, flags, closeKey: "elevated" };
    return { disposition: "REFER", reason: "No insurance on the other driver, the caller, or UIM", flags, closeKey: "no_coverage" };
  }

  if (dateBucket(a.date) === "le30") return { disposition: "SIGN", reason: "Within 30 days, injured, treated or willing", flags };
  if (a.treatment === "still") return { disposition: "SIGN", reason: "Still treating", flags };
  if ((a.treatment === "stopped" || a.treatment === "finished") && billsAtLeast(a.bills, cfg.gpiBillsThreshold))
    return { disposition: "SIGN", reason: "Treatment concluded, medical bills over the retainer line", flags };
  return { disposition: "REFER", reason: "Does not meet a retainer line", flags };
}

function briefOutcome(a: Answers): Outcome {
  if (a.represented === "yes_satisfied")
    return { disposition: "DISQUALIFY", reason: "Represented and satisfied with current counsel", flags: [], closeKey: "attorney" };
  return { disposition: "REFER", reason: "Outside the firm's retained case types, routed to the network", flags: [] };
}


// ---------------------------------------------------------------- venue
// A firm can only take a case it can actually file. TMT works New Mexico,
// Kentucky and Tennessee; anything outside that is worked in full and referred
// to the network rather than signed.
//
// This runs AFTER the case-type outcome, and only ever downgrades a SIGN. A
// disqualifier stays a disqualifier: venue does not rescue a file that failed on
// its merits, and a file that already needs a human keeps needing one.
//
// Venue follows the INCIDENT, not where the client lives. Someone who lives in
// Nevada and was hit in Tennessee is a Tennessee case.
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

// The agent captures "Las Vegas, NV" through the Google picker, but a typed
// answer can be anything. Returns a 2-letter code, or null when we genuinely
// cannot tell, which is a different situation from being out of venue.
export function incidentState(a: Answers): string | null {
  const raw = String(a.incident_city_state ?? a.state ?? "").trim();
  if (!raw) return null;
  const tail = raw.includes(",") ? raw.split(",").pop()!.trim() : raw;
  const bare = tail.replace(/[^A-Za-z ]/g, "").trim();
  if (/^[A-Za-z]{2}$/.test(bare)) {
    const up = bare.toUpperCase();
    return Object.values(STATE_ABBR).includes(up) ? up : null;
  }
  return STATE_ABBR[bare.toLowerCase()] ?? null;
}

export function applyVenue(o: Outcome, a: Answers, cfg: FirmConsoleConfig): Outcome {
  const allowed = cfg.venueStates;
  if (!allowed || allowed.length === 0) return o;   // firm works everywhere
  if (o.disposition !== "SIGN") return o;           // only ever downgrades a sign

  const st = incidentState(a);
  if (!st) {
    // Unreadable venue is not the same as out of venue. Signing it would be
    // guessing, and disqualifying it would throw away a live case, so a human
    // looks at it.
    return {
      ...o,
      disposition: "SECONDARY_REVIEW",
      reason: `${o.reason}, but the incident state could not be read`,
      flags: [...o.flags, "venue unconfirmed"],
      closeKey: "elevated",
    };
  }
  if (allowed.includes(st)) return o;

  return {
    ...o,
    disposition: "REFER",
    reason: `Qualifies on the merits, but the incident was in ${st}, outside the firm's venue`,
    flags: [...o.flags, `out of venue: ${st}`],
    closeKey: "out_of_venue",
  };
}

export function finalOutcome(caseType: CaseTypeKey, a: Answers, cfg: FirmConsoleConfig): Outcome {
  // The subtype decides the screen before the case type does. Everything under
  // the personal injury door shares one form, but a dog bite does not qualify
  // the way a slip and fall does, so one screen over both gets it wrong in
  // both directions: it drops a facial scar that cost nothing to treat, and it
  // signs months of therapy that left no mark.
  const base = String(a.case_subtype ?? "") === "dogbite" ? dogBiteOutcome(a, cfg)
             : caseType === "mva" ? autoOutcome(a, cfg)
             : caseType === "prem" ? gpiOutcome(a, cfg)
             : briefOutcome(a);
  return applyVenue(base, a, cfg);
}

// Terminal first, then the full tree once every applicable question is answered.
export function evaluate(caseType: CaseTypeKey, a: Answers, cfg: FirmConsoleConfig): Outcome | null {
  const t = terminalOutcome(caseType, a);
  if (t) return t;
  if (nextQuestionKey(caseType, a) !== null) return null;
  return finalOutcome(caseType, a, cfg);
}

// ---------------------------------------------------------------- summary
const LABEL: Record<string, Record<string, string>> = {
  authority: { self: "Caller is the injured party", alive: "Calling on behalf of a living injured party", deceased: "Injured party is deceased" },
  commercial: { yes: "Commercial vehicle involved", no: "Personal vehicle", unknown: "Vehicle type unknown" },
  fault: { other: "Other driver at fault per caller", caused: "Caller states they caused it", shared: "Shared fault per caller", unsure: "Fault unclear per caller" },
  date: { le30: "Within the last 30 days", mid: "31 days to under 9 months old", old: "9 months or older" },
  treatment: { treated: "Seen once", still: "Still treating", finished: "Finished treatment", stopped: "Stopped treating", never: "Has not been seen" },
  hosp: { no: "Not hospitalized overnight", short: "Hospitalized 1 to 2 nights", long: "Hospitalized 3 or more days" },
  bills: { none: "No bills yet", under_10k: "Bills under $10,000", "10k_50k": "Bills $10,000 to $50,000", over_50k: "Bills over $50,000", unknown: "Bills unknown" },
  presence: { yes: "Lawfully present", no: "No lawful right to be there" },
  represented: { no: "Not currently represented", yes_satisfied: "Represented and satisfied", yes_unsatisfied: "Represented but unsatisfied" },
  collision_type: { rear_end: "Rear-end collision", head_on: "Head-on collision", side: "Side / T-bone collision", rollover: "Rollover", multi: "Multi-vehicle collision", hit_run: "Hit and run" },
  how_found_us: { ref_attorney: "Source: attorney referral", online: "Source: online search", ai: "Source: AI search", ref_friend: "Source: friend referral", ref_firm: "Source: outside-firm referral", ref_marketing: "Source: marketing", return: "Source: return client", other: "Source: other" },
  attorney_consult: { yes: "Consulted an attorney on this claim (unsigned)", no: "No prior attorney consult on this claim" },
  pending_legal: { yes: "Pending lawsuit, legal action, or settlement process", no: "No pending lawsuit or settlement process" },
};

export function buildSummary(caseType: CaseTypeKey, a: Answers, outcome: Outcome, firstName?: string): string {
  const parts: string[] = [];
  const who = firstName ? firstName : "Caller";
  const typeLabel = caseType === "mva" ? "Auto accident" : caseType === "prem" ? "Premises / slip and fall" : caseType.replace(/^\w/, (c) => c.toUpperCase());
  parts.push(`${typeLabel}. ${who}.`);

  const push = (k: string) => { const v = a[k]; if (v && LABEL[k]?.[v]) parts.push(LABEL[k][v]); };
  push("authority"); push("presence"); push("date"); push("commercial"); push("collision_type"); push("fault");

  if (a.injured === "no") parts.push("No injuries reported");
  else if (a.injured === "yes") {
    const sel = injuryList(a).map((v) => INJURY_OPTIONS.find((i) => i.value === v)?.label).filter(Boolean);
    if (sel.length) parts.push(`Injuries: ${sel.join(", ")}`);
    if (a.surgery === "yes") parts.push("Surgery done or recommended");
    push("hosp"); push("treatment"); push("bills");
    if (a.treatment_followup === "yes") parts.push("Doctor recommended follow-up care");
    if (a.treatment === "never") parts.push(a.willing === "yes" ? "Willing to be seen" : "Unwilling to be seen");
  }
  if (a.settled === "yes") parts.push("Already settled or signed a release");
  push("represented");
  push("attorney_consult");
  push("pending_legal");
  if (a.what_happened) parts.push(`Caller states: ${a.what_happened}`);
  if (a.incident_date) parts.push(`Incident date: ${a.incident_date}`);
  if (a.state) parts.push(`State: ${a.state}`);

  // Marketing attribution and passenger / insurance-forms capture.
  push("how_found_us");
  if (a.referral_source && REFERRAL_SOURCES.has(a.how_found_us)) parts.push(`Referred by: ${a.referral_source}`);
  if (a.others_injured === "yes") parts.push(`Passenger injured${a.others_injured_contact ? `: ${a.others_injured_contact}` : ""}`);
  if (a.ins_forms === "yes") parts.push(a.ins_forms_signed === "yes" ? "SIGNED insurance forms — review" : "Given insurance forms, unsigned");
  if (a.case_manager_notes) parts.push(`Agent notes: ${a.case_manager_notes}`);

  parts.push(`Outcome: ${outcome.disposition.replace("_", " ")} — ${outcome.reason}`);
  if (outcome.flags.length) parts.push(`Flags: ${outcome.flags.join(", ")}`);
  return parts.join(". ").replace(/\.\./g, ".");
}

// registryKeyFor used to live here. It mapped a hardcoded picker value onto a
// real campaign key, which was only ever necessary because the picker was a
// list in code rather than the firm's campaigns. The picker now returns the
// campaign's own case_type, so there is nothing left to map.


// Modifiers are what makes THIS file different inside its type. They are derived
// from answers the agent already gave, never asked as extra questions, so the
// approved script does not change.
export function modifiersFor(caseType: CaseTypeKey, a: Answers): string[] {
  const m = new Set<string>();
  if (caseType === "mva" && a.commercial === "yes") m.add("cmv");
  if (a.authority === "deceased") m.add("wrongful_death");
  if (Array.isArray(a.injuries) && a.injuries.includes("head")) m.add("tbi");
  if (Array.isArray(a.injuries) && a.injuries.includes("death")) m.add("wrongful_death");
  if (isCatastrophic(a)) m.add("catastrophic");
  if (a.hosp === "long") m.add("hospitalized");
  return [...m];
}
