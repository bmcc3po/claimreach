// ============================================================================
// Call dispositions. One definition, shared by the call screen and the API.
//
// A dispo is how the call ended. It maps onto the existing claim status set
// (statuses table) so every report that reads status keeps working:
//   signed    -> no change here. The e-sign itself moves the status.
//   esign     -> esign_sent
//   dq        -> dq, with the first DQ reason as dq_reason_key
//   callback  -> contacting, with callback_at
//   ni        -> not_interested (reason key "declined")
//   dnc       -> dnc (reason key "dnc"), and contact permissions go off
//
// The "why" buttons are rows in call_dispo_reasons (esign, callback, ni) and
// dq_reasons (dq). Owners add more there; nothing here changes.
// ============================================================================

export const DISPO_CODES = ["signed", "esign", "dq", "callback", "ni", "dnc"] as const;
export type DispoCode = (typeof DISPO_CODES)[number];

export const DISPO_LABEL: Record<DispoCode, string> = {
  signed: "Signed",
  esign: "E-sign sent, not signed",
  dq: "Disqualified",
  callback: "Call back",
  ni: "Not interested",
  dnc: "Requested DNC",
};

export const DISPO_STATUS: Record<DispoCode, string | null> = {
  signed: null,
  esign: "esign_sent",
  dq: "dq",
  callback: "contacting",
  ni: "not_interested",
  dnc: "dnc",
};

/** The dq_reason_key a disqualify status needs when the agent does not pick one. */
export const DISPO_FIXED_DQ_KEY: Partial<Record<DispoCode, string>> = { ni: "declined", dnc: "dnc" };

export const NEEDS_REASON: DispoCode[] = ["esign", "dq", "callback", "ni"];

export interface Reason { key: string; label: string }

/** Fallback rows so the screen still works before migration 0097 runs. Same keys the migration seeds. */
export const DEFAULT_CALL_REASONS: Record<"esign" | "callback" | "ni", Reason[]> = {
  esign: [
    { key: "tech_issue", label: "Tech issue" }, { key: "phone_died", label: "Phone died or dropped" },
    { key: "spouse", label: "Spouse or family" }, { key: "read_trust", label: "Wants to read it (trust)" },
    { key: "sign_later", label: "Busy, will sign later" }, { key: "hung_up", label: "Hung up" },
    { key: "other_firm", label: "Talking to another firm" }, { key: "other", label: "Other" },
  ],
  callback: [
    { key: "at_work", label: "At work" }, { key: "driving", label: "Driving" },
    { key: "spouse", label: "Wants spouse on" }, { key: "bad_connection", label: "Bad connection" },
    { key: "needs_papers", label: "Needs their papers" }, { key: "other", label: "Other" },
  ],
  ni: [
    { key: "no_lawyer", label: "Doesn't want a lawyer" }, { key: "self", label: "Handling it herself" },
    { key: "not_hurt", label: "Not hurt enough" }, { key: "hung_up", label: "Hung up" }, { key: "other", label: "Other" },
  ],
};

/** DQ reasons shown on an MVA call, in this order, when they exist in dq_reasons. */
export const MVA_DQ_KEYS = [
  "at_fault", "no_injury", "no_treatment", "treatment_gap", "sol", "no_coverage",
  "settled", "already_rep", "low_limits", "wrong_number", "duplicate", "other",
];

/**
 * Turn the "When" button into a time, in the agent's own clock.
 * Tonight is 7pm (or two hours out if it is already past 6pm).
 */
export function callbackAt(when: string | null | undefined, at: string | null | undefined, now: Date = new Date()): Date | null {
  const d = new Date(now.getTime());
  switch (when) {
    case "In an hour": return new Date(now.getTime() + 60 * 60 * 1000);
    case "Tonight": {
      if (d.getHours() >= 18) return new Date(now.getTime() + 2 * 60 * 60 * 1000);
      d.setHours(19, 0, 0, 0); return d;
    }
    case "Tomorrow morning": d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d;
    case "Tomorrow evening": d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d;
    case "Pick a time": {
      if (!at) return null;
      const t = new Date(at);
      return isNaN(t.getTime()) ? null : t;
    }
    default: return null;
  }
}

export interface DispoInput {
  dispo: DispoCode;
  reasons: string[];
  callbackAt: string | null;
  note: string | null;
  notify: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDispo(raw: any): { ok: true; value: DispoInput } | { ok: false; error: string } {
  const dispo = String(raw?.dispo ?? "") as DispoCode;
  if (!DISPO_CODES.includes(dispo)) return { ok: false, error: "Pick how the call ended." };
  const reasons = Array.isArray(raw?.reasons) ? raw.reasons.map((r: unknown) => String(r)) : [];
  if (reasons.length > 20 || reasons.some((r: string) => !/^[a-z0-9_]{1,60}$/.test(r))) {
    return { ok: false, error: "Those reasons did not look right. Pick them again." };
  }
  if (NEEDS_REASON.includes(dispo) && reasons.length === 0) return { ok: false, error: "Pick a reason." };
  let cb: string | null = null;
  if (dispo === "callback") {
    const t = raw?.callback_at ? new Date(String(raw.callback_at)) : null;
    if (!t || isNaN(t.getTime())) return { ok: false, error: "Pick when to call the PNC back." };
    cb = t.toISOString();
  } else if (raw?.callback_at) {
    const t = new Date(String(raw.callback_at));
    if (!isNaN(t.getTime())) cb = t.toISOString();
  }
  const note = raw?.note == null ? null : String(raw.note).slice(0, 2000).trim() || null;
  const notify = Array.isArray(raw?.notify) ? raw.notify.map((e: unknown) => String(e).trim().toLowerCase()) : [];
  if (notify.length > 10 || notify.some((e: string) => !EMAIL.test(e))) return { ok: false, error: "One of the emails is not valid." };
  return { ok: true, value: { dispo, reasons: Array.from(new Set(reasons)), callbackAt: cb, note, notify: Array.from(new Set(notify)) } };
}
