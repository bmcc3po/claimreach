"use client";
import { useState, useEffect } from "react";
import { COURSE } from "@/lib/course";

// Manager view — who has completed which training modules (provable records).
export default function TrainingRecords() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/training?all=1"); const d = await r.json(); setRecords(d.records ?? []); } catch {}
    setLoading(false);
  })(); }, []);

  // Group by user.
  const byUser: Record<string, { name: string; mods: Record<string, any> }> = {};
  for (const r of records) {
    (byUser[r.user_id] ||= { name: r.user_name ?? "User", mods: {} }).mods[r.module_id] = r;
  }
  const users = Object.values(byUser);

  return (
    <div>
      <div className="section-title">Training records</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Who has completed which Crissi Academy module, with quiz scores and dates.</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && users.length === 0 && <p className="muted">No training activity yet.</p>}
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
                    {COURSE.map((m) => {
                      const r = u.mods[m.id];
                      if (!r) return <td key={m.id} className="muted">—</td>;
                      if (r.status === "completed") return <td key={m.id}><span className="badge signed" title={r.completed_at ? new Date(r.completed_at).toLocaleDateString() : ""}>✓{r.quiz_score != null ? ` ${r.quiz_score}%` : ""}</span></td>;
                      return <td key={m.id}><span className="badge stage">···</span></td>;
                    })}
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
