export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
export default async function StaffReports() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads").select("id, lead_no, claimant_name, stage, case_type, created_at, updated_at").limit(3000);
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); claims = data ?? []; }
  const { data: statuses } = await sb.from("statuses").select("key, label, tone, lawruler_group").eq("active", true).order("sort");
  return <ReportsView leads={leads ?? []} claims={claims} scope="staff" statuses={statuses ?? []} />;
}
