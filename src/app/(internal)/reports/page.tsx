export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
export default async function StaffReports() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads").select("id, lead_no, claimant_name, stage, case_type, campaign, created_at, updated_at, first_opened_at, first_dialed_at").limit(3000);
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); claims = data ?? []; }
  // The whole status table, retired rows too, so a retired custom signed
  // status still counts (one signed rule, isSignedKey). Labels and the status
  // picker still get only the live (active) set, exactly as before.
  const { data: catalog } = await sb.from("statuses").select("key, label, tone, lawruler_group, requires_esign, phase, active").order("sort");
  const statuses = (catalog ?? []).filter((s: any) => s.active === true);
  return <ReportsView leads={leads ?? []} claims={claims} scope="staff" statuses={statuses} catalog={catalog ?? []} />;
}
