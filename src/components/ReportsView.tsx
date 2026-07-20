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
    const signed = byStatus["signed"] ?? 0;
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
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {entries.length === 0 && <p className="muted">No data in range.</p>}
        {entries.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 9 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 13, textTransform: "capitalize" }}>{k.replace("_", " ")}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
            </div>
            <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 100, overflow: "hidden" }}>
              <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 100 }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="leads-bar">
        <h1 style={{ margin: 0 }}>Reports</h1>
        <div className="spacer" />
        {scope === "staff" && <a className="btn ghost" href="/reports/status" style={{ marginRight: 8 }}>Status Report →</a>}
        <select style={{ width: "auto" }} value={range} onChange={(e) => setRange(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={3650}>All time</option>
        </select>
        <button className="btn" onClick={exportCsv}>⬇ Export CSV</button>
      </div>

      <div className="dash-grid">
        <div className="kpi"><div className="kv">{data.total}</div><div className="kl">Total claims</div><div className="ksub">in range</div></div>
        <div className="kpi"><div className="kv">{data.qualified}</div><div className="kl">Qualified</div><div className="ksub">ready for firm</div></div>
        <div className="kpi"><div className="kv">{data.signed}</div><div className="kl">Signed</div><div className="ksub">retained</div></div>
        <div className="kpi"><div className="kv">{data.convRate}%</div><div className="kl">Conversion</div><div className="ksub">qualified+signed / total</div></div>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Pull files by status and case type</h3>
          <div className="row" style={{ gap: 8 }}>
            <select style={{ width: "auto" }} value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
              <option value="all">Any status</option>
              {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select style={{ width: "auto" }} value={pType} onChange={(e) => setPType(e.target.value)}>
              <option value="all">Any case type</option>
              {caseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{pivotRows.length} file{pivotRows.length === 1 ? "" : "s"}{pStatus !== "all" ? ` in ${statusLabel[pStatus] ?? pStatus}` : ""}{pType !== "all" ? ` · ${pType}` : ""}.</p>
        <div className="table-scroll">
          <table className="docket">
            <thead><tr><th>File</th><th>Claimant</th><th>Case type</th><th>Status</th><th>Campaign</th></tr></thead>
            <tbody>
              {pivotRows.slice(0, 500).map((c, i) => (
                <tr key={c.lead_id + i}>
                  <td><a href={`/leads/${c.lead_id}`}>{c.lead.lead_no}</a></td>
                  <td style={{ fontWeight: 600 }}>{c.lead.claimant_name || "—"}</td>
                  <td>{c.claim_type || "—"}</td>
                  <td>{statusLabel[c.status] ?? c.status}</td>
                  <td className="muted">{c.campaign || "—"}</td>
                </tr>
              ))}
              {pivotRows.length === 0 && <tr><td colSpan={5} className="muted">No files match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dash-cols" style={{ marginTop: 4 }}>
        <Bar obj={data.byStatus} title="By status" />
        <Bar obj={data.byType} title="By case type" />
      </div>
      <div className="dash-cols">
        <Bar obj={data.byCampaign} title="By campaign" />
        <Bar obj={data.byTier} title="By tier" />
      </div>
    </div>
  );
}
