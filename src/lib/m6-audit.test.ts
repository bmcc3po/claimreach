// Josh's M6 audit board: flags, stamps, Neos link, CSV and SOP rule 3.
// Run: npx tsx src/lib/m6-audit.test.ts
import {
  AUDIT_FLAGS, aggregateAuditStats, auditBoardCsv, auditFlags, auditNoteBody, auditSeverity,
  buildAuditTimeline, cleanNeosNumber, commStatus, commWho, countFlags, emptyAuditStats,
  isSentWrittenUpdate, neosMatterUrl, parseAuditNote, type AuditBoardRow,
} from "./m6-audit";
import { bodySaysNothingReportedToG6, evaluateOutboundGates, gateMessage } from "./m6-cadence";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

const NOW = "2026-11-04T18:00:00.000Z";
const daysBack = (d: number) => new Date(new Date(NOW).getTime() - d * 86400000).toISOString();

console.log("\nSTAMPS");
check("reviewed body", auditNoteBody("reviewed"), "Audit: reviewed.");
check("flagged body with comment", auditNoteBody("flagged", "  Call her back  "), "Audit: flagged for follow up. Call her back");
check("parse reviewed", parseAuditNote("Audit: reviewed. Looks right."), { verdict: "reviewed", comment: "Looks right." });
check("parse flagged", parseAuditNote("Audit: flagged for follow up."), { verdict: "flagged", comment: "" });
check("plain note is not a stamp", parseAuditNote("Called, no answer"), null);

console.log("\nWRITTEN UPDATES");
check("outbound sms with no status counts (JustCall)", isSentWrittenUpdate({ channel: "sms", direction: "outbound", send_status: null }), true);
check("sent email counts", isSentWrittenUpdate({ channel: "email", direction: "outbound", send_status: "sent" }), true);
check("blocked sms does not count", isSentWrittenUpdate({ channel: "sms", direction: "outbound", send_status: "blocked" }), false);
check("logged sms does not count", isSentWrittenUpdate({ channel: "sms", direction: "outbound", send_status: "logged" }), false);
check("undelivered does not count", isSentWrittenUpdate({ channel: "sms", direction: "outbound", outcome: "undelivered" }), false);
check("call is not a written update", isSentWrittenUpdate({ channel: "call", direction: "outbound" }), false);
check("inbound text is not an update", isSentWrittenUpdate({ channel: "sms", direction: "inbound" }), false);

console.log("\nAGGREGATE");
const stats = aggregateAuditStats(
  [
    { lead_id: "a", channel: "sms", direction: "outbound", send_status: null, occurred_at: daysBack(10) },
    { lead_id: "a", channel: "sms", direction: "outbound", send_status: null, occurred_at: daysBack(120) },
    { lead_id: "a", channel: "sms", direction: "outbound", send_status: "blocked", occurred_at: daysBack(1) },
    { lead_id: "b", channel: "call", direction: "outbound", occurred_at: daysBack(2) },
  ],
  [
    { lead_id: "a", source: "m6", body: "Spoke with her sister", created_at: daysBack(5) },
    { lead_id: "a", source: "audit", body: "Audit: reviewed.", created_at: daysBack(40), author_name: "Josh" },
    { lead_id: "a", source: "audit", body: "Audit: flagged for follow up. Wrong number", created_at: daysBack(3), author_name: "Josh" },
    { lead_id: "a", source: "audit", body: "not a stamp", created_at: daysBack(1) },
  ],
  NOW,
);
const a = stats.get("a")!;
check("last update is the newest sent one", a.lastUpdateAt, daysBack(10));
check("updates in 90 days", a.updates90, 1);
check("latest stamp wins", [a.lastAuditVerdict, a.lastAuditBy, a.lastAuditAt], ["flagged", "Josh", daysBack(3)]);
check("unparseable audit row counts as a plain note", a.lastNoteAt, daysBack(1));
check("call-only file has no written update", (stats.get("b") ?? emptyAuditStats()).lastUpdateAt, null);

console.log("\nFLAGS");
const fresh = { ...emptyAuditStats(), lastAuditAt: daysBack(2), lastAuditVerdict: "reviewed" as const, lastUpdateAt: daysBack(5) };
check("healthy reviewed file has no flags",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(200) }, fresh, NOW), []);
check("never reached, new file",
  auditFlags({ last_two_way_at: null, days_since_contact: 10, started_at: daysBack(10) }, emptyAuditStats(), NOW),
  ["never_reached", "not_audited"]);
check("60 days no contact is dormant",
  auditFlags({ last_two_way_at: daysBack(61), days_since_contact: 61, started_at: daysBack(200) }, fresh, NOW),
  ["no_contact_60"]);
check("no update for 90 days from file start",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(95) }, { ...fresh, lastUpdateAt: null }, NOW),
  ["no_update_90"]);
check("89 days is not overdue yet",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(89) }, { ...fresh, lastUpdateAt: null }, NOW),
  []);
check("opted out never asks for an update",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(200), opted_out: true }, { ...fresh, lastUpdateAt: null }, NOW),
  ["opted_out"]);
check("stale audit after 30 days",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(200) }, { ...fresh, lastAuditAt: daysBack(30) }, NOW),
  ["not_audited"]);
check("flagged, reply waiting and send failed",
  auditFlags({ last_two_way_at: daysBack(3), days_since_contact: 3, started_at: daysBack(200), inbound_waiting: true, last_send_failed: true },
    { ...fresh, lastAuditVerdict: "flagged" }, NOW),
  ["flagged", "reply_waiting", "send_failed"]);
check("severity: flagged first", auditSeverity(["not_audited", "flagged"]), 0);
check("severity: none sorts last", auditSeverity([]), AUDIT_FLAGS.length);
check("count flags", countFlags([{ flags: ["flagged", "not_audited"] }, { flags: ["not_audited"] }]).not_audited, 2);

console.log("\nNEOS");
check("clean number", cleanNeosNumber("  2500138 "), "2500138");
check("rejects spaces and script", cleanNeosNumber("25 <x>"), null);
check("empty is null", cleanNeosNumber(""), null);
check("template fills", neosMatterUrl("https://neos.example.com/matter/{no}", "2500138"), "https://neos.example.com/matter/2500138");
check("no template, no link", neosMatterUrl("", "2500138"), null);
check("http template refused", neosMatterUrl("http://neos.example.com/{no}", "1"), null);
check("template without {no} refused", neosMatterUrl("https://neos.example.com/", "1"), null);

console.log("\nTIMELINE");
check("drip sender label", commWho({ direction: "outbound", agent_name: "Quea", template_key: "s05_t0_call" }), "Quea (drip)");
check("client label", commWho({ direction: "inbound", agent_name: "x" }), "Client");
check("blocked text status", commStatus({ direction: "outbound", channel: "sms", send_status: "blocked" }), { label: "Blocked", tone: "warn" });
check("reached call status", commStatus({ direction: "outbound", channel: "call", outcome: "two_way" }), { label: "Reached", tone: "good" });
const tl = buildAuditTimeline(
  [{ id: "1", channel: "sms", direction: "outbound", body: "Hi", occurred_at: daysBack(2), agent_name: "Quea" }],
  [
    { id: "9", body: "Audit: reviewed. Fine", created_at: daysBack(1), source: "audit", author_name: "Josh" },
    { id: "8", body: "Left VM", created_at: daysBack(3), source: "m6", author_name: "Quea" },
  ],
);
check("timeline newest first", tl.map((i) => i.kind), ["audit", "message", "note"]);
check("stamp shows its comment", [tl[0].status, tl[0].body], ["Reviewed", "Fine"]);

console.log("\nCSV");
const row: AuditBoardRow = {
  lead_id: "a", lead_no: "LR-1", name: "=HYPERLINK(\"x\")", neos_no: "2500138", neos_url: null,
  last_two_way_at: daysBack(3), last_touch_at: null, next_touch_due: null,
  stats: { ...emptyAuditStats(), updates90: 2 }, flags: ["flagged", "not_audited"],
};
const csv = auditBoardCsv([row]).split("\r\n");
check("csv header", csv[0].startsWith('"File","Name","Neos #"'), true);
check("csv neutralizes formulas", csv[1].includes(`"'=HYPERLINK(""x"")"`), true);
check("csv flags", csv[1].endsWith('"Flagged; Not audited"'), true);

console.log("\nSOP RULE 3: NEVER WRITE THAT NOTHING WAS REPORTED TO G6");
const bad = [
  "Nothing was reported to G6.",
  "nothing was ever reported to Motel 6",
  "She never reported it to G6.",
  "Client didn't tell the hotel.",
  "No one told corporate about the trafficking",
  "She did not notify G6 Hospitality",
  "No report was made to G6",
  "No complaints were ever filed with the motel",
  "G6 was never told",
  "The hotel was not aware",
  "G6 had no notice",
  "Nobody ever complained to Motel-6 staff",
];
for (const t of bad) check(`blocks: ${t}`, bodySaysNothingReportedToG6(t), true);
const okLines = [
  "Nothing new to report this month.",
  "Josh will send the LOR to G6 this week.",
  "She reported it to the front desk at Motel 6 in 2017.",
  "Did she ever report anything to G6?",
  "We have nothing to report yet.",
  "Hi Maria, just checking in. Is this still your best number?",
  "",
];
for (const t of okLines) check(`allows: ${t || "(empty)"}`, bodySaysNothingReportedToG6(t), false);

const gate = evaluateOutboundGates({ channel: "sms", body: "Nothing was reported to G6", now: new Date("2026-11-04T18:00:00Z"), timezone: "America/Chicago" });
check("gate hard-blocks rule 3 (cannot log)", [gate.canLog, gate.blocked.includes("g6_report_claim")], [false, true]);
check("gate message is friendly", gateMessage("g6_report_claim").startsWith("Please reword this."), true);
const okGate = evaluateOutboundGates({ channel: "sms", body: "Checking in, nothing new to report.", now: new Date("2026-11-04T18:00:00Z"), timezone: "America/Chicago" });
check("normal check-in still logs", okGate.canLog, true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
