"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/questionnaire";
import PersonSearch from "./PersonSearch";

export default function LeadsTable({ leads }: { leads: any[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "updated_at", dir: -1 });
  const [showLookup, setShowLookup] = useState(false);
  const [view, setView] = useState<"table" | "board">("table");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  const rows = useMemo(() => {
    let r = leads.map((l) => {
      const c = (l.claims ?? [])[0] ?? {};
      const status = c.status ?? "new";
      const needsAction = status === "new" || status === "contact_attempted" || l.supervisor_flag;
      return {
        id: l.id,
        lead_no: l.lead_no,
        name: l.claimant_name ?? "—",
        phone: l.phone ?? "—",
        loc: [l.address].filter(Boolean).join(", ") || "—",
        type: l.case_type ?? c.claim_type ?? "—",
        source: l.source ?? "—",
        campaign: c.campaign ?? "—",
        status,
        stage: l.stage,
        summary: c.case_summary ?? "—",
        created: l.created_at,
        updated: l.updated_at,
        flag: l.supervisor_flag,
        needsAction,
      };
    });
    if (fType !== "all") r = r.filter((x) => x.type === fType);
    if (fStatus !== "all") r = r.filter((x) => x.status === fStatus);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) =>
        x.name.toLowerCase().includes(t) || x.phone.includes(t) ||
        String(x.lead_no).toLowerCase().includes(t) || x.campaign.toLowerCase().includes(t) ||
        x.summary.toLowerCase().includes(t)
      );
    }
    r.sort((a: any, b: any) => {
      const av = a[sort.k] ?? "", bv = b[sort.k] ?? "";
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
    return r;
  }, [leads, q, sort, fType, fStatus]);

  function th(k: string, label: string) {
    return (
      <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}
        style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
        {label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  function statusBadge(s: string) {
    const cls = s === "dq" ? "dq" : s === "signed" ? "signed" : s === "qualified" ? "count" : "stage";
    return <span className={`badge ${cls}`}>{s.replace("_", " ")}</span>;
  }

  return (
    <div>
      <div className="leads-bar">
        <h2 style={{ margin: 0 }}>Leads</h2>
        <span className="muted">{rows.length} of {leads.length}</span>
        <input className="leads-search" placeholder="Search name, phone, id, campaign…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="spacer" />
        <select style={{ width: "auto" }} value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">All types</option>
          {Array.from(new Set(leads.map((l) => l.case_type ?? (l.claims?.[0]?.claim_type)).filter(Boolean))).map((t) => <option key={String(t)} value={String(t)}>{String(t)}</option>)}
        </select>
        <select style={{ width: "auto" }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="new">Needs intake</option>
          <option value="in_progress">In progress</option>
          <option value="qualified">Qualified</option>
          <option value="signed">Signed</option>
          <option value="dq">Disqualified</option>
        </select>
        <div className="seg-toggle">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button>
        </div>
        <a className="btn ghost" href="/api/export?format=neos">⬇ Export CSV</a>
        <button className="btn ghost" onClick={() => setShowLookup(!showLookup)}>Person lookup</button>
        <Link className="btn" href="/intake">+ Add lead</Link>
      </div>

      {showLookup && <div style={{ maxWidth: 420, marginBottom: 14 }}><PersonSearch /></div>}

      {view === "table" && (
      <div className="table-scroll">
        <table className="docket leads">
          <thead>
            <tr>
              <th></th>
              {th("lead_no", "Lead ID")}
              {th("name", "Name")}
              {th("phone", "Phone")}
              {th("type", "Type")}
              {th("campaign", "Campaign")}
              {th("status", "Status")}
              {th("stage", "Stage")}
              {th("loc", "Location")}
              {th("summary", "Case description")}
              {th("created", "Created")}
              {th("updated", "Last updated")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.needsAction ? "needs-action" : ""}>
                <td>{r.needsAction && <span className="dot" title="Needs action" />}</td>
                <td><Link href={`/leads/${r.id}`}>{r.lead_no}</Link></td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ whiteSpace: "nowrap" }}>{r.phone}</td>
                <td>{r.type}</td>
                <td>{r.campaign}</td>
                <td>{statusBadge(r.status)}{r.flag && <span className="badge flag" style={{ marginLeft: 4 }}>flag</span>}</td>
                <td><span className="badge stage">{STAGE_LABELS[r.stage] ?? r.stage}</span></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{r.loc}</td>
                <td className="trunc" title={r.summary}>{r.summary}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.created).toLocaleDateString()}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.updated).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} className="muted">No leads match.</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {view === "board" && (
        <div className="kanban">
          {["new", "in_progress", "qualified", "signed", "dq"].map((col) => {
            const colRows = rows.filter((r) => r.status === col);
            const titles: Record<string, string> = { new: "Needs intake", in_progress: "In progress", qualified: "Qualified", signed: "Signed", dq: "Disqualified" };
            return (
              <div key={col} className="kcol">
                <div className="kcol-h"><span>{titles[col]}</span><span className="badge stage">{colRows.length}</span></div>
                <div className="kcol-body">
                  {colRows.map((r) => (
                    <Link key={r.id} href={`/leads/${r.id}`} className={`kcard ${r.needsAction ? "needs-action" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong style={{ fontSize: 13 }}>{r.lead_no}</strong>
                        {r.needsAction && <span className="dot" />}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, margin: "2px 0" }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.type} · {r.loc}</div>
                      <div style={{ marginTop: 6 }}><span className="badge stage">{STAGE_LABELS[r.stage] ?? r.stage}</span></div>
                    </Link>
                  ))}
                  {colRows.length === 0 && <p className="muted" style={{ fontSize: 12, padding: "8px 4px" }}>Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
