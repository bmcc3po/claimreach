// ============================================================================
// SLA clock engine. Two promises ClaimReach tracks, in your face, nobody hides:
//
//   1. E-SIGN CHASE  (agent-owned) - e-sign sent, not yet signed. The agent has
//      esign_chase_hours to get the claimant back on the line or the lead dies.
//      Anchor: esign_sent_at (or signable_documents.sent_at). Stops when signed.
//
//   2. DELIVERY SLA  (ops-owned) - file signed, not yet delivered to the firm.
//      Must clear Grievous -> QA -> WIP -> Re-QA -> Delivered within deliver_sla
//      _hours. Anchor: signed_at. Stops (pauses on OUR side) when firm_sent_at is
//      set. The firm runs its own clocks after delivery; ours ends at handoff.
//
// Everything is derived at read time, so no stored countdown can go stale.
// ============================================================================

export interface ClockThresholds {
  esign_chase_hours: number;   // default 72
  deliver_sla_hours: number;   // default 72
}

export const DEFAULT_THRESHOLDS: ClockThresholds = {
  esign_chase_hours: 72,
  deliver_sla_hours: 72,
};

export type ClockKind = "esign_chase" | "delivery";
export type ClockTone = "ok" | "warn" | "urgent" | "overdue";

export interface Clock {
  kind: ClockKind;
  label: string;          // human, in-your-face: "E-sign sent, chase now"
  startedAt: string;      // ISO anchor
  dueAt: string;          // ISO deadline
  hoursLeft: number;      // negative = overdue
  tone: ClockTone;        // drives color
  stuckStage?: string;    // for delivery: where the file is sitting
  countdownText: string;  // "11h left" / "OVERDUE 3h"
}

// A minimal file shape the engine needs. Callers map their rows into this.
export interface ClockInput {
  signed_at?: string | null;
  firm_sent_at?: string | null;
  esign_sent_at?: string | null;
  esign_status?: string | null;   // signable_documents.status: sent|viewed|signed...
  current_status?: string | null; // status key -> for stuck-stage label
  statusLabel?: string | null;    // resolved label for display
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function toneFor(hoursLeft: number): ClockTone {
  if (hoursLeft < 0) return "overdue";
  if (hoursLeft <= 6) return "urgent";
  if (hoursLeft <= 24) return "warn";
  return "ok";
}

function countdownText(hoursLeft: number): string {
  if (hoursLeft < 0) {
    const over = Math.abs(hoursLeft);
    return over >= 24 ? `OVERDUE ${Math.floor(over / 24)}d` : `OVERDUE ${Math.ceil(over)}h`;
  }
  if (hoursLeft < 1) return `${Math.max(1, Math.round(hoursLeft * 60))}m left`;
  if (hoursLeft < 48) return `${Math.floor(hoursLeft)}h left`;
  return `${Math.floor(hoursLeft / 24)}d left`;
}

// Compute all active clocks for one file. Returns [] if nothing is ticking.
export function clocksFor(f: ClockInput, t: ClockThresholds = DEFAULT_THRESHOLDS, now = new Date()): Clock[] {
  const out: Clock[] = [];

  // ---- E-SIGN CHASE: sent, not signed ----
  const esignActive = !!f.esign_sent_at && (f.esign_status ?? "") !== "signed" && !f.signed_at;
  if (esignActive && f.esign_sent_at) {
    const start = new Date(f.esign_sent_at);
    const due = new Date(start.getTime() + t.esign_chase_hours * 3_600_000);
    const hoursLeft = hoursBetween(now, due);
    out.push({
      kind: "esign_chase",
      label: "E-sign sent, get them back on the line",
      startedAt: start.toISOString(),
      dueAt: due.toISOString(),
      hoursLeft,
      tone: toneFor(hoursLeft),
      countdownText: countdownText(hoursLeft),
    });
  }

  // ---- DELIVERY SLA: signed, not delivered (pauses on our side at delivery) ----
  const deliveryActive = !!f.signed_at && !f.firm_sent_at;
  if (deliveryActive && f.signed_at) {
    const start = new Date(f.signed_at);
    const due = new Date(start.getTime() + t.deliver_sla_hours * 3_600_000);
    const hoursLeft = hoursBetween(now, due);
    out.push({
      kind: "delivery",
      label: "Signed, race to deliver to firm",
      startedAt: start.toISOString(),
      dueAt: due.toISOString(),
      hoursLeft,
      tone: toneFor(hoursLeft),
      stuckStage: f.statusLabel ?? f.current_status ?? undefined,
      countdownText: countdownText(hoursLeft),
    });
  }

  return out;
}

// The single most urgent clock on a file (for the in-line leads badge).
export function primaryClock(f: ClockInput, t?: ClockThresholds, now?: Date): Clock | null {
  const cs = clocksFor(f, t, now);
  if (cs.length === 0) return null;
  // Most urgent = fewest hours left (overdue sorts first since it's most negative).
  return cs.sort((a, b) => a.hoursLeft - b.hoursLeft)[0];
}
