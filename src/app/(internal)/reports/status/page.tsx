export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import StatusReport from "@/components/StatusReport";

export default async function StatusReportPage() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads").select("id, lead_no, claimant_name, case_type, source, assigned_agent, created_at, updated_at").limit(5000);
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign").in("lead_id", ids); claims = data ?? []; }
  const { data: statuses } = await sb.from("statuses").select("key, label, tone").eq("active", true).order("sort");
  const { data: agents } = await sb.from("app_users").select("id, full_name").in("role", ["agent", "admin", "owner"]).order("full_name");

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Status Report</h2>
        <div className="spacer" />
        <a className="btn ghost" href="/reports">← Overview reports</a>
      </div>
      <StatusReport leads={leads ?? []} claims={claims} statuses={statuses ?? []} agents={agents ?? []} />
    </div>
  );
}
