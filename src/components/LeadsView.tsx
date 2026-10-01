"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STAGES, STAGE_LABELS } from "@/lib/questionnaire";
import TierBadge from "./TierBadge";
import Icon from "./ui/Icon";
import { DEFAULT_STATUSES, DEFAULT_DQ_REASONS, resolveStatus, type StatusDef, type DqReason } from "@/lib/statuses";
import { primaryClock } from "@/lib/sla-clocks";
import { tierLabel } from "@/lib/tiers";
import { caseName, ago, prettyPhone } from "@/lib/case-name";
import { pacificCalendarDay } from "@/lib/packet-worklist";

type Row = any;
type Phase = "all" | "action" | "pre_qa" | "in_qa" | "post_qa" | "terminal";

// Shared leads surface used by staff (Leads, Signed) and firms (Cases). The
// table is the default: one row per file, name and phone on the left, what the
// case is and what she told us, where it stands, and when it last moved. Tabs
// across the top split the list by where files are in the pipe; everything
// else that narrows it sits behind Filters. Board and Timeline stay one click
// away.
export default function LeadsView({ leads, basePath = "/leads", addPath = "/intake", title = "Leads", agents = [], firms = [], canBulk = false, statuses = [], dqReasons = [], variant = "staff" }: { leads: Row[]; basePath?: string; addPath?: string; title?: string; agents?: { id: string; full_name: string }[]; firms?: { id: string; name: string }[]; canBulk?: boolean; statuses?: StatusDef[]; dqReasons?: DqReason[]; variant?: "staff" | "firm" }) {
  const isFirm = variant === "firm";
  const showBulk = canBulk && !isFirm;
  const statusList = statuses.length ? statuses : DEFAULT_STATUSES;
  const dqList = dqReasons.length ? dqReasons : DEFAULT_DQ_REASONS;
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "board" | "gantt">("table");
  const [groupBy, setGroupBy] = useState<"status" | "stage" | "tier">("status");
  const [phase, setPhase] = useState<Phase>("all");
  const [fType, setFType] = useState("all");
  const [fState, setFState] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "updated", dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkErr, setBulkErr] = useState(false);

  const [showMore, setShowMore] = useState(false);
  const [fFirm, setFFirm] = useState("all");
  const [fCampaign, setFCampaign] = useState("all");
  const [fCity, setFCity] = useState("all");
  const [fCreatedFrom, setFCreatedFrom] = useState("");
  const [fCreatedTo, setFCreatedTo] = useState("");
  const [fSignedFrom, setFSignedFrom] = useState("");
  const [fSignedTo, setFSignedTo] = useState("");

  const phaseOf = (statusKey: string) => resolveStatus(statusKey, statusList).phase;

  // Every filter except the tabs. The tab counts come from this, so a count
  // always says what clicking that tab will show.
  const base = useMemo(() => {
    let r = leads.map((l) => {
      const c = (l.claims ?? [])[0] ?? {};
      const status = c.status ?? "new";
      const def = resolveStatus(status, statusList);
      const clock = primaryClock({
        signed_at: l.signed_at, firm_sent_at: l.firm_sent_at,
        esign_sent_at: l.esign_sent_at, esign_status: null,
        current_status: status, statusLabel: def.label ?? status,
      });
      return {
        id: l.id, lead_no: l.lead_no, key: isFirm ? l.id : (l.lead_no || l.id), firm_ref: l.firm_ref_no ?? "",
        name: l.claimant_name ?? "", phone: l.phone ?? "",
        loc: l.address ?? "", state: l.mail_state ?? l.state ?? "",
        city: l.mail_city ?? "", firm_id: l.firm_id ?? "", signed_at: l.signed_at ?? null,
        type: l.case_type ?? c.claim_type ?? "", campaign: c.campaign ?? l.campaign ?? "",
        caseLabel: caseName(c.campaign ?? l.campaign, l.case_type ?? c.claim_type),
        status, statusLabel: def.label, tone: def.tone, phase: def.phase ?? phaseOf(status),
        stage: l.stage ?? "referral_received",
        tier: c.tier ?? "", tier_letter: c.tier_letter, tier_number: c.tier_number,
        summary: c.case_summary ?? "", created: l.created_at, updated: l.updated_at,
        flag: l.supervisor_flag, clock,
        needsAction: status === "new" || status === "contact_attempted" || l.supervisor_flag,
      };
    });
    if (fType !== "all") r = r.filter((x) => x.type === fType);
    if (fState !== "all") r = r.filter((x) => x.state === fState);
    if (fStatus !== "all") r = r.filter((x) => x.status === fStatus);
    if (fFirm !== "all") r = r.filter((x) => x.firm_id === fFirm);
    if (fCampaign !== "all") r = r.filter((x) => x.campaign === fCampaign);
    if (fCity !== "all") r = r.filter((x) => x.city === fCity);
    // Compare on the calendar day, so "from the 9th" includes the whole 9th.
    const day = (v: any) => (v ? pacificCalendarDay(String(v)) : "");
    if (fCreatedFrom) r = r.filter((x) => day(x.created) >= fCreatedFrom);
    if (fCreatedTo) r = r.filter((x) => day(x.created) <= fCreatedTo);
    if (fSignedFrom) r = r.filter((x) => day(x.signed_at) && day(x.signed_at) >= fSignedFrom);
    if (fSignedTo) r = r.filter((x) => day(x.signed_at) && day(x.signed_at) <= fSignedTo);
    if (q.trim()) {
      const t = q.toLowerCase().trim();
      const digits = t.replace(/\D/g, "");
      r = r.filter((x) => x.name.toLowerCase().includes(t) || (digits.length >= 3 && x.phone.replace(/\D/g, "").includes(digits)) ||
        String(x.lead_no ?? "").toLowerCase().includes(t) || x.caseLabel.toLowerCase().includes(t) || x.summary.toLowerCase().includes(t));
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, q, fType, fState, fStatus, fFirm, fCampaign, fCity, fCreatedFrom, fCreatedTo, fSignedFrom, fSignedTo, statuses]);

  const counts = useMemo(() => {
    const c: Record<Phase, number> = { all: base.length, action: 0, pre_qa: 0, in_qa: 0, post_qa: 0, terminal: 0 };
    for (const r of base) { if (r.needsAction) c.action++; c[r.phase as Phase] = (c[r.phase as Phase] ?? 0) + 1; }
    return c;
  }, [base]);

  const rows = useMemo(() => {
    let r = base;
    if (phase === "action") r = r.filter((x) => x.needsAction);
    else if (phase !== "all") r = r.filter((x) => x.phase === phase);
    const key = (x: any) => sort.k === "case" ? x.caseLabel : sort.k === "status" ? x.statusLabel : x[sort.k];
    return [...r].sort((a: any, b: any) => { const av = key(a) ?? "", bv = key(b) ?? ""; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; });
  }, [base, phase, sort]);

  const types = Array.from(new Set(leads.map((l) => l.case_type ?? l.claims?.[0]?.claim_type).filter(Boolean)));
  // Built from the UNFILTERED set, so choosing one filter never empties another.
  const allRows = useMemo(() => leads.map((l: any) => ({
    state: l.mail_state ?? l.state ?? "", city: l.mail_city ?? "",
    firm_id: l.firm_id ?? "", campaign: (l.claims ?? [])[0]?.campaign ?? "",
  })), [leads]);
  const states = Array.from(new Set(allRows.map((r) => r.state).filter(Boolean))).sort();
  const cities = Array.from(new Set(allRows.map((r) => r.city).filter(Boolean))).sort();
  const campaignList = Array.from(new Set(allRows.map((r) => r.campaign).filter(Boolean))).sort();
  const firmById = new Map((firms ?? []).map((f: any) => [f.id, f.name ?? f.slug]));
  const firmIds = Array.from(new Set(allRows.map((r) => r.firm_id).filter(Boolean)));

  // What is narrowing the list right now, each one removable on its own.
  const active: { label: string; value: string; clear: () => void }[] = [];
  if (fStatus !== "all") active.push({ label: "Status", value: resolveStatus(fStatus, statusList).label, clear: () => setFStatus("all") });
  if (fType !== "all") active.push({ label: "Case type", value: caseName(null, fType), clear: () => setFType("all") });
  if (fFirm !== "all") active.push({ label: "Firm", value: String(firmById.get(fFirm) ?? fFirm), clear: () => setFFirm("all") });
  if (fCampaign !== "all") active.push({ label: "Campaign", value: caseName(fCampaign, null), clear: () => setFCampaign("all") });
  if (fState !== "all") active.push({ label: "State", value: fState, clear: () => setFState("all") });
  if (fCity !== "all") active.push({ label: "City", value: fCity, clear: () => setFCity("all") });
  if (fCreatedFrom) active.push({ label: "Created from", value: fCreatedFrom, clear: () => setFCreatedFrom("") });
  if (fCreatedTo) active.push({ label: "Created to", value: fCreatedTo, clear: () => setFCreatedTo("") });
  if (fSignedFrom) active.push({ label: "Signed from", value: fSignedFrom, clear: () => setFSignedFrom("") });
  if (fSignedTo) active.push({ label: "Signed to", value: fSignedTo, clear: () => setFSignedTo("") });
  // The standard Export carries the Filters set here, so the file holds the
  // matters this list is narrowed to (campaign, case type and status are
  // tested on each matter). The tabs and the search box are not sent.
  const exportHref = (() => {
    const p = new URLSearchParams();
    if (fCampaign !== "all") p.set("campaign", fCampaign);
    if (fType !== "all") p.set("case_type", fType);
    if (fStatus !== "all") p.set("status", fStatus);
    if (fFirm !== "all") p.set("firm_id", fFirm);
    if (fState !== "all") p.set("state", fState);
    if (fCity !== "all") p.set("city", fCity);
    if (fCreatedFrom) p.set("since", fCreatedFrom);
    if (fCreatedTo) p.set("until", fCreatedTo);
    if (fSignedFrom) p.set("signed_from", fSignedFrom);
    if (fSignedTo) p.set("signed_to", fSignedTo);
    const s = p.toString();
    return `/api/export/standard${s ? `?${s}` : ""}`;
  })();
  function clearFilters() {
    setFType("all"); setFState("all"); setFStatus("all"); setFFirm("all");
    setFCampaign("all"); setFCity("all");
    setFCreatedFrom(""); setFCreatedTo(""); setFSignedFrom(""); setFSignedTo(""); setQ("");
  }

  // ---- Bulk selection ----
  const pageIds = rows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  function toggleOne(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setAllMatching(false);
  }
  function togglePage() {
    setSel((s) => {
      const n = new Set(s);
      if (allPageSelected) pageIds.forEach((id) => n.delete(id));
      else pageIds.forEach((id) => n.add(id));
      return n;
    });
    setAllMatching(false);
  }
  function clearSel() { setSel(new Set()); setAllMatching(false); }
  const targetIds = allMatching ? pageIds : Array.from(sel);
  const selCount = targetIds.length;

  const [moveFirm, setMoveFirm] = useState("");
  const [moveCamps, setMoveCamps] = useState<{ id: string; name: string }[]>([]);
  async function pickMoveFirm(firmId: string) {
    setBulkMsg(""); setBulkErr(false);
    try {
      const d = await (await fetch("/api/campaigns")).json();
      const list = (d.campaigns ?? []).filter((c: any) => c.firm_id === firmId).map((c: any) => ({ id: c.id, name: c.name }));
      if (!list.length) { setBulkErr(true); setBulkMsg("That firm has no campaign to move these files into. Add one first."); return; }
      setMoveCamps(list); setMoveFirm(firmId);
    } catch { setBulkErr(true); setBulkMsg("Could not load that firm's campaigns. Nothing was changed."); }
  }

  async function runBulk(body: any) {
    if (selCount === 0) return;
    setBusy(true); setBulkMsg(""); setBulkErr(false);
    try {
      const r = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ids: targetIds }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setBulkErr(true); setBulkMsg(d.error || "That did not go through. Nothing was changed."); return; }
      setBulkMsg(`Done: ${d.count} updated. Refreshing.`);
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setBulkErr(true); setBulkMsg("Could not reach the server. Nothing was changed.");
    } finally { setBusy(false); }
  }

  async function runBulkStatus(statusKey: string) {
    const def = statusList.find((s) => s.key === statusKey);
    let dq_reason_key: string | undefined;
    if (def?.qualify === "disqualify") {
      // Mandatory, non-dismissable: keep prompting until a valid reason is chosen.
      const choices = dqList.map((r, i) => `${i + 1}. ${r.label}`).join("\n");
      let pick: string | null = null;
      while (!dq_reason_key) {
        pick = window.prompt(`Disqualification reason (required) for "${def.label}":\n${choices}\n\nEnter the number:`);
        if (pick === null) return; // cancel aborts the whole status change
        const idx = parseInt(pick.trim(), 10) - 1;
        if (idx >= 0 && idx < dqList.length) dq_reason_key = dqList[idx].key;
      }
    }
    runBulk({ op: "set_status", status: statusKey, dq_reason_key });
  }

  function th(k: string, label: string, cls = "") {
    const on = sort.k === k;
    return (
      <th className={`${cls}${on ? " cl-sorted" : ""}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : (k === "updated" || k === "created" ? -1 : 1) }))}>
          {label}{on && <span aria-hidden="true">{sort.dir === 1 ? "↑" : "↓"}</span>}
        </button>
      </th>
    );
  }

  // ---- BOARD lanes ----
  const laneDefs = useMemo(() => {
    if (groupBy === "status") return [
      { key: "pre_qa", label: "Intake", tone: "#2563eb" },
      { key: "in_qa", label: "In QA", tone: "#0891b2" },
      { key: "post_qa", label: "Approved / Firm", tone: "#2f8a52" },
      { key: "terminal", label: "Closed", tone: "#c0392f" },
    ];
    if (groupBy === "stage") return STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] ?? s, tone: "#16324f" }));
    return ["A", "B", "C", "D", "E", "F", "untiered"].map((t) => ({ key: t, label: t === "untiered" ? "Untiered" : `Tier ${t}`, tone: "#2563eb" }));
  }, [groupBy]);

  function laneOf(r: any) {
    if (groupBy === "status") return phaseOf(r.status);
    if (groupBy === "stage") return r.stage;
    return r.tier_letter ?? "untiered";
  }

  // ---- GANTT ----
  const stageIndex = (s: string) => Math.max(0, (STAGES as readonly string[]).indexOf(s));

  const TABS: { k: Phase; label: string }[] = [
    { k: "all", label: "All" },
    { k: "action", label: "Needs action" },
    { k: "pre_qa", label: "Intake" },
    { k: "in_qa", label: "In QA" },
    { k: "post_qa", label: "Approved and firm" },
    { k: "terminal", label: "Closed" },
  ];
  const open = (r: any) => { window.location.href = `${basePath}/${encodeURIComponent(r.key)}`; };
  const clockTone = (t: string) => (t === "overdue" ? "cl-tone-bad" : t === "urgent" || t === "warn" ? "cl-tone-warn" : "cl-tone-good");
  const colCount = (showBulk ? 1 : 0) + 7;

  return (
    <div>
      <div className="cl-head">
        <div>
          <h1 className="cl-h1">{title}<small>{rows.length}{rows.length !== leads.length ? ` of ${leads.length}` : ""}</small></h1>
        </div>
        <div className="cl-acts">
          {!isFirm && (
            <div className="seg-toggle" role="tablist" aria-label="View">
              <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
              <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button>
              <button className={view === "gantt" ? "active" : ""} onClick={() => setView("gantt")}>Timeline</button>
            </div>
          )}
          {!isFirm && <a className="cl-btn" href={exportHref} title={active.length ? "Every standard field for the matters these filters show (the tab and search box are not applied)" : "Every standard field, the same names every webhook uses"}><Icon name="download" size={16} />Export</a>}
          {!isFirm && <a className="cl-btn" href="/api/export?format=neos" title="The older NEOS column layout">NEOS export</a>}
          {!isFirm && addPath && addPath !== basePath && <Link className="cl-btn" href={addPath}><Icon name="userplus" size={16} />Add lead</Link>}
        </div>
      </div>

      <div className="cl-tabs" role="tablist" aria-label="Where the files are">
        {TABS.filter((t) => t.k === "all" || counts[t.k] > 0 || phase === t.k).map((t) => (
          <button key={t.k} role="tab" aria-selected={phase === t.k} className={`cl-tab${phase === t.k ? " cl-on" : ""}`} onClick={() => setPhase(t.k)}>
            {t.label}<span>{counts[t.k]}</span>
          </button>
        ))}
      </div>

      <div className="cl-tools">
        <label className="cl-find">
          <Icon name="search" size={16} />
          <input className="cl-input" type="search" placeholder="Find by name, phone, lead number or what the PNC said" aria-label="Find in this list"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="cl-select" value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Case type">
          <option value="all">All case types</option>
          {types.map((t) => <option key={String(t)} value={String(t)}>{caseName(null, String(t))}</option>)}
        </select>
        <button className="cl-btn" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          <Icon name="filter" size={15} />Filters{active.length ? ` (${active.length})` : ""}
        </button>
        {(active.length > 0 || q) && <button className="cl-btn cl-ghost" onClick={clearFilters}>Clear all</button>}
        {!isFirm && view === "board" && (
          <select className="cl-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} aria-label="Group the board by">
            <option value="status">Group by status</option>
            <option value="stage">Group by stage</option>
            <option value="tier">Group by tier</option>
          </select>
        )}
      </div>

      {showMore && (
        <div className="cl-filters">
          <label className="cl-lab">Status
            <select className="cl-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">Any status</option>
              {statusList.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="cl-lab">Campaign
            <select className="cl-select" value={fCampaign} onChange={(e) => setFCampaign(e.target.value)}>
              <option value="all">Any campaign</option>
              {campaignList.map((c) => <option key={c} value={c}>{caseName(c, null)}</option>)}
            </select>
          </label>
          {!isFirm && firmIds.length > 1 && (
            <label className="cl-lab">Firm
              <select className="cl-select" value={fFirm} onChange={(e) => setFFirm(e.target.value)}>
                <option value="all">Any firm</option>
                {firmIds.map((id) => <option key={String(id)} value={String(id)}>{firmById.get(id) ?? String(id)}</option>)}
              </select>
            </label>
          )}
          <label className="cl-lab">State
            <select className="cl-select" value={fState} onChange={(e) => setFState(e.target.value)}>
              <option value="all">Any state</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="cl-lab">City
            <select className="cl-select" value={fCity} onChange={(e) => setFCity(e.target.value)}>
              <option value="all">Any city</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="cl-lab">Created from<input className="cl-input" type="date" value={fCreatedFrom} onChange={(e) => setFCreatedFrom(e.target.value)} /></label>
          <label className="cl-lab">Created to<input className="cl-input" type="date" value={fCreatedTo} onChange={(e) => setFCreatedTo(e.target.value)} /></label>
          <label className="cl-lab">Signed from<input className="cl-input" type="date" value={fSignedFrom} onChange={(e) => setFSignedFrom(e.target.value)} /></label>
          <label className="cl-lab">Signed to<input className="cl-input" type="date" value={fSignedTo} onChange={(e) => setFSignedTo(e.target.value)} /></label>
        </div>
      )}

      {active.length > 0 && (
        <div className="cl-active">
          {active.map((a) => (
            <button key={a.label} className="cl-token" onClick={a.clear} aria-label={`Remove ${a.label} ${a.value}`}>
              <em>{a.label}</em>{a.value}<Icon name="x" size={14} />
            </button>
          ))}
        </div>
      )}

      {(isFirm || view === "table") && (
        <div className="cl-tablewrap">
          <table className="cl-table">
            <thead>
              <tr>
                {showBulk && <th className="cl-c-check"><input className="cl-check" type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select every file shown" /></th>}
                {th("name", "Name")}
                {th("case", "Case")}
                {th("status", "Status")}
                {th("lead_no", "Lead", "cl-hide-sm")}
                {th("state", "State", "cl-hide-sm")}
                {th("updated", "Updated", "cl-hide-sm")}
                <th className="cl-c-act" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const picked = sel.has(r.id) || allMatching;
                return (
                  <tr key={r.id} className={picked ? "cl-sel" : ""} onClick={() => open(r)}>
                    {showBulk && (
                      <td className="cl-c-check" onClick={(e) => e.stopPropagation()}>
                        <input className="cl-check" type="checkbox" checked={picked} onChange={() => toggleOne(r.id)} aria-label={`Select ${r.name || "this file"}`} />
                      </td>
                    )}
                    <td>
                      <div className="cl-cell">
                        <Link className="cl-t1" href={`${basePath}/${encodeURIComponent(r.key)}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--ink)", textDecoration: "none" }}>{r.name || "No name yet"}</Link>
                        <span className="cl-t2">{prettyPhone(r.phone) || "No phone"}</span>
                      </div>
                    </td>
                    <td className="cl-c-case">
                      <div className="cl-cell">
                        {r.caseLabel ? <span className="cl-t1" style={{ fontWeight: 500 }}>{r.caseLabel}</span> : <span className="cl-t1 cl-nocamp" title="This file has no campaign. It cannot be delivered or papered until one is set.">No campaign</span>}
                        <span className="cl-t2" title={r.summary}>{r.summary || (r.campaign ? "" : "Set a campaign before it can be papered")}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cl-cell">
                        <span className="cl-status"><span className={`cl-dot cl-${r.tone}`} />{r.statusLabel}{r.tier_letter && tierLabel(r.tier_letter, r.tier_number, r.type) !== "\u2014" ? <span className="cl-mono" title="Tier" style={{ marginLeft: 4 }}>{tierLabel(r.tier_letter, r.tier_number, r.type)}</span> : null}</span>
                        {r.clock
                          ? <span className={`cl-t2 ${clockTone(r.clock.tone)}`} title={r.clock.kind === "esign_chase" ? "Agreement sent. Get her back on the line within 72 hours." : "Signed. Deliver to the firm within 72 hours."}>{r.clock.kind === "esign_chase" ? "Agreement out, " : "To the firm, "}{String(r.clock.countdownText).replace(/^OVERDUE/i, "overdue")}</span>
                          : r.flag ? <span className="cl-flag"><Icon name="flag" size={13} />Flagged</span> : null}
                      </div>
                    </td>
                    <td className="cl-hide-sm"><span className="cl-mono">{r.lead_no || ""}</span></td>
                    <td className="cl-hide-sm"><span style={{ color: r.state ? "var(--ink)" : "var(--ink-faint)" }}>{r.state || "None"}</span></td>
                    <td className="cl-hide-sm">
                      <div className="cl-cell">
                        <span style={{ fontSize: 13.5 }} suppressHydrationWarning>{ago(r.updated)}</span>
                        <span className="cl-t2" suppressHydrationWarning>{r.created ? `Came in ${new Date(r.created).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" })} Pacific` : ""}</span>
                      </div>
                    </td>
                    <td className="cl-c-act" onClick={(e) => e.stopPropagation()}>
                      <span className="cl-rowacts">
                        {!isFirm && r.phone && <a href={`${basePath}/${encodeURIComponent(r.key)}?tab=Messages`} title="Text" aria-label={`Text ${r.name}`}><Icon name="message" size={16} /></a>}
                        <a href={`${basePath}/${encodeURIComponent(r.key)}`} title="Open" aria-label={`Open ${r.name}`}><Icon name="right" size={16} /></a>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={colCount} style={{ cursor: "default" }}>
                  <div className="cl-empty"><b>Nothing here</b>{active.length || q ? "No files match what you picked." : "No files yet."}</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showBulk && selCount > 0 && (
        <div className="cl-bulk" role="region" aria-label="Change the selected files">
          <span className="cl-bulk-n">{selCount} selected</span>
          {!allMatching && allPageSelected && rows.length > sel.size && (
            <button onClick={() => setAllMatching(true)}>Select all {rows.length}</button>
          )}
          <select className="cl-select" defaultValue="" aria-label="Change status" onChange={(e) => { if (e.target.value) { runBulkStatus(e.target.value); e.target.value = ""; } }}>
            <option value="">Change status</option>
            {statusList.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="cl-select" defaultValue="" aria-label="Change stage" onChange={(e) => { if (e.target.value) { runBulk({ op: "set_stage", stage: e.target.value }); e.target.value = ""; } }}>
            <option value="">Change stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
          </select>
          {agents.length > 0 && (
            <select className="cl-select" defaultValue="" aria-label="Assign" onChange={(e) => { if (e.target.value) { runBulk({ op: "assign", agentId: e.target.value === "_none" ? null : e.target.value }); e.target.value = ""; } }}>
              <option value="">Assign to</option>
              <option value="_none">Nobody</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          )}
          {firms.length > 1 && (
            <select className="cl-select" defaultValue="" aria-label="Move to firm" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) void pickMoveFirm(v); }}>
              <option value="">Move to firm</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {!!moveFirm && (
            /* A move lands the files on a campaign AT the new firm (the
               database refuses one from another firm). */
            <select className="cl-select" defaultValue="" aria-label="Campaign at the new firm" onChange={(e) => { const v = e.target.value; if (v) { runBulk({ op: "move_firm", firmId: moveFirm, campaignId: v }); setMoveFirm(""); } }}>
              <option value="">Into which campaign?</option>
              {moveCamps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="cl-danger" onClick={() => { if (confirm(`Archive ${selCount} file(s)? They stay recoverable for 90 days and only the Operator can delete them for good.`)) runBulk({ op: "delete" }); }}>Archive</button>
          <button onClick={clearSel}>Clear</button>
          {busy && <span className="cl-bulk-msg">Working</span>}
          {bulkMsg && <span className={`cl-bulk-msg${bulkErr ? " cl-err" : ""}`} role="status">{bulkMsg}</span>}
        </div>
      )}

      {!isFirm && view === "board" && (
        <div className="kanban">
          {laneDefs.map((lane) => {
            const laneRows = rows.filter((r) => laneOf(r) === lane.key);
            if (groupBy === "stage" && laneRows.length === 0) return null;
            return (
              <div key={lane.key} className="kcol">
                <div className="kcol-h" style={{ borderTop: `3px solid ${lane.tone}` }}><span>{lane.label}</span><span className="badge stage">{laneRows.length}</span></div>
                <div className="kcol-body">
                  {laneRows.map((r) => (
                    <div key={r.id} className={`kcard-wrap ${sel.has(r.id) || allMatching ? "row-selected" : ""}`}>
                      {showBulk && <input type="checkbox" className="kcard-check" checked={sel.has(r.id) || allMatching} onChange={() => toggleOne(r.id)} onClick={(e) => e.stopPropagation()} />}
                      <Link href={`${basePath}/${r.id}`} className={`kcard ${r.needsAction ? "needs-action" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong style={{ fontSize: 13 }}>{r.lead_no}</strong>
                        <TierBadge letter={r.tier_letter} number={r.tier_number} claimType={r.type} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, margin: "3px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{r.name || "No name yet"}{r.clock && <ClockChip clock={r.clock} />}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{[r.caseLabel, r.state].filter(Boolean).join(", ")}</div>
                      <div className="row" style={{ marginTop: 7, justifyContent: "space-between" }}>
                        <span className="badge stage" style={{ fontSize: 10 }}>{STAGE_LABELS[r.stage] ?? r.stage}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{Math.floor((Date.now() - new Date(r.updated).getTime()) / 86400000)}d</span>
                      </div>
                      </Link>
                    </div>
                  ))}
                  {laneRows.length === 0 && <p className="muted" style={{ fontSize: 12, padding: "8px 4px" }}>Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isFirm && view === "gantt" && (
        <div className="gantt">
          <div className="gantt-head">
            <div className="gantt-name-col">Case</div>
            <div className="gantt-track-head">
              {STAGES.map((s) => <div key={s} className="gantt-stage-label" title={STAGE_LABELS[s]}>{(STAGE_LABELS[s] ?? s).split(" ")[0]}</div>)}
            </div>
          </div>
          <div className="gantt-body">
            {rows.slice(0, 60).map((r) => {
              const idx = stageIndex(r.stage);
              const pct = (idx / (STAGES.length - 1)) * 100;
              const terminal = ["closed", "declined", "duplicate"].includes(r.stage);
              return (
                <Link key={r.id} href={`${basePath}/${r.id}`} className="gantt-row">
                  <div className="gantt-name-col">
                    <strong style={{ fontSize: 12.5 }}>{r.lead_no}</strong>
                    <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.name || "No name yet"}</span>
                  </div>
                  <div className="gantt-track">
                    <div className="gantt-grid">{STAGES.map((s) => <div key={s} className="gantt-cell" />)}</div>
                    <div className="gantt-bar" style={{ width: `${Math.max(pct, 4)}%`, background: terminal ? "var(--ink-faint)" : r.needsAction ? "var(--accent)" : "var(--brand)" }}>
                      <span className="gantt-bar-label">{STAGE_LABELS[r.stage] ?? r.stage}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {rows.length === 0 && <p className="muted" style={{ padding: 16 }}>No leads match.</p>}
          </div>
        </div>
      )}

    </div>
  );
}

// The countdown on a board card: dot and words, colored only when it matters.
function ClockChip({ clock }: { clock: any }) {
  const cls = clock.tone === "overdue" ? "cl-tone-bad" : clock.tone === "urgent" || clock.tone === "warn" ? "cl-tone-warn" : "cl-tone-good";
  const title = clock.kind === "esign_chase"
    ? "Agreement sent. Get her back on the line within 72 hours."
    : `Signed. Deliver to the firm within 72 hours${clock.stuckStage ? `. Sitting at ${clock.stuckStage}` : ""}.`;
  return (
    <span title={title} className={cls} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      <Icon name="clock" size={13} />{String(clock.countdownText).replace(/^OVERDUE/i, "Overdue")}
    </span>
  );
}
