"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STAGES, STAGE_LABELS } from "@/lib/questionnaire";
import TierBadge from "./TierBadge";
import StatusBadge from "./ui/StatusBadge";
import RowActions from "./ui/RowActions";
import { DEFAULT_STATUSES, DEFAULT_DQ_REASONS, type StatusDef, type DqReason } from "@/lib/statuses";
import { primaryClock } from "@/lib/sla-clocks";

type Row = any;

// Shared leads surface used by BOTH staff and firm. Three views:
// Table (dense, default), Board (Monday lanes, group-by toggle), Gantt (stages over time).
export default function LeadsView({ leads, basePath = "/leads", addPath = "/intake", agents = [], firms = [], canBulk = false, statuses = [], dqReasons = [] }: { leads: Row[]; basePath?: string; addPath?: string; agents?: { id: string; full_name: string }[]; firms?: { id: string; name: string }[]; canBulk?: boolean; statuses?: StatusDef[]; dqReasons?: DqReason[] }) {
  const statusList = statuses.length ? statuses : DEFAULT_STATUSES;
  const dqList = dqReasons.length ? dqReasons : DEFAULT_DQ_REASONS;
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "board" | "gantt">("table");
  const [groupBy, setGroupBy] = useState<"status" | "stage" | "tier">("status");
  const [fType, setFType] = useState("all");
  const [fState, setFState] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "updated", dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const rows = useMemo(() => {
    let r = leads.map((l) => {
      const c = (l.claims ?? [])[0] ?? {};
      const status = c.status ?? "new";
      const statusDef = statuses.find((s) => s.key === status);
      const clock = primaryClock({
        signed_at: l.signed_at, firm_sent_at: l.firm_sent_at,
        esign_sent_at: l.esign_sent_at, esign_status: null,
        current_status: status, statusLabel: statusDef?.label ?? status,
      });
      return {
        id: l.id, lead_no: l.lead_no, firm_ref: l.firm_ref_no ?? "",
        name: l.claimant_name ?? "—", phone: l.phone ?? "—",
        loc: l.address ?? "—", state: l.mail_state ?? l.state ?? "",
        type: l.case_type ?? c.claim_type ?? "—", campaign: c.campaign ?? "—",
        status, stage: l.stage ?? "referral_received",
        tier: c.tier ?? "", tier_letter: c.tier_letter, tier_number: c.tier_number,
        summary: c.case_summary ?? "—", created: l.created_at, updated: l.updated_at,
        flag: l.supervisor_flag, clock,
        needsAction: status === "new" || status === "contact_attempted" || l.supervisor_flag,
      };
    });
    if (fType !== "all") r = r.filter((x) => x.type === fType);
    if (fState !== "all") r = r.filter((x) => x.state === fState);
    if (fStatus !== "all") r = r.filter((x) => x.status === fStatus);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => x.name.toLowerCase().includes(t) || x.phone.includes(t) ||
        String(x.lead_no).toLowerCase().includes(t) || x.campaign.toLowerCase().includes(t) || x.summary.toLowerCase().includes(t));
    }
    r.sort((a: any, b: any) => { const av = a[sort.k] ?? "", bv = b[sort.k] ?? ""; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; });
    return r;
  }, [leads, q, fType, fState, fStatus, sort]);

  const types = Array.from(new Set(leads.map((l) => l.case_type ?? l.claims?.[0]?.claim_type).filter(Boolean)));
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean))).sort();

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
  // effective target ids: if "all matching" chosen, every filtered row; else the checked set
  const targetIds = allMatching ? pageIds : Array.from(sel);
  const selCount = targetIds.length;

  async function runBulk(body: any) {
    if (selCount === 0) return;
    setBusy(true); setBulkMsg("");
    const r = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ids: targetIds }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setBulkMsg(d.error || "Bulk action failed"); return; }
    setBulkMsg(`Done: ${d.count} updated. Refreshing…`);
    setTimeout(() => window.location.reload(), 700);
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
        if (pick === null) return; // they hit cancel; abort the whole status change
        const idx = parseInt(pick.trim(), 10) - 1;
        if (idx >= 0 && idx < dqList.length) dq_reason_key = dqList[idx].key;
      }
    }
    runBulk({ op: "set_status", status: statusKey, dq_reason_key });
  }

  function statusBadge(s: string) {
    return <StatusBadge status={s} live={statusList} />;
  }

  function th(k: string, label: string) {
    return <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
  }

  // ---- BOARD lanes ----
  const laneDefs = useMemo(() => {
    if (groupBy === "status") return [
      { key: "pre_qa", label: "Intake", tone: "#d9982a" },
      { key: "in_qa", label: "In QA", tone: "#0891b2" },
      { key: "post_qa", label: "Approved / Firm", tone: "#2f8a52" },
      { key: "terminal", label: "Closed", tone: "#c0392f" },
    ];
    if (groupBy === "stage") return STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] ?? s, tone: "#16324f" }));
    // tier
    return ["A", "B", "C", "D", "E", "F", "untiered"].map((t) => ({ key: t, label: t === "untiered" ? "Untiered" : `Tier ${t}`, tone: "#d9982a" }));
  }, [groupBy]);

  const phaseOf = (statusKey: string) => (statusList.find((s) => s.key === statusKey)?.phase) ?? "pre_qa";

  function laneOf(r: any) {
    if (groupBy === "status") return phaseOf(r.status);
    if (groupBy === "stage") return r.stage;
    return r.tier_letter ?? "untiered";
  }

  // ---- GANTT ----
  const stageIndex = (s: string) => Math.max(0, (STAGES as readonly string[]).indexOf(s));

  return (
    <div>
      {canBulk && selCount > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selCount} selected</span>
          {!allMatching && allPageSelected && rows.length > sel.size && (
            <button className="btn ghost sm" onClick={() => setAllMatching(true)}>Select all {rows.length} matching</button>
          )}
          {allMatching && <span className="muted" style={{ fontSize: 12 }}>All {rows.length} matching selected</span>}
          <span className="bulk-sep" />
          <select className="sm" defaultValue="" onChange={(e) => { if (e.target.value) { runBulkStatus(e.target.value); e.target.value = ""; } }}>
            <option value="">Change status…</option>
            {statusList.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="sm" defaultValue="" onChange={(e) => { if (e.target.value) { runBulk({ op: "set_stage", stage: e.target.value }); e.target.value = ""; } }}>
            <option value="">Change stage…</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
          </select>
          {agents.length > 0 && (
            <select className="sm" defaultValue="" onChange={(e) => { if (e.target.value) { runBulk({ op: "assign", agentId: e.target.value === "_none" ? null : e.target.value }); e.target.value = ""; } }}>
              <option value="">Assign to…</option>
              <option value="_none">Unassign</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          )}
          {firms.length > 1 && (
            <select className="sm" defaultValue="" onChange={(e) => { if (e.target.value) { runBulk({ op: "move_firm", firmId: e.target.value }); e.target.value = ""; } }}>
              <option value="">Move to firm…</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <button className="btn ghost sm danger" onClick={() => { if (confirm(`Delete ${selCount} lead(s)? This cannot be undone.`)) runBulk({ op: "delete" }); }}>Delete</button>
          <span className="bulk-sep" />
          <button className="btn ghost sm" onClick={clearSel}>Clear</button>
          {busy && <span className="muted" style={{ fontSize: 12 }}>Working…</span>}
          {bulkMsg && <span className="muted" style={{ fontSize: 12 }}>{bulkMsg}</span>}
        </div>
      )}
      <div className="leads-bar">
        <h1 style={{ margin: 0 }}>Leads</h1>
        <span className="muted">{rows.length} of {leads.length}</span>
        <input className="leads-search" placeholder="Search name, phone, id, campaign…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="spacer" />
        <select style={{ width: "auto" }} value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => <option key={String(t)} value={String(t)}>{String(t)}</option>)}
        </select>
        <select style={{ width: "auto" }} value={fState} onChange={(e) => setFState(e.target.value)}>
          <option value="all">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ width: "auto" }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statusList.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {view === "board" && (
          <select style={{ width: "auto" }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
            <option value="status">Group: Status</option>
            <option value="stage">Group: Stage</option>
            <option value="tier">Group: Tier</option>
          </select>
        )}
        <div className="seg-toggle">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button>
          <button className={view === "gantt" ? "active" : ""} onClick={() => setView("gantt")}>Timeline</button>
        </div>
        <a className="btn ghost" href="/api/export?format=neos">⬇ Export</a>
        <Link className="btn" href={addPath}>+ Add lead</Link>
      </div>

      {view === "table" && (
        <div className="table-scroll">
          <table className="docket leads">
            <thead><tr>{canBulk && <th style={{ width: 30 }}><input type="checkbox" checked={allPageSelected} onChange={togglePage} title="Select all on page" /></th>}<th></th>{th("lead_no", "Lead ID")}{th("name", "Name")}{th("phone", "Phone")}{th("campaign", "Campaign")}{th("type", "Case type")}{th("tier", "Tier")}{th("status", "Status")}{th("stage", "Stage")}{th("state", "State")}{th("summary", "Case description")}{th("created", "Created")}{th("updated", "Updated")}<th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`${r.needsAction ? "needs-action" : ""} ${sel.has(r.id) || allMatching ? "row-selected" : ""}`}>
                  {canBulk && <td><input type="checkbox" checked={sel.has(r.id) || allMatching} onChange={() => toggleOne(r.id)} /></td>}
                  <td>{r.needsAction && <span className="dot" title="Needs action" />}</td>
                  <td><Link href={`${basePath}/${r.id}`}>{r.lead_no}</Link></td>
                  <td style={{ fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{r.name}{r.clock && <ClockChip clock={r.clock} />}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.phone}</td>
                  <td>{r.campaign && r.campaign !== "—"
                    ? r.campaign
                    : <span title="This file has no campaign. It cannot be delivered or papered until one is set." style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#fef2f2", color:"#b91c1c", border:"1px solid #fecaca", whiteSpace:"nowrap" }}>No campaign</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.type}</td>
                  <td><TierBadge letter={r.tier_letter} number={r.tier_number} claimType={r.type} /></td>
                  <td>{statusBadge(r.status)}{r.flag && <span className="badge flag" style={{ marginLeft: 4 }}>flag</span>}</td>
                  <td><span className="badge stage">{STAGE_LABELS[r.stage] ?? r.stage}</span></td>
                  <td className="muted">{r.state || "—"}</td>
                  <td className="trunc" title={r.summary}>{r.summary}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{r.created ? new Date(r.created).toLocaleDateString() : "—"}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.updated).toLocaleDateString()}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowActions actions={[
                      { label: "Open file", icon: "↗", onClick: () => { window.location.href = `${basePath}/${r.id}`; } },
                      ...(r.phone ? [{ label: "Call", icon: "☎", onClick: () => { window.location.href = `tel:${r.phone}`; } }] : []),
                      ...(r.phone ? [{ label: "Text", icon: "✉", onClick: () => { window.location.href = `${basePath}/${r.id}?tab=Messages`; } }] : []),
                      { label: "—", onClick: () => {} },
                      { label: "Change status", icon: "●", onClick: () => { window.location.href = `${basePath}/${r.id}`; } },
                      { label: "Add note", icon: "✎", onClick: () => { window.location.href = `${basePath}/${r.id}?tab=Notes`; } },
                    ]} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={canBulk ? 14 : 13} className="muted">No leads match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === "board" && (
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
                      {canBulk && <input type="checkbox" className="kcard-check" checked={sel.has(r.id) || allMatching} onChange={() => toggleOne(r.id)} onClick={(e) => e.stopPropagation()} />}
                      <Link href={`${basePath}/${r.id}`} className={`kcard ${r.needsAction ? "needs-action" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong style={{ fontSize: 13 }}>{r.lead_no}</strong>
                        <TierBadge letter={r.tier_letter} number={r.tier_number} claimType={r.type} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, margin: "3px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{r.name}{r.clock && <ClockChip clock={r.clock} />}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.type}{r.state ? ` · ${r.state}` : ""}</div>
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

      {view === "gantt" && (
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
                    <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.name}</span>
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

// In-line SLA countdown chip, shown next to a file name the moment it's on a
// clock (signed & racing to firm, or e-sign sent & needs a callback). In your
// face, right where you're already looking. Nobody hides.
function ClockChip({ clock }: { clock: any }) {
  const tone: Record<string, { bg: string; fg: string; bd: string }> = {
    ok:      { bg: "rgba(34,197,94,.10)",  fg: "#15803d", bd: "rgba(34,197,94,.30)" },
    warn:    { bg: "rgba(245,183,49,.14)", fg: "#a16207", bd: "rgba(245,183,49,.40)" },
    urgent:  { bg: "rgba(249,115,22,.14)", fg: "#c2410c", bd: "rgba(249,115,22,.45)" },
    overdue: { bg: "rgba(239,68,68,.14)",  fg: "#b91c1c", bd: "rgba(239,68,68,.55)" },
  };
  const t = tone[clock.tone] ?? tone.ok;
  const icon = clock.kind === "esign_chase" ? "✍️" : "📤";
  const title = clock.kind === "esign_chase"
    ? "E-sign sent, get them back on the line within 72h"
    : `Signed, deliver to firm within 72h${clock.stuckStage ? " · " + clock.stuckStage : ""}`;
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px",
      borderRadius: 999, fontSize: 12, fontWeight: 700, lineHeight: 1.6,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>{clock.countdownText}
      {clock.tone === "overdue" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.fg, display: "inline-block" }} />}
    </span>
  );
}
