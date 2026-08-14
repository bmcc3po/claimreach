// ============================================================================
// WHERE DOES THIS CALL GO, AND WHAT STATUS DOES IT END IN
//
// The engine says whether a file qualifies. It does not say what the agent does
// with the human still on the line. That was left to memory, which is the worst
// place for it: the agent is deciding under time pressure, at the end of a call,
// on the one step that determines whether the firm ever speaks to this person.
//
// One function, so the answer is the same every time and can be tested. It takes
// the disposition and the campaign, and returns the action, the destination, the
// words to say, and the only statuses that make sense afterwards.
//
// The statuses are deliberately narrow. Offering an agent every status at the
// end of a call is how a signed file ends up marked "contacting": most of them
// are impossible given what just happened, and listing them invites the mistake.
// ============================================================================
import type { Outcome } from "./engine";

export type TransferAction = "transfer" | "sign" | "network" | "supervisor" | "close" | "callback";

/**
 * A row from routing_rules. Where a qualified caller in a given state, on a
 * given case type, actually goes.
 */
export interface RoutingRule {
  id?: string;
  state?: string | null;
  case_type?: string | null;
  destination_type: "live_transfer" | "network";
  destination_name: string;
  transfer_number?: string | null;
  attempts_required?: number | null;
  fallback_emails?: string[] | null;
  notes?: string | null;
}

/**
 * Most specific match wins: state AND case type, then state, then case type,
 * then the catch-all. Scoring rather than a chain of ifs, so adding a dimension
 * later does not mean rewriting the precedence by hand.
 *
 * Returns null when nothing matches, which the caller must treat as "do not
 * transfer, this is a setup gap". Guessing a destination is worse than saying
 * there isn't one: a caller handed to the wrong firm is harder to undo than a
 * caller who waits.
 */
export function resolveRoute(rules: RoutingRule[], state: string | null, caseType: string | null): RoutingRule | null {
  const st = (state || "").toUpperCase();
  const ct = (caseType || "").toLowerCase();
  let best: RoutingRule | null = null;
  let bestScore = -1;
  for (const r of rules || []) {
    const rs = (r.state || "").toUpperCase();
    const rc = (r.case_type || "").toLowerCase();
    if (rs && rs !== st) continue;
    if (rc && rc !== ct) continue;
    const score = (rs ? 2 : 0) + (rc ? 1 : 0);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/** One recorded attempt to hand the caller over. */
export interface TransferAttempt { at: string; by?: string | null; result?: string | null }

/**
 * Whether the agent has done what the rule asks before the fallback opens.
 * The count is the evidence: the email that goes out carries these timestamps,
 * because "we tried twice" is a claim and two stamped attempts is a record.
 */
export function attemptsRemaining(rule: RoutingRule | null, attempts: TransferAttempt[] = []): number {
  const need = rule?.attempts_required ?? 2;
  return Math.max(0, need - (attempts?.length ?? 0));
}

export interface CampaignRouting {
  /** transfer = qualify and hand over. sign = full intake and signature. */
  path?: string | null;
  /** Where a qualified caller goes. Shown to the agent verbatim. */
  transferLabel?: string | null;
  transferNumber?: string | null;
  /** Where a case outside this firm's criteria goes. */
  networkLabel?: string | null;
  /** The routing_rules row that matched this state and case type. */
  rule?: RoutingRule | null;
  /** Transfer attempts logged so far on this file. */
  attempts?: TransferAttempt[];
}

export interface RoutingStep {
  action: TransferAction;
  /** One line, what to do. Written to be read at a glance mid-call. */
  headline: string;
  /** Where the call goes, or null when it goes nowhere. */
  destination: string | null;
  /** Spoken to the caller. Empty when there is nothing to say. */
  say: string;
  /** Agent-only. Why this is the move. */
  note: string;
  /** The only statuses that can honestly follow. First is the expected one. */
  statuses: { key: string; label: string; hint?: string }[];
}

const TRANSFERRED = { key: "transferred", label: "Transferred, firm picked up", hint: "The firm took the caller live" };
const NO_ANSWER = { key: "transfer_no_answer", label: "Transfer, no answer", hint: "Qualified, firm did not pick up after 2 tries" };
const NETWORK = { key: "network_referred", label: "Referred to the network", hint: "Sent out to the referral network" };
const DQ = { key: "dq", label: "Disqualified", hint: "Pick a reason on the next screen" };
const REVIEW = { key: "wip", label: "Held for review", hint: "A supervisor looks at it before anything else happens" };
const CALLBACK = { key: "contacting", label: "Callback scheduled", hint: "Intake not finished" };

export function routeCall(outcome: Outcome, campaign: CampaignRouting = {}): RoutingStep {
  const d = outcome.disposition;
  const transferTo = campaign.transferLabel || "the firm";
  const number = campaign.transferNumber || null;
  const network = campaign.networkLabel || "the referral network";

  // A flagged file goes to a person before it goes anywhere else, whatever the
  // disposition says. Catastrophic injuries and commercial vehicles are worth
  // more than the two minutes it costs to have someone look.
  if (d === "SECONDARY_REVIEW") {
    return {
      action: "supervisor",
      headline: "Do not transfer. Get a supervisor on this one.",
      destination: null,
      say: "Let me get you to someone who can help with this specifically. Can you hold for just a moment?",
      note: outcome.reason + ". Hold the caller, do not release them, and do not promise an outcome.",
      statuses: [REVIEW, CALLBACK],
    };
  }

  if (d === "CALLBACK") {
    return {
      action: "callback",
      headline: "Do not transfer. Set a callback.",
      destination: null,
      say: "I want to make sure we speak to the right person about this. When is a good time to reach them?",
      note: outcome.reason + ". Get a time and the best number for the person who can actually speak to the claim.",
      statuses: [CALLBACK],
    };
  }

  if (d === "DISQUALIFY") {
    return {
      action: "close",
      headline: "Do not transfer. Close the call.",
      destination: null,
      // The reason is never given. It is not the agent's to explain, it invites
      // an argument they cannot win, and it is the fastest way to turn a no into
      // a complaint.
      say: "I appreciate you taking the time to walk me through that. Based on what you have described we are not able to take this one on. There are free legal directories that can point you somewhere else, and I am happy to send you a link.",
      note: "Never say why. Do not negotiate it, do not soften it into a maybe, and do not promise a callback.",
      statuses: [DQ],
    };
  }

  if (d === "REFER") {
    return {
      action: "network",
      headline: `Do not transfer to ${transferTo}. This goes to ${network}.`,
      destination: network,
      say: "This is something we can help with, it is just handled by a different attorney than the one I would normally connect you to. Let me get your file over to the right person, and someone will reach out to you.",
      note: outcome.reason + ". It qualifies, it is just outside this firm's criteria. Send it out rather than closing it.",
      statuses: [NETWORK, CALLBACK],
    };
  }

  // SIGN. What that means depends on where the routing table sends this state
  // and case type, not on the campaign alone.
  if (campaign.path === "transfer") {
    const rule = campaign.rule ?? null;

    // Nothing matched. Say so plainly rather than inventing a destination: a
    // caller handed to the wrong firm is much harder to undo than one who waits.
    if (!rule) {
      return {
        action: "supervisor",
        headline: "Qualified, but there is no routing rule for this state and case type.",
        destination: null,
        say: "This is exactly the kind of case they take on. Give me one moment to get you to the right person.",
        note: "Do not guess a destination. Get a supervisor, and flag the missing routing rule so it is added.",
        statuses: [REVIEW, CALLBACK],
      };
    }

    // Some case types never get a live transfer, they go over the API.
    if (rule.destination_type === "network") {
      return {
        action: "network",
        headline: `Do not transfer. This one goes to ${rule.destination_name}.`,
        destination: rule.destination_name,
        say: "This is something we can help with. It is handled by a different attorney than the one I would normally connect you to, so let me get your file over to the right person and someone will reach out.",
        note: "No transfer on this route. Submitting sends it over the API.",
        statuses: [NETWORK, CALLBACK],
      };
    }

    const need = rule.attempts_required ?? 2;
    const done = campaign.attempts?.length ?? 0;
    const left = Math.max(0, need - done);
    const dest = rule.transfer_number
      ? `${rule.destination_name} . ${rule.transfer_number}`
      : rule.destination_name;

    // Until the attempts are made, "no answer" is not an available answer. The
    // fallback exists because somebody genuinely did not pick up, and letting an
    // agent skip to it turns a routing rule into a suggestion.
    if (left > 0) {
      return {
        action: "transfer",
        headline: rule.transfer_number
          ? `Transfer to ${rule.destination_name} at ${rule.transfer_number}`
          : `Transfer to ${rule.destination_name}`,
        destination: dest,
        say: "Good news, this is exactly the kind of case they handle. I am going to connect you with them right now. Please stay on the line with me while it rings.",
        note: done === 0
          ? `Stay on the line until someone picks up. If nobody answers, log the attempt and try again. ${need} attempts are required before the file can be sent by email instead.`
          : `Attempt ${done} of ${need} logged. Try once more before the email option opens.`,
        statuses: [TRANSFERRED, { key: "__attempt", label: `Log attempt ${done + 1}, no answer`, hint: `${left} more before the email option opens` }],
      };
    }

    // Both attempts made and nobody picked up.
    const hasEmail = (rule.fallback_emails?.length ?? 0) > 0;
    return {
      action: "transfer",
      headline: hasEmail
        ? `${need} attempts logged. Send the file to ${rule.destination_name} by email.`
        : `${need} attempts logged and nobody picked up.`,
      destination: dest,
      say: "I have not been able to reach them live. I am going to send your information straight over so they have it, and someone will call you back.",
      note: hasEmail
        ? `Sending emails the client details, the intake, and the record of both attempts to ${rule.fallback_emails!.join(", ")}.`
        : "This route has no fallback recipients, so the file waits for a callback rather than going anywhere.",
      statuses: hasEmail
        ? [{ key: "__fallback", label: "Send the file by email", hint: "Includes proof of both attempts" }, NO_ANSWER]
        : [NO_ANSWER],
    };
  }

  return {
    action: "sign",
    headline: "Qualified. Send the retainer.",
    destination: null,
    say: "Good news, this is exactly the kind of case they take on. The next step is getting the paperwork over to you so they can get started.",
    note: "Take their details, send the packet, and stay with them while they sign.",
    statuses: [
      { key: "signed_grievous", label: "Signed on the call" },
      { key: "esign_sent", label: "e-Sign sent, not signed yet" },
      CALLBACK,
    ],
  };
}
