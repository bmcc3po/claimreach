"use client";
import { useMemo, useState } from "react";

// Reporting surface — breakdowns by status, type, stage, campaign, tier, plus
// a time series. Exportable to CSV. scope distinguishes firm vs staff copy.
export default function ReportsView({ leads, claims, scope = "staff", statuses = [] }: { leads: any[]; claims: any[]; scope?: "firm" | "staff"; statuses?: any[] }) {
  const [range, setRange] = useState(30);
  const [pStatus, setPStatus] = useState("all");
  const [pType, setPType] = useState("all");

  // Join claims to their lead for the drill-down list.
  const leadById = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);
  const statusLabel = useMemo(() => Object.fromEntries(statuses.map((s) => [s.key, s.label])), [statuses]);
  const caseTypes = useMemo(() => Array.from(new Set(claims.map((c) => c.claim_type).filter(Boolean))).sort(), [claims]);

  const pivotRows = useMemo(() => {
    return claims
      .filter((c) => (pStatus === "all" || c.status === pStatus) && (pType === "all" || c.claim_type === pType))
      .map((c) => ({ ...c, lead: leadById[c.lead_id] }))
      .filter((c) => c.lead)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [claims, pStatus, pType, leadById]);

  const data = useMemo(() => {
    const now = Date.now();
    const inRange = (d: string) => (now - new Date(d).getTime()) / 86400000 <= range;
    const cl = claims.filter((c) => !c.created_at || inRange(c.created_at));

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byTier: Record<string, number> = {};
    for (const c of cl) {
      byStatus[c.status ?? "new"] = (byStatus[c.status ?? "new"] ?? 0) + 1;
      byType[c.claim_type ?? "—"] = (byType[c.claim_type ?? "—"] ?? 0) + 1;
      if (c.campaign) byCampaign[c.campaign] = (byCampaign[c.campaign] ?? 0) + 1;
      if (c.tier) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
    }
    const total = cl.length;
    const qualified = byStatus["qualified"] ?? 0;
    // Canonical signed: any status the status table itself marks as an e-sign
    // status past the pre-signature phase (covers signed_*, delivered/retained
    // style custom statuses, and the legacy plain "signed"). Falls back to the
    // signed_* name family when the flags are not loaded.
    const signedKeys = new Set(
      statuses.some((s: any) => s.requires_esign !== undefined)
        ? statuses.filter((s: any) => s.requires_esign === true && s.phase && s.phase !== "pre_qa" && s.key !== "esign_sent").map((s: any) => s.key)
        : Object.keys(byStatus).filter((k) => k === "signed" || k.startsWith("signed_"))
    );
    if (!signedKeys.size) Object.keys(byStatus).forEach((k) => { if (k === "signed" || k.startsWith("signed_")) signedKeys.add(k); });
    const signed = Object.entries(byStatus).reduce((n, [k, v]) => (signedKeys.has(k) ? n + (v as number) : n), 0);
    const convRate = total ? Math.round(((qualified + signed) / total) * 100) : 0;
    return { total, qualified, signed, convRate, byStatus, byType, byCampaign, byTier };
  }, [claims, range]);

  function exportCsv() {
    const rows = [["Metric", "Value"], ["Total claims", data.total], ["Qualified", data.qualified], ["Signed", data.signed], ["Conversion %", data.convRate]];
    for (const [k, v] of Object.entries(data.byStatus)) rows.push([`Status: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byType)) rows.push([`Type: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byCampaign)) rows.push([`Campaign: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byTier)) rows.push([`Tier: ${k}`, v]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `claimreach-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const Bar = ({ obj, title }: { obj: Record<string, number>; title: string }) => {
    const max = Math.max(1, ...Object.values(obj));
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return (
      <div className="cl-panel">
        <div className="cl-ph"><h2>{title}</h2><div className="cl-ph-r"><span className="cl-n">{entries.length}</span></div></div>
        <div className="rp-bars">
          {entries.length === 0 && <div className="cl-empty">No data in range.</div>}
          {entries.map(([k, v]) => (
            <div key={k} className="rp-bar">
              <div className="rp-bar-t"><span>{(statusLabel[k] ?? k).replace(/_/g, " ")}</span><b>{v}</b></div>
              <div className="rp-track"><div className="rp-fill" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="cl-head">
        <div>
          <h1 className="cl-h1">Reports</h1>
          <p className="cl-lede">Every file counted from its status, the same numbers the queues run on.</p>
        </div>
        <div className="cl-acts">
          {scope === "staff" && <a className="cl-btn cl-ghost" href="/reports/status">Status Report</a>}
          <select className="cl-select" value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={3650}>All time</option>
          </select>
          <button className="cl-btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="cl-panel">
        <div className="cl-kpis">
          <div className="cl-kpi"><div className="cl-kpi-l">Total claims</div><div className="cl-kpi-v">{data.total}</div><div className="cl-kpi-f">in range</div></div>
          <div className="cl-kpi"><div className="cl-kpi-l">Qualified</div><div className="cl-kpi-v">{data.qualified}</div><div className="cl-kpi-f">ready for the firm</div></div>
          <div className="cl-kpi"><div className="cl-kpi-l">Signed</div><div className="cl-kpi-v">{data.signed}</div><div className="cl-kpi-f">retained</div></div>
          <div className="cl-kpi"><div className="cl-kpi-l">Conversion</div><div className="cl-kpi-v">{data.convRate}%</div><div className="cl-kpi-f">qualified + signed of total</div></div>
        </div>
      </div>

      <div className="cl-panel" style={{ marginTop: 16 }}>
        <div className="cl-ph">
          <h2>Pull files by status and case type</h2>
          <div className="cl-ph-r">
            <select className="cl-select" value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
              <option value="all">Any status</option>
              {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className="cl-select" value={pType} onChange={(e) => setPType(e.target.value)}>
              <option value="all">Any case type</option>
              {caseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="cl-n">{pivotRows.length} file{pivotRows.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ overflow: "auto", maxHeight: "60vh" }}>
          <table className="cl-table">
            <thead><tr><th>File</th><th>Claimant</th><th>Case type</th><th>Status</th><th>Campaign</th></tr></thead>
            <tbody>
              {pivotRows.slice(0, 500).map((c, i) => (
                <tr key={c.lead_id + i}>
                  <td><a className="cl-mono" href={`/leads/${c.lead_id}`}>{c.lead.lead_no}</a></td>
                  <td className="cl-t1">{c.lead.claimant_name || "—"}</td>
                  <td>{c.claim_type || "—"}</td>
                  <td>{statusLabel[c.status] ?? c.status}</td>
                  <td className="cl-t2">{c.campaign || "—"}</td>
                </tr>
              ))}
              {pivotRows.length === 0 && <tr><td colSpan={5}><div className="cl-empty"><b>No files match</b>Loosen the status or case type filter.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rp-grid">
        <Bar obj={data.byStatus} title="By status" />
        <Bar obj={data.byType} title="By case type" />
        <Bar obj={data.byCampaign} title="By campaign" />
        <Bar obj={data.byTier} title="By tier" />
      </div>
    </div>
  );
}
