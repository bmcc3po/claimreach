import type { DeskRow } from "./desk-types";

export type CallNowSort = "priority" | "due" | "newest" | "oldest" | "name";

function timestamp(value?: string | null): number {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function organizeCallNow(rows: DeskRow[], sort: CallNowSort): { newLeads: DeskRow[]; followUps: DeskRow[] } {
  const newLeads: DeskRow[] = [];
  const followUps: DeskRow[] = [];
  for (const row of rows) {
    // Only verified zero-dial outreach belongs here. Missing call history is
    // held in Needs Review by the cadence planner, never presented as new.
    (row.callCount === 0 && row.outreach?.badge === "new" ? newLeads : followUps).push(row);
  }
  const byDue = (a: DeskRow, b: DeskRow) => timestamp(a.due) - timestamp(b.due);
  const byReceived = (a: DeskRow, b: DeskRow) => timestamp(a.receivedAt) - timestamp(b.receivedAt);
  const byName = (a: DeskRow, b: DeskRow) => String(a.name || "").localeCompare(String(b.name || ""));
  const compare = (firstCalls: boolean) => (a: DeskRow, b: DeskRow) => {
    if (sort === "priority") return (firstCalls ? -byReceived(a, b) : byDue(a, b)) || byName(a, b);
    if (sort === "due") return byDue(a, b) || byName(a, b);
    if (sort === "newest") return -byReceived(a, b) || byName(a, b);
    if (sort === "oldest") return byReceived(a, b) || byName(a, b);
    return byName(a, b) || byDue(a, b);
  };
  return { newLeads: newLeads.sort(compare(true)), followUps: followUps.sort(compare(false)) };
}
