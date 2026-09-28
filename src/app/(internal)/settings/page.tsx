export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import DripManager from "@/components/DripManager";
import DripRulesManager from "@/components/DripRulesManager";

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("full_name, role").eq("id", user!.id).maybeSingle();
  const isAdmin = me && ["owner", "admin"].includes(me.role);

  return (
    <div>
      <div className="cl-head"><div><h1 className="cl-h1">Settings</h1><p className="cl-lede">Your account, campaigns, drips, and the switches behind them.</p></div></div>
      <div className="side-card" style={{ maxWidth: 520 }}>
        <h3>Your account</h3>
        <div className="vrow"><span className="vk">Name</span><span className="vv">{me?.full_name ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Role</span><span className="vv">{me?.role ?? "—"}</span></div>
        <div className="vrow"><span className="vk">Email</span><span className="vv">{user?.email}</span></div>
      </div>
      <div style={{ maxWidth: 880, marginBottom: 16 }}>
        <DripRulesManager canEdit={!!isAdmin} />
      </div>
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Campaigns</h3>
        <p className="muted" style={{ marginTop: 0 }}>Define each firm + case type program (e.g. "TMP MVA"). Add lead picks a campaign and inherits firm, type, intake form, retainer, and billing.</p>
        <a className="btn" href="/settings/campaigns">Manage campaigns</a>
      </div>
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>When a client signs</h3>
        <p className="muted" style={{ marginTop: 0 }}>Who gets an email the moment a client signs: one distro per case type (like mva@), plus CCs per campaign (like tmpmva@).</p>
        <a className="btn" href="/settings/notify">Set who gets it</a>
      </div>
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Retainer templates</h3>
        <p className="muted" style={{ marginTop: 0 }}>Create, edit, and assign retainer templates to case types, and mark a default per type.</p>
        <a className="btn" href="/templates?tab=retainers">Manage retainers</a>
      </div>
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Statuses & DQ reasons</h3>
        <p className="muted" style={{ marginTop: 0 }}>Edit the status set that drives intake, QA, billing, and firm visibility, plus the disqualification reasons agents pick from.</p>
        <a className="btn" href="/settings/statuses">Manage statuses</a>
      </div>
      <DripManager />
      <div className="side-card" style={{ maxWidth: 620 }}>
        <h3>Calendly</h3>
        <p className="muted">Per-agent scheduling links are configured here (coming).</p>
      </div>
    </div>
  );
}
