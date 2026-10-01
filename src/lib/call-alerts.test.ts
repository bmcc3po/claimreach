import assert from "node:assert/strict";
import { callAlertsFromQueues, dueCallAlerts, reconcileCallAlerts } from "./call-alerts";
import { buildDeskQueues } from "./mva-call/desk-queue";
import { DEFAULT_STATUSES } from "./statuses";

const now = Date.parse("2026-10-01T06:00:00Z");
const file = (id: string, status = "new") => ({ id, firm_id: "firm", campaign_id: "inno", created_at: "2026-09-30T00:00:00Z", claimant_name: "Synthetic private name", phone: "2025550100",
  claims: [{ id: `${id}-matter`, lead_id: id, firm_id: "firm", campaign_id: "inno", claim_type: "mva", status }] });
const newLead = file("new"), callback = file("callback", "contacting"), closed = file("closed", "dq"), held = file("held");
const queues = buildDeskQueues({ leads: [newLead, callback, closed, held],
  calls: [{ id: "call", lead_id: callback.id, claim_id: callback.claims[0].id, campaign_id: "inno", disposition: "callback", callback_at: "2026-10-01T06:00:01Z", created_at: "2026-09-30T05:00:00Z" }],
  agreements: [], campaignIds: ["inno"], statuses: DEFAULT_STATUSES,
  holds: new Map([[held.claims[0].id, { lead_id: held.id, firm_id: "firm", campaign_id: "inno", acquisition_hold: true } as any]]), acquisitionReady: true });
const alerts = callAlertsFromQueues(queues, now);
assert.equal(alerts.length, 2, "closed and held matters never alert");
assert.equal(alerts[0].kind, "new", "new leads have first display priority");
assert.equal(dueCallAlerts(alerts, now).length, 1, "future callback does not ring early");
const first = reconcileCallAlerts(alerts, [], now);
assert.equal(first.fresh.length, 1);
assert.equal(reconcileCallAlerts(alerts, first.seen, now).fresh.length, 0, "polling or reloading does not repeat a new lead");
const atDue = reconcileCallAlerts(alerts, first.seen, now + 1000);
assert.equal(atDue.fresh[0].kind, "callback", "scheduled second triggers without a queue refresh");
assert.equal(reconcileCallAlerts(alerts, atDue.seen, now + 10000).fresh.length, 0, "overdue callback rings once");
const later = alerts.map(a => a.kind === "callback" ? { ...a, key: "callback:callback-matter:rescheduled", due: "2026-10-01T06:01:00Z" } : a);
assert.equal(reconcileCallAlerts(later, atDue.seen, now + 60000).fresh.length, 1, "rescheduling is a new event");
assert.deepEqual(reconcileCallAlerts([], atDue.seen, now).seen, [], "handled work is removed from the dedupe ledger");
assert.doesNotMatch(JSON.stringify(alerts), /Synthetic private name|2025550100/, "feed has no claimant identity");
assert.equal(new Set(alerts.map(a => a.key)).size, alerts.length);
console.log("ok call alerts: exact queue eligibility, timing, priority, deduplication, reschedule and privacy");
