"use client";
import { useState, useEffect } from "react";
import { COURSE } from "@/lib/course";
import { CAMPAIGNS, campaignModuleId, drillModuleId } from "@/lib/campaigns";

// Manager view — who has completed which training, course and campaign, with
// scores and dates. Campaign certification is the column that decides whether
// someone is cleared for live calls on that case.
export default function TrainingRecords() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/training?all=1"); const d = await r.json(); setRecords(d.records ?? []); }
    catch (e) { console.error("training records load failed", e); }
    setLoading(false);
  })(); }, []);

  // Group by user.
  const byUser: Record<string, { name: string; mods: Record<string, any> }> = {};
  for (const r of records) {
    (byUser[r.user_id] ||= { name: r.user_name ?? "User", mods: {} }).mods[r.module_id] = r;
  }
  const users = Object.values(byUser);

  function Cell({ r }: { r: any }) {
    if (!r) return <td className="muted">—</td>;
    if (r.status === "completed") return (
      <td><span className="badge signed" title={r.completed_at ? new Date(r.completed_at).toLocaleDateString() : ""}>✓{r.quiz_score != null ? ` ${r.quiz_score}%` : ""}</span></td>
    );
    return <td><span className="badge stage">···</span></td>;
  }

  return (
    <div>
      <div className="section-title">Campaign clearance</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Cleared for live calls means both columns are green: the written certification and the qualifier drill. Both need 90%.
      </p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && users.length === 0 && <p className="muted">No training activity yet.</p>}
      {users.length > 0 && (
        <div className="table-scroll" style={{ marginBottom: 22 }}>
          <table className="docket">
            <thead>
              <tr>
                <th rowSpan={2}>Agent</th>
                {CAMPAIGNS.map((c) => <th key={c.id} colSpan={2} style={{ textAlign: "center" }}>{c.name}</th>)}
              </tr>
              <tr>
                {CAMPAIGNS.map((c) => [
                  <th key={`${c.id}-c`} style={{ fontWeight: 500 }}>Cert</th>,
                  <th key={`${c.id}-d`} style={{ fontWeight: 500 }}>Drill</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  {CAMPAIGNS.map((c) => [
                    <Cell key={`${c.id}-c`} r={u.mods[campaignModuleId(c.id)]} />,
                    <Cell key={`${c.id}-d`} r={u.mods[drillModuleId(c.id)]} />,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">Crissi Academy</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Course modules completed, with quiz scores and dates.</p>
      {users.length > 0 && (
        <div className="table-scroll">
          <table className="docket">
            <thead><tr><th>Agent</th>{COURSE.map((m) => <th key={m.id} title={m.title}>M{m.order}</th>)}<th>Done</th></tr></thead>
            <tbody>
              {users.map((u, i) => {
                const doneN = COURSE.filter((m) => u.mods[m.id]?.status === "completed").length;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    {COURSE.map((m) => <Cell key={m.id} r={u.mods[m.id]} />)}
                    <td><strong>{doneN}/{COURSE.length}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
