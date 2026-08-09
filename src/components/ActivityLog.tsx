"use client";

// Activity Log — audit trail styled like the LawRuler log: when / who / what.
export default function ActivityLog({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return <p className="muted">No activity recorded yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="docket">
        <thead>
          <tr>
            <th style={{ width: 180 }}>Completed On</th>
            <th style={{ width: 160 }}>User</th>
            <th>Activity</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted" style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                {new Date(e.created_at).toLocaleString()}
              </td>
              <td style={{ verticalAlign: "top" }}>{e.actor_name ?? "System"}</td>
              <td style={{ verticalAlign: "top" }}>
                <span className={`badge ${catClass(e.category)}`} style={{ marginRight: 8 }}>{e.category}</span>
                {e.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function catClass(c: string) {
  if (c === "status") return "stage";
  if (c === "comms" || c === "call") return "count";
  if (c === "sms") return "signed";
  if (c === "access") return "flag";
  if (c === "entered") return "signed";
  if (c === "deleted") return "dq";
  if (c === "retainer") return "stage";
  if (c === "contact") return "stage";
  return "stage";
}
