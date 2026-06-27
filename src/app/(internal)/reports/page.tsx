export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
export default async function StaffReports() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads").select("id, stage, case_type, created_at, updated_at").limit(3000);
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); claims = data ?? []; }
  return <ReportsView leads={leads ?? []} claims={claims} scope="staff" />;
}
