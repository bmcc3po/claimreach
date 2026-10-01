import assert from "node:assert/strict";
import { organizeCallNow } from "./call-now-sort";
import type { DeskRow } from "./desk-types";

const row = (id: string, calls: number, receivedAt: string, due: string): DeskRow => ({
  id, name: id, callCount: calls, receivedAt, due,
  outreach: { badge: calls === 0 ? "new" : "overdue" } as DeskRow["outreach"],
});
const rows = [
  row("follow-late", 2, "2026-09-28T12:00:00Z", "2026-10-01T16:00:00Z"),
  row("new-old", 0, "2026-09-30T12:00:00Z", "2026-10-01T17:00:00Z"),
  row("follow-early", 1, "2026-09-29T12:00:00Z", "2026-10-01T15:00:00Z"),
  row("new-recent", 0, "2026-10-01T12:00:00Z", "2026-10-01T18:00:00Z"),
];
const ids = (items: DeskRow[]) => items.map(item => item.id);

assert.deepEqual(ids(organizeCallNow(rows, "priority").newLeads), ["new-recent", "new-old"]);
assert.deepEqual(ids(organizeCallNow(rows, "priority").followUps), ["follow-early", "follow-late"]);
assert.deepEqual(ids(organizeCallNow(rows, "due").newLeads), ["new-old", "new-recent"]);
assert.deepEqual(ids(organizeCallNow(rows, "name").followUps), ["follow-early", "follow-late"]);
assert.deepEqual(ids(organizeCallNow([{ ...rows[1], callCount: 1, outreach: { badge: "due" } as DeskRow["outreach"] }], "priority").followUps), ["new-old"]);
assert.equal(organizeCallNow(rows, "priority").newLeads.length + organizeCallNow(rows, "priority").followUps.length, rows.length);
console.log("Call Now grouping and sorting checks passed");
