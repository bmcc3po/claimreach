"use client";
import { useMemo, useState } from "react";
import { signedStatusKeys } from "@/lib/statuses";

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
    // The ONE signed-status definition lives in statuses.ts
    // (signedStatusKeys): table flags plus Delivered/Retained plus the
    // signed_* family. Never a local rule here.
    const signedKeys = signedStatusKeys(statuses as any);
    Object.keys(byStatus).forEach((k) => { if (k === "signed" || k.startsWith("signed_")) signedKeys.add(k); });
    const signed = Object.entries(byStatus).reduce((n, [k, v]) => (signedKeys.has(k) ? n + (v as number) : n), 0);
    const convRate = total ? Math.round(((qualified + signed) / total) * 100) : 0;
    return { total, qualified, signed, convRate, byStatus, byType, byCampaign, byTier };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, range, statuses]);

  // Speed to lead, per campaign: from the lead dropping in to the first
  // outbound dial (JustCall webhook) and to the first file open in ClaimReach.
  const speed = useMemo(() => {
    const now = Date.now();
    const inRange = (d: string) => (now - new Date(d).getTime()) / 86400000 <= range;
    const rows: Record<string, { n: number; open: number[]; dial: number[]; under5: number }> = {};
    for (const l of leads) {
      if (!l.created_at || !inRange(l.created_at)) continue;
      const key = l.campaign || "No campaign";
      const r = (rows[key] ||= { n: 0, open: [], dial: [], under5: 0 });
      r.n++;
      const born = new Date(l.created_at).getTime();
      if (l.first_opened_at) { const m = (new Date(l.first_opened_at).getTime() - born) / 1000; if (m >= 0) r.open.push(m); }
      if (l.first_dialed_at) {
        const m = (new Date(l.first_dialed_at).getTime() - born) / 1000;
        if (m >= 0) { r.dial.push(m); if (m <= 300) r.under5++; }
      }
    }
    const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const mid = s.length >> 1; return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; };
    return Object.entries(rows)
      .map(([campaign, r]) => ({
        campaign, leads: r.n,
        opened: r.open.length, medOpen: med(r.open),
        dialed: r.dial.length, medDial: med(r.dial),
        under5: r.n ? Math.round((r.under5 / r.n) * 100) : null,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [leads, range]);

  const fmtSecs = (s: number | null) => {
    if (s == null) return "—";
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.round((s % 86400) / 3600)}h`;
  };

  function exportCsv() {
    const rows = [["Metric", "Value"], ["Total claims", data.total], ["Qualified", data.qualified], ["Signed", data.signed], ["Conversion %", data.convRate]];
    for (const [k, v] of Object.entries(data.byStatus)) rows.push([`Status: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byType)) rows.push([`Type: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byCampaign)) rows.push([`Campaign: ${k}`, v]);
    for (const [k, v] of Object.entries(data.byTier)) rows.push([`Tier: ${k}`, v]);
    for (const s of speed) {
      rows.push([`Speed to lead: ${s.campaign} leads`, s.leads]);
      rows.push([`Speed to lead: ${s.campaign} median seconds to first dial`, s.medDial == null ? "" : Math.round(s.medDial)]);
      rows.push([`Speed to lead: ${s.campaign} median seconds to first open`, s.medOpen == null ? "" : Math.round(s.medOpen)]);
      rows.push([`Speed to lead: ${s.campaign} dialed under 5 minutes %`, s.under5 == null ? "" : s.under5]);
    }
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
        <div className="cl-ph"><h2>Speed to lead</h2><div className="cl-ph-r"><span className="cl-n">from the lead dropping in</span></div></div>
        <div style={{ overflow: "auto" }}>
          <table className="cl-table">
            <thead><tr><th>Campaign</th><th>Leads</th><th>First dial (median)</th><th>Dialed under 5 min (of all leads)</th><th>First open (median)</th><th>No dial recorded</th></tr></thead>
            <tbody>
              {speed.map((s) => (
                <tr key={s.campaign}>
                  <td className="cl-t1">{s.campaign}</td>
                  <td className="cl-mono">{s.leads}</td>
                  <td className="cl-t1">{fmtSecs(s.medDial)}</td>
                  <td>{s.under5 == null ? "—" : <span className="cl-status"><span className={`cl-dot ${s.under5 >= 80 ? "cl-good" : s.under5 >= 50 ? "cl-warn" : "cl-bad"}`} />{s.under5}%</span>}</td>
                  <td>{fmtSecs(s.medOpen)}</td>
                  <td className="cl-t2">{s.leads - s.dialed}</td>
                </tr>
              ))}
              {speed.length === 0 && <tr><td colSpan={6}><div className="cl-empty"><b>No leads in range</b>Speed to lead starts counting from the next lead that drops in.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 16px 12px", fontSize: 12.5, color: "var(--ink-faint)" }}>
          First dial comes from the JustCall webhook (first outbound call or voicemail attempt). First open is the first time staff opened the file in ClaimReach. Both clocks start when the lead drops in. \u201CDialed under 5 min\u201D counts EVERY lead in range, so untouched leads pull it down. Leads from before these clocks existed have no dial recorded here \u2014 that is missing history, not proof nobody called.
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
