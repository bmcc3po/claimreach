// ============================================================================
// Intake routing engine. Pure functions, no React and no Supabase, so the
// decision trees can be exercised on their own. Everything here is the LOCKED
// tree approved by the firm — change it only against a new approved spec.
// ============================================================================
import { INJURY_OPTIONS, questionsFor } from "./questions";
import type { FirmConsoleConfig } from "./config";

export type Disposition = "SIGN" | "REFER" | "DISQUALIFY" | "SECONDARY_REVIEW" | "CALLBACK" | "TRANSFER";
export type CaseTypeKey = "mva" | "prem" | "employment" | "family" | "criminal" | "contract" | "other";
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

export function questionApplies(caseType: CaseTypeKey, key: string, a: Answers): boolean {
  if (caseType === "mva") {
    if (key === "poa") return a.authority === "alive";
    if (["injuries", "surgery", "hosp", "treatment", "bills"].includes(key)) return a.injured === "yes";
    // No report means there is no agency or number to ask about.
    if (REPORT_ONLY.has(key)) return a.police_report === "yes";
    if (key === "willing") return a.injured === "yes" && a.treatment === "never";
    return true;
  }
  if (caseType === "prem") {
    if (["injuries", "surgery", "treatment", "bills"].includes(key)) return a.injured === "yes";
    // No report means there is no agency or number to ask about.
    if (REPORT_ONLY.has(key)) return a.police_report === "yes";
    if (key === "willing") return a.injured === "yes" && a.treatment === "never";
    return true;
  }
  return true;
}

// Next unanswered applicable question, or null when the tree is exhausted.
export function nextQuestionKey(caseType: CaseTypeKey, a: Answers): string | null {
  for (const q of questionsFor(caseType)) {
    if (!questionApplies(caseType, q.key, a)) continue;
    const v = a[q.key];
    const blank = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (blank) return q.key;
  }
  return null;
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
    if (billsAtLeast(a.bills, cfg.autoBillsThreshold))
      return { disposition: "SIGN", reason: "Over 30 days, medical bills over the retainer line", flags };
    return { disposition: "REFER", reason: "Over 30 days, does not meet a retainer line", flags };
  }
  return { disposition: "REFER", reason: "Accident is 9 months old or older", flags };
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

export function finalOutcome(caseType: CaseTypeKey, a: Answers, cfg: FirmConsoleConfig): Outcome {
  if (caseType === "mva") return autoOutcome(a, cfg);
  if (caseType === "prem") return gpiOutcome(a, cfg);
  return briefOutcome(a);
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
};

export function buildSummary(caseType: CaseTypeKey, a: Answers, outcome: Outcome, firstName?: string): string {
  const parts: string[] = [];
  const who = firstName ? firstName : "Caller";
  const typeLabel = caseType === "mva" ? "Auto accident" : caseType === "prem" ? "Premises / slip and fall" : caseType.replace(/^\w/, (c) => c.toUpperCase());
  parts.push(`${typeLabel}. ${who}.`);

  const push = (k: string) => { const v = a[k]; if (v && LABEL[k]?.[v]) parts.push(LABEL[k][v]); };
  push("authority"); push("presence"); push("date"); push("commercial"); push("fault");

  if (a.injured === "no") parts.push("No injuries reported");
  else if (a.injured === "yes") {
    const sel = injuryList(a).map((v) => INJURY_OPTIONS.find((i) => i.value === v)?.label).filter(Boolean);
    if (sel.length) parts.push(`Injuries: ${sel.join(", ")}`);
    if (a.surgery === "yes") parts.push("Surgery done or recommended");
    push("hosp"); push("treatment"); push("bills");
    if (a.treatment === "never") parts.push(a.willing === "yes" ? "Willing to be seen" : "Unwilling to be seen");
  }
  if (a.settled === "yes") parts.push("Already settled or signed a release");
  push("represented");
  if (a.what_happened) parts.push(`Caller states: ${a.what_happened}`);
  if (a.incident_date) parts.push(`Incident date: ${a.incident_date}`);
  if (a.state) parts.push(`State: ${a.state}`);

  parts.push(`Outcome: ${outcome.disposition.replace("_", " ")} — ${outcome.reason}`);
  if (outcome.flags.length) parts.push(`Flags: ${outcome.flags.join(", ")}`);
  return parts.join(". ").replace(/\.\./g, ".");
}

// ---------------------------------------------------------------- registry
// The console picker is finer-grained than the case type registry: an agent
// picks "Employment" or "Family", but those are all one retained-nothing
// referral bucket as far as campaign and process go. The specific matter is
// still recorded on the call.
export function registryKeyFor(caseType: CaseTypeKey): string {
  if (caseType === "mva") return "mva";
  if (caseType === "prem") return "prem";
  return "referral";
}

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
