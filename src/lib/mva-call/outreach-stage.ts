import { nextOngoingCall, nextPermittedCall, nextWeekdayOpening, nextThreePerDayWindowAfter, localDateKey } from "./outreach-followup";
import { normalizeTimeZone } from "../mail-time-zone";
import { knownTimezoneFromPhone } from "../m6-cadence";
import { STATE_TZ, stateCodeOf } from "./state";

/** Lead-local zone for the manual MVA call queue. Explicitly verified zone,
 * then marketer incident state, then a recognized phone area code. */
export function outreachZone(verified: string | null | undefined, incidentState: string | null | undefined,
  phone: string | null | undefined): string | null {
  const incident = stateCodeOf(incidentState);
  // A generic "Mountain" label cannot distinguish Arizona's no-DST clock.
  const explicit = String(verified || "").trim();
  return (explicit === "Mountain" ? null : normalizeTimeZone(explicit))
    || (incident ? STATE_TZ[incident] : null) || knownTimezoneFromPhone(phone);
}

/** A manual call queue preview. No call, text, or alert is dispatched here. */
export type OutreachStage = "due" | "wait" | "review";
export interface DialSummary {
  local_zone: string | null;
  shared_phone: boolean;
  total_dials: number;
  dials_today: number;
  unanswered_dials: number;
  answered_dials: number;
  unverified_dials: number;
  first_call_at: string | null;
  last_call_at: string | null;
  dial_times: string[];
  outbound_sms_times: string[];
}
export interface OutreachPlacement {
  stage: OutreachStage;
  reason: string;
  total: number;
  today: number;
  lastCallAt: string | null;
  dueAt: string | null;
  zone: string | null;
  badge: "new" | "overdue" | "due" | "wait" | "review";
  overdue: boolean;
  nextAttempt: number | null;
  textPrompt: boolean;
  textStep: 1 | 2 | null;
  textAfterCall: boolean;
}

const DAY_ONE = [0, 2, 10, 25, 45, 75, 120, 180, 255, 330] as const;
const DAY_TWO = [0, 90, 210, 330, 450] as const;

/** Count every verified outbound attempt once; never use intake saves as dials. */
export function placeOutreach(summary: DialSummary | null, firstDialedAt: string | null,
  matterCount: number, receivedAt: string | null, now = new Date()): OutreachPlacement {
  const total = summary?.total_dials ?? 0;
  const today = summary?.dials_today ?? 0;
  const lastCallAt = summary?.last_call_at ?? null;
  const common = { total, today, lastCallAt, dueAt: null, zone: summary?.local_zone ?? null, nextAttempt: null, textPrompt: false, textStep: null, textAfterCall: false, overdue: false };
  const review = (reason: string): OutreachPlacement => ({ ...common, stage: "review", badge: "review", reason });
  if (matterCount !== 1) return review("Multiple matters share this lead. Confirm the correct call history.");
  if (!summary) return review("Call history could not be loaded.");
  if (summary.shared_phone) return review("This number is on another file. Confirm call attribution.");
  if (!summary.local_zone) return review("Confirm the client's time zone before scheduling calls.");
  if (!receivedAt || Number.isNaN(Date.parse(receivedAt))) return review("The lead receipt time needs review.");
  if (total === 0 && firstDialedAt) return review("A first dial is recorded, but its call history is unavailable.");
  if (summary.unverified_dials > 0 || summary.unanswered_dials + summary.answered_dials !== total)
    return review("An outbound call lacks a verified no-answer or answer result.");
  // A provider's "answered" flag means the line connected, not that our agent
  // spoke with the client. A real conversation is routed by the agent's file
  // disposition (callback, e-sign, signed, DQ), outside this attempt planner.
  // Keep connected attempts in the dial count and cadence until then.
  if (summary.dial_times.length !== total || (total > 0 && !lastCallAt)) return review("Call timestamps are incomplete.");

  const zone = summary.local_zone;
  let due: Date;
  const nextAttempt = total + 1;
  try {
    const anchor = nextPermittedCall(new Date(receivedAt), zone);
    if (total < 10) {
      due = nextPermittedCall(new Date(anchor.getTime() + DAY_ONE[total] * 60000), zone);
      if (total > 0) {
        // A late completed attempt cannot collapse the remaining calls into a burst.
        const gap = DAY_ONE[total] - DAY_ONE[total - 1];
        const spaced = nextPermittedCall(new Date(Date.parse(lastCallAt!) + gap * 60000), zone);
        if (spaced > due) due = spaced;
      }
    } else if (total < 15) {
      const tenth = new Date(summary.dial_times[9]);
      const dayTwoStart = localDateKey(tenth, zone) === localDateKey(anchor, zone)
        ? nextWeekdayOpening(tenth, zone)
        : nextPermittedCall(new Date(tenth.getTime() + 3600000), zone);
      due = nextPermittedCall(new Date(dayTwoStart.getTime() + DAY_TWO[total - 10] * 60000), zone);
      if (total > 10) {
        const gap = DAY_TWO[total - 10] - DAY_TWO[total - 11];
        const spaced = nextPermittedCall(new Date(Date.parse(lastCallAt!) + gap * 60000), zone);
        if (spaced > due) due = spaced;
      }
    } else if (total < 30) {
      const reviewAt = nextWeekdayOpening(nextOngoingCall(summary.dial_times[14], 14, zone), zone);
      if (now >= reviewAt) return review("Five weekdays of follow-up elapsed. Manager review needed; missed calls remain in history.");
      due = nextOngoingCall(summary.dial_times[14], total - 15, zone);
      const last = new Date(lastCallAt!);
      if (last >= due) due = nextThreePerDayWindowAfter(last, zone);
    } else {
      return review("Five weekdays of follow-up are complete. Manager review needed.");
    }
    if (!Number.isFinite(due.getTime())) return review("Call time could not be calculated.");
    const isDue = due.getTime() <= now.getTime();
    const overdue = now.getTime() > due.getTime();
    const sentAfter = (stamp: string) => (summary.outbound_sms_times || []).some(sms => Date.parse(sms) >= Date.parse(stamp));
    // The reminder follows completed calls 3 and 7. Never prompt for a text
    // before the qualifying dial, and keep an unsent reminder visible later.
    const textStep: 1 | 2 | null = total >= 3 && !sentAfter(summary.dial_times[2]) ? 1
      : total >= 7 && !sentAfter(summary.dial_times[6]) ? 2 : null;
    return { ...common, stage: isDue ? "due" : "wait", badge: total === 0 ? "new" : overdue ? "overdue" : isDue ? "due" : "wait", overdue,
      reason: total === 0 ? "First call" : total < 10 ? `Day 1 · call ${nextAttempt} of 10` : total < 15 ? `Day 2 · call ${nextAttempt} of 15` : `Follow-up · call ${total - 14} of 15`,
      dueAt: due.toISOString(), nextAttempt, textPrompt: textStep !== null, textStep,
      textAfterCall: (total === 3 && textStep === 1) || (total === 7 && textStep === 2) };
  } catch { return review("The lead-local call time could not be resolved."); }
}
