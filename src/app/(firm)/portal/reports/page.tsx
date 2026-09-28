export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
export default async function FirmReports() {
  const sb = await supabaseServer();
  const { data: leads } = await sb.from("leads").select("id, stage, case_type, campaign, created_at, updated_at, first_opened_at, first_dialed_at").limit(2000);
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); claims = data ?? []; }
  // Only the fields the signed rule reads (every row, retired too), so the
  // firm's signed count uses the same rule as the staff pages. A failed read
  // falls back to the signed_* family, never to a local rule.
  const { data: catalog } = await sb.from("statuses").select("key, phase, requires_esign");
  return <ReportsView leads={leads ?? []} claims={claims} scope="firm" catalog={catalog ?? []} />;
}
