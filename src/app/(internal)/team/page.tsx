export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReadError from "@/components/ReadError";

export default async function TeamPage() {
  const sb = await supabaseServer();
  const { data: team, error } = await sb.from("app_users")
    .select("id, full_name, role, firm_id").order("role");
  if (error) return <ReadError title="Team" message="The team list could not load. Try again to see current members." href="/team" />;
  const members = (team ?? []).filter((u) => u.role !== "firm");

  return (
    <div>
      <div className="cl-head"><div><h1 className="cl-h1">Team</h1><p className="cl-lede">Everyone with a seat, and what they do here.</p></div></div>
      <div className="table-scroll"><table className="docket">
        <thead><tr><th>Name</th><th>Role</th></tr></thead>
        <tbody>
          {members.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name ?? <span className="muted">—</span>}</td>
              <td><span className="badge stage">{u.role}</span></td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={2} className="muted">No team members yet.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
