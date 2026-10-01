import type { DeskQueues } from "./mva-call/desk-types";

export interface CallAlert {
  key: string;
  kind: "new" | "callback";
  href: string;
  due?: string;
}

// Presentation of existing queue state only. This does not invent a cadence,
// change file priority/status, call a provider, or reserve a file for an agent.
export function callAlertsFromQueues(queues: DeskQueues, now: number): CallAlert[] {
  return [
    ...queues.new.filter(row => row.claimId && row.href).map(row => ({
      key: `new:${row.claimId}`, kind: "new" as const, href: row.href!,
    })),
    ...queues.callbacks.filter(row => row.claimId && row.href && row.due && Number.isFinite(Date.parse(row.due))).map(row => ({
      key: `callback:${row.claimId}:${new Date(row.due!).toISOString()}`,
      kind: "callback" as const, href: row.href!, due: new Date(row.due!).toISOString(),
    })),
  ];
}

export function dueCallAlerts(alerts: CallAlert[], now: number): CallAlert[] {
  return alerts.filter(alert => alert.kind === "new" || (!!alert.due && Date.parse(alert.due) <= now));
}

/** Keep acknowledgments only while an event remains in the actual queue.
 * A rescheduled callback is a different event; errors never call this function. */
export function reconcileCallAlerts(alerts: CallAlert[], seen: string[], now: number) {
  const current = new Set(alerts.map(alert => alert.key));
  const prior = new Set(seen.filter(key => current.has(key)));
  const due = dueCallAlerts(alerts, now);
  const fresh = due.filter(alert => !prior.has(alert.key));
  for (const alert of fresh) prior.add(alert.key);
  return { fresh, seen: [...prior], due };
}
