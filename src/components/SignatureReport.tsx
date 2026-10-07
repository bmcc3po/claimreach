"use client";
import { useState } from "react";
import { signatureCsv, signatureRowsInRange, type SignatureReportRow, type SignatureState } from "@/lib/signature-report";
import { mondayOf, pacificDay, shiftWeek } from "@/lib/packet-worklist";
import { SIGNED_SENT_TO_FIRM } from "@/lib/statuses";
import "./signature-report.css";

const labels: Record<SignatureState, string> = { signed: "Signed", unsigned: "Not signed", verify: "Needs verification" };
const date = (v: string | null) => v ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" }).format(new Date(v)) : "Date not recorded";
export default function SignatureReport({ rows, firm, generatedAt }: { rows: SignatureReportRow[]; firm: string; generatedAt: string }) {
  const [state, setState] = useState<SignatureState | "declined">("signed");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archived, setArchived] = useState(false);
  const [tests, setTests] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const currentMonday = mondayOf(pacificDay(generatedAt));
  const available = rows.filter(r => (archived || !r.archived) && (tests || !r.test));
  const matchesState = (r: SignatureReportRow, key: SignatureState | "declined") => key === "declined" ? r.declined : !r.declined && r.state === key;
  const viewLabel = state === "declined" ? "Declined / bad signs" : labels[state];
  const hasSigningDates = state === "signed" || state === "declined";
  const counts = (key: SignatureState | "declined") => available.filter(r => matchesState(r, key)).length;
  const matching = available.filter(r => matchesState(r, state) && (r.name + " " + r.leadNo).toLowerCase().includes(query.toLowerCase().trim()));
  const visible = (state === "signed" || state === "declined") && range !== "all" ? signatureRowsInRange(matching, from, to) : matching;
  const unknown = matching.filter(r => !r.signedAt).length;
  const chosen = visible.filter(r => selected.includes(r.claimId));
  const sent = visible.filter(r => r.deliveredAt || r.ownerSent).length;
  function setPeriod(value: string) {
    setRange(value); setSelected([]);
    if (value === "last") { setFrom(shiftWeek(currentMonday, -1)); setTo(new Date(Date.parse(currentMonday + "T12:00:00Z") - 86400000).toISOString().slice(0, 10)); }
    else if (value === "this") { setFrom(currentMonday); setTo(pacificDay(generatedAt)); }
    else { setFrom(""); setTo(""); }
  }
  function download() {
    const exported = chosen.length ? chosen : visible;
    const href = URL.createObjectURL(new Blob([signatureCsv(exported, firm, generatedAt)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = href; a.download = "INNO-MVA-" + state + "-" + pacificDay(generatedAt) + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <main className="signature-report">
    <header className="sr-heading"><div><p className="sr-eyebrow">{firm} · INNO MVA</p><h1>Invoice report</h1>
      <p>See who signed. Choose your files. Export your invoice list.</p></div></header>
    <nav className="sr-tabs" aria-label="Signature status">
      {(["signed", "unsigned", "verify", "declined"] as const).map(key => <button key={key} type="button" aria-pressed={key === state} onClick={() => { setState(key); setSelected([]); }}>
        <span>{key === "declined" ? "Declined / bad signs" : labels[key]}</span><strong>{counts(key)}</strong></button>)}
    </nav>
    <section className="sr-list" aria-label="Signature report">
      <div className="sr-controls">
        <label className="sr-search">Find a file<input type="search" placeholder="Name or file number" value={query} onChange={e => { setQuery(e.target.value); setSelected([]); }} /></label>
        {hasSigningDates && <label>Signed date<select value={range} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All signed files</option><option value="last">Last week</option><option value="this">This week</option><option value="custom">Choose dates</option></select></label>}
        <button type="button" className="sr-export" disabled={!visible.length || !!(from && to && from > to)} onClick={download}>Export {chosen.length || visible.length} {chosen.length ? "selected " : ""}files</button>
      </div>
      {hasSigningDates && range !== "all" && <div className="sr-dates">
        <label>From<input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelected([]); }} /></label>
        <label>Through<input type="date" value={to} onChange={e => { setTo(e.target.value); setSelected([]); }} /></label>
        <span>Signing dates · Pacific time</span>
        {from && to && from > to && <p role="alert">The end date must be on or after the start date.</p>}
      </div>}
      {hasSigningDates && range !== "all" && unknown > 0 && <p className="sr-notice">{unknown} signed {unknown === 1 ? "file has" : "files have"} no recorded signing date and {unknown === 1 ? "is" : "are"} outside this date filter. <button onClick={() => setPeriod("all")}>Show all signed files</button></p>}
      <div className="sr-summary"><b>{visible.length} {viewLabel.toLowerCase()} files</b><span>{sent} sent to firm{!hasSigningDates ? " · no signing-date filter" : ""}</span>
        <label><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setSelected([]); }} /> Include archived</label>
        <label><input type="checkbox" checked={tests} onChange={e => { setTests(e.target.checked); setSelected([]); }} /> Include tests</label>
      </div>
      <div className="sr-table">
        <div className="sr-row sr-column-head">
          <label><input aria-label="Select all visible files" type="checkbox" checked={visible.length > 0 && chosen.length === visible.length} onChange={e => setSelected(e.target.checked ? visible.map(r => r.claimId) : [])} /></label>
          <span>Client / file</span><span>File status</span><span>Firm delivery</span><span>Packet / agent</span>
        </div>
        {visible.map(r => <div className="sr-row" key={r.claimId}>
          <label className="sr-check"><input type="checkbox" aria-label={"Select " + r.name} checked={selected.includes(r.claimId)} onChange={e => setSelected(old => e.target.checked ? [...old, r.claimId] : old.filter(id => id !== r.claimId))} /></label>
          <div className="sr-client"><a href={r.href}>{r.name}</a><small>{r.leadNo}{r.archived ? " · Archived" : ""}{r.test ? " · TEST" : ""}</small>{state !== "signed" && <small>{r.status}</small>}</div>
          <div className="sr-signature"><b className={"sr-state sr-" + r.state}>{r.declined ? "Declined · no commission" : r.state === "signed" && (r.deliveredAt || r.ownerSent) ? SIGNED_SENT_TO_FIRM : labels[r.state]}</b><small>{r.state === "signed" ? date(r.signedAt) : r.detail}</small>{r.state === "signed" && !r.signedAt && <small>Owner confirmed</small>}</div>
          <div className="sr-delivery"><b>{r.deliveredAt || r.ownerSent ? "Sent to firm" : "Delivery not recorded"}</b><small>{r.deliveredAt ? date(r.deliveredAt) : r.ownerSent ? "Owner confirmed · date unknown" : "Check before resending"}</small>{r.returnEndsAt && <small>Return window ends {date(r.returnEndsAt)}</small>}</div>
          <div className="sr-packet"><b>{r.agent}</b><small>{r.packet}</small>{r.declined && <><strong>Bad sign: {r.declineReason}</strong><small>Recorded for: {r.badSignAgent || r.agentName || 'Agent not recorded'}</small></>}<strong style={{ color: r.firmDecision === 'Firm rejected' ? '#a12525' : undefined }}>{r.firmDecision}</strong>{r.firmReason && <small>{r.firmReason}</small>}</div>
        </div>)}
        {!visible.length && <p className="sr-empty">No files match these filters.</p>}
      </div>
      <footer><p>Invoice history is not tracked here. Reconcile this list with prior invoices before billing.</p>
        <small>Updated {new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt))} Pacific · <a href="">Refresh</a></small></footer>
    </section>
  </main>;
}
