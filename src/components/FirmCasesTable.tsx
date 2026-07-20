"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/questionnaire";
import TierBadge from "./TierBadge";
import StatusBadge from "./ui/StatusBadge";

export default function FirmCasesTable({ rows }: { rows: any[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.case_type).filter(Boolean))), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    const c = (r.claims ?? [])[0] ?? {};
    if (type !== "all" && r.case_type !== type) return false;
    if (status !== "all" && c.status !== status) return false;
    if (q.trim()) {
      const t = q.toLowerCase();
      if (!(String(r.lead_no).toLowerCase().includes(t) || (r.claimant_name ?? "").toLowerCase().includes(t) || (r.firm_ref_no ?? "").toLowerCase().includes(t))) return false;
    }
    return true;
  }), [rows, q, type, status]);

  return (
    <div>
      <div className="leads-bar">
        <h1 style={{ margin: 0 }}>Cases</h1>
        <span className="muted">{filtered.length} of {rows.length}</span>
        <input className="leads-search" placeholder="Search case #, name, ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="spacer" />
        <select style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="in_progress">Intake in progress</option>
          <option value="qualified">Qualified</option>
          <option value="signed">Signed</option>
          <option value="dq">Disqualified</option>
        </select>
      </div>
      <div className="table-scroll">
        <table className="docket">
          <thead><tr><th>Case #</th><th>Firm ref</th><th>Name</th><th>Type</th><th>Tier</th><th>Status</th><th>Stage</th><th>Updated</th></tr></thead>
          <tbody>
            {filtered.map((r) => {
              const c = (r.claims ?? [])[0] ?? {};
              return (
                <tr key={r.id}>
                  <td><Link href={`/portal/cases/${r.id}`}>{r.lead_no}</Link></td>
                  <td>{r.firm_ref_no ?? <span className="muted">—</span>}</td>
                  <td>{r.claimant_name ?? <span className="muted">—</span>}</td>
                  <td>{r.case_type ?? "—"}</td>
                  <td><TierBadge letter={c.tier_letter} number={c.tier_number} claimType={r.case_type} /></td>
                  <td><StatusBadge status={c.status ?? "new"} /></td>
                  <td><span className="badge stage">{STAGE_LABELS[r.stage] ?? r.stage}</span></td>
                  <td className="muted">{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="muted">No cases match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
