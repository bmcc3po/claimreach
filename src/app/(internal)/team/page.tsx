export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";

export default async function TeamPage() {
  const sb = await supabaseServer();
  const { data: team } = await sb.from("app_users")
    .select("id, full_name, role, firm_id").order("role");

  return (
    <div>
      <div className="cl-head"><div><h1 className="cl-h1">Team</h1><p className="cl-lede">Everyone with a seat, and what they do here.</p></div></div>
      <table className="docket">
        <thead><tr><th>Name</th><th>Role</th></tr></thead>
        <tbody>
          {(team ?? []).filter((u) => u.role !== "firm").map((u) => (
            <tr key={u.id}>
              <td>{u.full_name ?? <span className="muted">—</span>}</td>
              <td><span className="badge stage">{u.role}</span></td>
            </tr>
          ))}
          {(!team || team.length === 0) && <tr><td colSpan={2} className="muted">No team members yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
