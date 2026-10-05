"use client";

import { areaHref, type WorkArea } from "@/lib/work-area";
import Link from "next/link";
import { useMemo, useState } from "react";
import { shiftWeek } from "@/lib/packet-worklist";
import { missedInboundFollowups, summarizeCallActivity, type CallActivityRow } from "@/lib/call-activity";
import "./packet-worklist.css";

type CallbackRow = { id: string; leadNo: string; claimant: string; agent: string; callbackAt: string; status: string };

function callTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportRows(rows: CallActivityRow[], week: string) {
  const lines = [
    ["File", "Client", "Case", "Direction", "JustCall inbound outcome", "Agent", "Call time Pacific", "Duration seconds"],
    ...rows.map((r) => [r.leadNo, r.claimant, r.campaign, r.direction, r.direction === "inbound" ? r.inboundOutcome : "", r.agent, r.occurredAt, r.durationSec ?? ""]),
  ];
  const url = URL.createObjectURL(new Blob(["\ufeff", lines.map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `claimreach-linked-calls-${week}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CallActivityView({ monday, rows, callbacks, truncated, callbacksTruncated, outcomesIncomplete, area = "mva" }: { area?: WorkArea; monday: string; rows: CallActivityRow[]; callbacks: CallbackRow[]; truncated: boolean; callbacksTruncated: boolean; outcomesIncomplete: boolean }) {
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [query, setQuery] = useState("");
  const agents = useMemo(() => summarizeCallActivity(rows), [rows]);
  const filtered = rows.filter((r) => (direction === "all" || r.direction === direction)
    && `${r.claimant} ${r.leadNo} ${r.agent} ${r.campaign}`.toLowerCase().includes(query.trim().toLowerCase()));
  const inbound = rows.filter((r) => r.direction === "inbound").length;
  const outbound = rows.filter((r) => r.direction === "outbound").length;
  const answeredInbound = rows.filter((r) => r.direction === "inbound" && r.inboundOutcome === "answered").length;
  const missedInbound = missedInboundFollowups(rows);

  return <main className="packet-page call-activity">
    <div className="packet-heading"><p className="packet-kicker">Operator report</p><h1>Call activity</h1><p>Inbound and outbound calls linked to a client file, in Pacific time.</p></div>
    <div className="packet-week"><Link href={areaHref(`/call-activity?week=${shiftWeek(monday, -1)}`, area)} aria-label="Previous week">←</Link><strong>Week of {monday}</strong><Link href={areaHref(`/call-activity?week=${shiftWeek(monday, 1)}`, area)} aria-label="Next week">→</Link></div>
    {truncated && <p className="packet-warning" role="alert">This week reached the 5,000 linked-call read limit. Counts and export may be incomplete.</p>}
    {outcomesIncomplete && <p className="packet-warning" role="alert">JustCall outcome records are incomplete or unavailable. Answered and missed counts may be low; use the call list and provider log before acting.</p>}
    <div className="packet-metrics call-outcome-metrics"><div><strong>{inbound}</strong><span>Inbound linked calls</span></div><div><strong>{answeredInbound}</strong><span>Answered inbound</span></div><div><strong>{missedInbound.length}</strong><span>Missed inbound</span></div><div><strong>{outbound}</strong><span>Outbound linked calls</span></div></div>
    <section className="packet-agent-counts"><h2>Agent activity</h2><p>A call appears here only when its provider record is linked to a file. Inbound answer counts come from JustCall's completed-call type. “With duration” means a positive recorded duration; it does not prove a client conversation.</p>
      <div className="call-agent-head"><span>Agent</span><span>Inbound</span><span>Outbound</span><span>Files</span><span>With duration</span><span>Last call</span></div>
      {agents.map((r) => <div className="call-agent-row" key={r.agent}><strong>{r.agent}</strong><span>{r.inbound}<small>{r.inboundAnswered} answered</small></span><span>{r.outbound}</span><span>{r.files}</span><span>{r.withDuration}</span><span>{callTime(r.lastCall)}</span></div>)}
      {!agents.length && <p>No file-linked calls recorded for this week.</p>}
    </section>
    <section className="packet-agent-counts"><h2>Missed inbound to review <span className="call-count">{missedInbound.length}</span></h2><p>JustCall marked these calls missed. A later outbound call is a return attempt, not proof of a conversation. The follow-up check covers only calls visible in this selected week; a provider agent name on a missed call does not establish individual fault.</p>
      {missedInbound.map(({ missed, followup }) => <Link className="call-missed-row" href={areaHref(`/leads/${encodeURIComponent(missed.leadNo)}`, area)} key={missed.id}><strong>{missed.claimant}<small>{missed.leadNo} · Missed {callTime(missed.occurredAt)}</small></strong><span>{followup ? followup.direction === "outbound" ? `Return attempt by ${followup.agent} · ${callTime(followup.occurredAt)}` : `Client reached ${followup.agent} · ${callTime(followup.occurredAt)}` : "No linked follow-up in this week"}</span></Link>)}
      {!missedInbound.length && <p>No provider-confirmed missed inbound calls on linked files this week.</p>}
    </section>
    <section className="packet-agent-counts"><h2>Scheduled client callbacks <span className="call-count">{callbacks.length}</span></h2><p>Appointments recorded in the intake. Their presence here does not verify that a callback occurred; open the file and linked call history to check.</p>
      {callbacksTruncated && <p className="packet-warning" role="alert">This week reached the 1,000 callback read limit. Older scheduled callbacks may be missing.</p>}
      <div className="call-callback-head"><span>Client</span><span>Scheduled</span><span>Agent</span></div>
      {callbacks.map((r) => <Link className="call-callback-row" href={areaHref(`/leads/${encodeURIComponent(r.leadNo)}`, area)} key={r.id}><strong>{r.claimant}<small>{r.leadNo}</small></strong><span>{callTime(r.callbackAt)}</span><span>{r.agent}</span></Link>)}
      {!callbacks.length && <p>No callbacks scheduled for this week.</p>}
    </section>
    <div className="packet-tabs" role="tablist" aria-label="Call directions">
      {(["all", "inbound", "outbound"] as const).map((item) => <button type="button" role="tab" aria-selected={direction === item} className={direction === item ? "active" : ""} key={item} onClick={() => setDirection(item)}>{item === "all" ? "All calls" : item === "inbound" ? "Inbound" : "Outbound"}</button>)}
    </div>
    <div className="packet-toolbar"><label>Find a call<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, file, agent or case" /></label><button type="button" onClick={() => exportRows(filtered, monday)}>Export visible CSV</button></div>
    <div className="packet-list" role="list">{filtered.map((r) => <Link role="listitem" key={r.id} className="call-activity-row" href={areaHref(`/leads/${encodeURIComponent(r.leadNo)}`, area)}><span><strong>{r.claimant}</strong><small>{r.leadNo} · {r.campaign}</small></span><span><strong>{r.agent}</strong><small>{callTime(r.occurredAt)}</small></span><span className={`packet-stage ${r.inboundOutcome === "missed" ? "held" : ""}`}>{r.direction === "outbound" ? "Outbound" : r.inboundOutcome === "unknown" ? "Inbound · outcome unknown" : `Inbound · ${r.inboundOutcome}`}</span><span>{r.durationSec != null && r.durationSec > 0 ? `${Math.ceil(r.durationSec / 60)} min recorded` : "Duration unverified"}</span></Link>)}{!filtered.length && <p className="packet-empty">No linked calls match this view.</p>}</div>
    <p className="packet-scope">Unlinked inbound calls, calls placed outside ClaimReach, and callbacks without a verified file link are excluded. This report does not grade callback timeliness or label an agent as having stopped follow-up; the production dial-cadence tracker is still awaiting its reviewed database migration.</p>
  </main>;
}
