"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STAGES, STAGE_LABELS } from "@/lib/questionnaire";
import TierBadge from "./TierBadge";

type Row = any;

// Shared leads surface used by BOTH staff and firm. Three views:
// Table (dense, default), Board (Monday lanes, group-by toggle), Gantt (stages over time).
export default function LeadsView({ leads, basePath = "/leads", addPath = "/intake" }: { leads: Row[]; basePath?: string; addPath?: string }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "board" | "gantt">("table");
  const [groupBy, setGroupBy] = useState<"status" | "stage" | "tier">("status");
  const [fType, setFType] = useState("all");
  const [fState, setFState] = useState("all");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "updated", dir: -1 });

  const rows = useMemo(() => {
    let r = leads.map((l) => {
      const c = (l.claims ?? [])[0] ?? {};
      const status = c.status ?? "new";
      return {
        id: l.id, lead_no: l.lead_no, firm_ref: l.firm_ref_no ?? "",
        name: l.claimant_name ?? "—", phone: l.phone ?? "—",
        loc: l.address ?? "—", state: l.mail_state ?? l.state ?? "",
        type: l.case_type ?? c.claim_type ?? "—", campaign: c.campaign ?? "—",
        status, stage: l.stage ?? "referral_received",
        tier: c.tier ?? "", tier_letter: c.tier_letter, tier_number: c.tier_number,
        summary: c.case_summary ?? "—", created: l.created_at, updated: l.updated_at,
        flag: l.supervisor_flag,
        needsAction: status === "new" || status === "contact_attempted" || l.supervisor_flag,
      };
    });
    if (fType !== "all") r = r.filter((x) => x.type === fType);
    if (fState !== "all") r = r.filter((x) => x.state === fState);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => x.name.toLowerCase().includes(t) || x.phone.includes(t) ||
        String(x.lead_no).toLowerCase().includes(t) || x.campaign.toLowerCase().includes(t) || x.summary.toLowerCase().includes(t));
    }
    r.sort((a: any, b: any) => { const av = a[sort.k] ?? "", bv = b[sort.k] ?? ""; return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; });
    return r;
  }, [leads, q, fType, fState, sort]);

  const types = Array.from(new Set(leads.map((l) => l.case_type ?? l.claims?.[0]?.claim_type).filter(Boolean)));
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean))).sort();

  function statusBadge(s: string) {
    const cls = s === "dq" ? "dq" : s === "signed" ? "signed" : s === "qualified" ? "count" : "stage";
    return <span className={`badge ${cls}`}>{s.replace("_", " ")}</span>;
  }
  function th(k: string, label: string) {
    return <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
  }

  // ---- BOARD lanes ----
  const laneDefs = useMemo(() => {
    if (groupBy === "status") return [
      { key: "new", label: "Needs intake", tone: "#d9982a" }, { key: "in_progress", label: "In progress", tone: "#0891b2" },
      { key: "qualified", label: "Qualified", tone: "#2f8a52" }, { key: "signed", label: "Signed", tone: "#16324f" },
      { key: "dq", label: "Disqualified", tone: "#c0392f" },
    ];
    if (groupBy === "stage") return STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] ?? s, tone: "#16324f" }));
    // tier
    return ["A", "B", "C", "D", "E", "F", "untiered"].map((t) => ({ key: t, label: t === "untiered" ? "Untiered" : `Tier ${t}`, tone: "#d9982a" }));
  }, [groupBy]);

  function laneOf(r: any) {
    if (groupBy === "status") return r.status;
    if (groupBy === "stage") return r.stage;
    return r.tier_letter ?? "untiered";
  }

  // ---- GANTT ----
  const stageIndex = (s: string) => Math.max(0, (STAGES as readonly string[]).indexOf(s));

  return (
    <div>
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
            <thead><tr><th></th>{th("lead_no", "Lead ID")}{th("name", "Name")}{th("phone", "Phone")}{th("type", "Type")}{th("campaign", "Campaign")}{th("tier", "Tier")}{th("status", "Status")}{th("stage", "Stage")}{th("state", "State")}{th("summary", "Case description")}{th("updated", "Updated")}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.needsAction ? "needs-action" : ""}>
                  <td>{r.needsAction && <span className="dot" title="Needs action" />}</td>
                  <td><Link href={`${basePath}/${r.id}`}>{r.lead_no}</Link></td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.phone}</td>
                  <td>{r.type}</td>
                  <td>{r.campaign}</td>
                  <td><TierBadge letter={r.tier_letter} number={r.tier_number} claimType={r.type} /></td>
                  <td>{statusBadge(r.status)}{r.flag && <span className="badge flag" style={{ marginLeft: 4 }}>flag</span>}</td>
                  <td><span className="badge stage">{STAGE_LABELS[r.stage] ?? r.stage}</span></td>
                  <td className="muted">{r.state || "—"}</td>
                  <td className="trunc" title={r.summary}>{r.summary}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.updated).toLocaleDateString()}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={12} className="muted">No leads match.</td></tr>}
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
                    <Link key={r.id} href={`${basePath}/${r.id}`} className={`kcard ${r.needsAction ? "needs-action" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong style={{ fontSize: 13 }}>{r.lead_no}</strong>
                        <TierBadge letter={r.tier_letter} number={r.tier_number} claimType={r.type} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, margin: "3px 0" }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.type}{r.state ? ` · ${r.state}` : ""}</div>
                      <div className="row" style={{ marginTop: 7, justifyContent: "space-between" }}>
                        <span className="badge stage" style={{ fontSize: 10 }}>{STAGE_LABELS[r.stage] ?? r.stage}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{Math.floor((Date.now() - new Date(r.updated).getTime()) / 86400000)}d</span>
                      </div>
                    </Link>
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
