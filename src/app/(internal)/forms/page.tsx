export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

export default async function FormsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) {
    return <div className="card" style={{ padding: 20 }}><h2>Forms</h2><p className="muted">Only admins can build intake forms.</p></div>;
  }
  const { data: forms } = await sb.from("intake_forms").select("*").order("updated_at", { ascending: false });
  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Intake Forms</h1>
        <span className="spacer" />
        <Link className="btn" href="/forms/new">+ New form</Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Build and publish intake questionnaires by claim type, no code. Published forms render automatically for new intakes.</p>
      <div className="table-scroll">
        <table className="docket">
          <thead><tr><th>Name</th><th>Claim type</th><th>Status</th><th>Fields</th><th>Updated</th></tr></thead>
          <tbody>
            {(forms ?? []).map((f) => (
              <tr key={f.id}>
                <td><Link href={`/forms/${f.id}`}>{f.name}</Link></td>
                <td>{f.claim_type}</td>
                <td>{f.status === "published" ? <span className="badge signed">Published</span> : <span className="badge count">Draft</span>}</td>
                <td>{(f.fields ?? []).length}</td>
                <td className="muted">{new Date(f.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(forms ?? []).length === 0 && <tr><td colSpan={5} className="muted">No forms yet. Create your first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
