export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import DripManager from "@/components/DripManager";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("full_name, role").eq("id", user!.id).maybeSingle();
  const { data: drips } = await sb.from("drip_rules").select("*").order("every_days");

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div className="side-card" style={{ maxWidth: 520 }}>
        <h3>Your account</h3>
        <div className="vrow"><span className="vk">Name</span><span className="vv">{me?.full_name ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Role</span><span className="vv">{me?.role ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Email</span><span className="vv">{user?.email}</span></div>
      </div>
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Automated messaging (drip)</h3>
        <p className="muted" style={{ marginTop: 0 }}>Recurring touches assigned to the agent and/or case manager.</p>
        <table className="docket">
          <thead><tr><th>Sequence</th><th>Channel</th><th>Every</th><th>Assigned</th></tr></thead>
          <tbody>
            {(drips ?? []).map((d:any) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td><span className="badge stage">{d.channel}</span></td>
                <td>{d.every_days} days</td>
                <td>{d.assign_to}</td>
              </tr>
            ))}
            {(!drips || drips.length===0) && <tr><td colSpan={4} className="muted">No drip rules yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <DripManager />
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Calendly</h3>
        <p className="muted">Per-agent scheduling links are configured here (coming).</p>
      </div>
    </div>
  );
}
