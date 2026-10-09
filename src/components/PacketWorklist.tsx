"use client";

import Link from "next/link";
import FileNavigation from "./FileNavigation";
import { useMemo, useState } from "react";
import type { PacketRow } from "@/lib/packet-worklist";
import { pacificDay, shiftWeek } from "@/lib/packet-worklist";
import FileArchiveButton from "./FileArchiveButton";
import { SIGNED_SENT_TO_FIRM } from "@/lib/statuses";
import "./packet-worklist.css";

type View = "needs" | "week";
type ImportedRow = { leadId: string; claimId: string; leadNo: string; name: string; campaign: string; firm: string; signedAt: string | null;
  deliveredAt: string | null; ownerSent?: boolean; returnEndsAt: string | null; daysLeft: number | null; cleared: boolean; status: string; archived: boolean };

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  // A claimant name or campaign can start with spreadsheet formula syntax.
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(rows: PacketRow[], label: string) {
  const header = ["File", "Client", "Case", "Firm", "Agent", "Signed", "Verified sent to firm", "Return window ends", "Review window cleared", "Status", "Archived"];
  const csv = [header, ...rows.map((r) => [r.leadNo, r.name, r.campaign, r.firm, r.agent, r.signedAt, r.deliveredAt || "", r.returnEndsAt || "", r.readyToBill ? "Yes" : "No", r.stageLabel, r.archived ? "Yes" : "No"])].map((line) => line.map(escapeCsv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `claimreach-${label}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function PacketWorklist({ rows, imported = [], monday, truncated }: { rows: PacketRow[]; imported?: ImportedRow[]; monday: string; truncated: boolean }) {
  const [view, setView] = useState<View>("needs");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const nextMonday = shiftWeek(monday, 1);
  const sunday = new Date(Date.parse(`${nextMonday}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const importedRows = useMemo<PacketRow[]>(() => imported.filter(r => r.status !== "signed_dropped").map((r) => ({
    leadId: r.leadId, claimId: r.claimId, leadNo: r.leadNo, name: r.name, campaign: r.campaign, firm: r.firm,
    signedAt: r.signedAt || "", deliveredAt: r.deliveredAt, returnEndsAt: r.returnEndsAt, returnDaysLeft: r.daysLeft,
    readyToBill: r.cleared, agent: "Imported from LawRuler", archived: r.archived, ownerSent: r.ownerSent,
    stage: r.deliveredAt || r.ownerSent ? "delivered" : r.status === "signed_approved" ? "ready" : "qa",
    stageLabel: r.ownerSent || r.deliveredAt ? SIGNED_SENT_TO_FIRM : r.status === "signed_approved" ? "Reviewed · not sent" : "Verify original · not sent",
  })), [imported]);
  const visibleRows = rows.filter((r) => showArchived || !r.archived);
  const visibleImported = importedRows.filter((r) => showArchived || !r.archived);
  const pending = visibleRows.filter((r) => r.stage !== "delivered");
  const pendingImported = visibleImported.filter((r) => r.stage !== "delivered");
  const week = [...visibleRows, ...visibleImported].filter((r) => {
    const basis = r.agent === "Imported from LawRuler" ? r.deliveredAt || r.signedAt : r.signedAt;
    if (!basis) return false;
    const day = pacificDay(basis);
    return day >= monday && day < nextMonday;
  });
  const source = view === "needs" ? pending : week;
  const filtered = source.filter((r) => `${r.name} ${r.leadNo} ${r.agent} ${r.campaign} ${r.firm}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredImported = pendingImported.filter((r) => `${r.name} ${r.leadNo} ${r.campaign}`.toLowerCase().includes(query.trim().toLowerCase()));
  const ready = [...pending, ...pendingImported].filter((r) => r.stage === "ready").length;
  const qa = [...pending, ...pendingImported].filter((r) => r.stage === "qa").length;
  const finish = pending.filter((r) => r.stage === "finish").length;
  const held = pending.filter((r) => r.stage === "held").length;
  const deliveredWeek = week.filter((r) => r.stage === "delivered").length;
  const billingReady = week.filter((r) => r.readyToBill).length;
  const returnOpen = week.filter((r) => r.deliveredAt && !r.readyToBill).length;
  const agentCounts = [...new Set(week.map((r) => r.agent))].map((agent) => ({ agent, signed: week.filter((r) => r.agent === agent).length, delivered: week.filter((r) => r.agent === agent && r.stage === "delivered").length })).sort((a, b) => b.signed - a.signed || a.agent.localeCompare(b.agent));

  return <main className="packet-page">
    <FileNavigation />
    <div className="packet-heading"><div><h1>Operator work list</h1><p>Review files that need attention, send completed packets to the firm, and check this week's deliveries.</p></div></div>
    {truncated && <p className="packet-warning" role="alert">This list reached a record read limit. Older packets may be missing; do not use this export as a complete billing ledger.</p>}
    <div className="packet-tabs" role="tablist" aria-label="Signed packet views">
      <button type="button" role="tab" aria-selected={view === "needs"} className={view === "needs" ? "active" : ""} onClick={() => setView("needs")}>Needs action <span>{pending.length + pendingImported.length}</span></button>
      <button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "active" : ""} onClick={() => setView("week")}>This week <span>{week.length}</span></button>
    </div>
    {view === "needs" ? <div className="packet-metrics needs" aria-label="Packets needing action"><div><strong>{ready}</strong><span>Ready to send</span></div><div><strong>{qa}</strong><span>Awaiting QA</span></div><div><strong>{finish}</strong><span>Finish packet</span></div><div><strong>{held}</strong><span>Held or unverified</span></div></div> : <><div className="packet-week"><Link href={`/packets?week=${shiftWeek(monday, -1)}`} aria-label="Previous week">←</Link><strong>{monday} to {sunday}</strong><Link href={`/packets?week=${shiftWeek(monday, 1)}`} aria-label="Next week">→</Link></div><div className="packet-metrics packet-week-metrics"><div><strong>{week.length}</strong><span>Packets this week</span></div><div><strong>{deliveredWeek}</strong><span>Verified sent to firm</span></div><div><strong>{returnOpen}</strong><span>In 7-day return window</span></div><div><strong>{billingReady}</strong><span>Review window cleared</span></div></div></>}
    <div className="packet-toolbar"><label>Find a packet<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, file, agent, case or firm" /></label><label className="packet-archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived ({rows.filter((r) => r.archived).length + importedRows.filter((r) => r.archived).length})</label><button type="button" onClick={() => downloadCsv(view === "needs" ? [...filteredImported, ...filtered] : filtered, view === "needs" ? "needs-delivery" : `signed-week-${monday}`)}>Export visible CSV</button></div>
    {view === "needs" && filteredImported.length > 0 && <section className="packet-imported"><h2>Imported signed packets · not sent <span>{filteredImported.length}</span></h2><p>Open the file, inspect its original PDFs, and use the one firm-send action. A source status alone is not firm delivery.</p><div className="packet-list" role="list">{filteredImported.map((row) => <div role="listitem" className="packet-item" key={row.claimId}><Link className="packet-row" href={`/leads/${encodeURIComponent(row.leadNo)}?claim=${encodeURIComponent(row.claimId || "")}`}><span className="packet-person"><strong>{row.name}</strong><small>{row.leadNo} · {row.campaign}{row.archived ? " · Archived" : ""}</small></span><span className={`packet-stage ${row.stage}`}>{row.stageLabel}</span><span className="packet-arrow" aria-hidden="true">›</span></Link><div className="packet-item-action"><FileArchiveButton leadId={row.leadId} label={`${row.name} (${row.leadNo})`} archivedAt={row.archived ? "archived" : null} allowed /></div></div>)}</div></section>}
    {view === "needs" && filteredImported.length > 0 && <h2 className="packet-subheading">ClaimReach signed packets</h2>}
    <div className="packet-list" role="list">
      {filtered.length ? filtered.map((r) => <div role="listitem" className="packet-item" key={`${r.leadId}:${r.claimId || "lead"}`}><Link className="packet-row" href={`/leads/${encodeURIComponent(r.leadNo)}${r.claimId ? `?claim=${encodeURIComponent(r.claimId)}` : ""}`}>
        <span className="packet-person"><strong>{r.name}</strong><small>{r.leadNo} · {r.campaign}{r.archived ? " · Archived" : ""}</small></span>
        <span className="packet-context"><strong>{r.agent}</strong><small>{r.firm}</small></span>
        <span className="packet-date"><strong>Signed {formatDate(r.signedAt)}</strong><small>{r.deliveredAt ? `Firm delivery ${formatDate(r.deliveredAt)} · return ends ${formatDate(r.returnEndsAt)}` : r.ownerSent ? "Sent to firm · owner confirmed · date unknown" : "Firm delivery not verified"}</small></span>
        <span className={`packet-stage ${r.stage}`}>{r.stageLabel}</span><span className="packet-arrow" aria-hidden="true">›</span>
      </Link><div className="packet-item-action"><FileArchiveButton leadId={r.leadId} label={`${r.name} (${r.leadNo})`} archivedAt={r.archived ? "archived" : null} allowed /></div></div>) : <p className="packet-empty">{query ? "No packets match that search." : view === "needs" ? "No signed packets need delivery." : "No signed packets in this week."}</p>}
    </div>
    {view === "week" && <section className="packet-agent-counts"><h2>By intake agent</h2><p>Counts are attributed to the linked intake call when available; otherwise the agreement sender. Confirm commission rules before paying.</p><div className="packet-agent-head"><span>Agent</span><span>Signed</span><span>Sent</span></div>{agentCounts.map((r) => <div className="packet-agent-row" key={r.agent}><strong>{r.agent}</strong><span>{r.signed}</span><span>{r.delivered}</span></div>)}</section>}
    <p className="packet-scope">This view counts primary INNO MVA DocuSeal packets and separately reviewed LawRuler originals. NETFLY original uploads and other case types are separate. The seven-day clock starts from a verified ClaimReach send or an owner-recorded outside send to the configured firm address. Wednesday billing and commissions are managed in Payroll & billing; the review window does not delay payment.</p>
  </main>;
}
