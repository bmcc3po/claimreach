export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("full_name, role").eq("id", user!.id).maybeSingle();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div className="side-card" style={{ maxWidth: 520 }}>
        <h3>Your account</h3>
        <div className="vrow"><span className="vk">Name</span><span className="vv">{me?.full_name ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Role</span><span className="vv">{me?.role ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Email</span><span className="vv">{user?.email}</span></div>
      </div>
      <div className="side-card" style={{ maxWidth: 520 }}>
        <h3>Calendly</h3>
        <p className="muted">Per-agent scheduling links are configured here (coming).</p>
      </div>
    </div>
  );
}
