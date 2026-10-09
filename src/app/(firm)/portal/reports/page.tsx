export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
import ReadError from "@/components/ReadError";
export default async function FirmReports() {
  const sb = await supabaseServer();
  const unavailable = <ReadError title="Reports" message="The report could not load all case information. Try again before relying on these counts." href="/portal/reports" />;
  const { data: leads, error: leadsError } = await sb.from("leads").select("id, stage, case_type, campaign, created_at, updated_at, first_opened_at, first_dialed_at").is("archived_at", null).limit(2000);
  if (leadsError) return unavailable;
  const ids = (leads ?? []).map((l) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data, error } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); if (error) return unavailable; claims = data ?? []; }
  // Only the fields the signed rule reads (every row, retired too), so the
  // firm's signed count uses the same rule as the staff pages.
  const { data: catalog, error: catalogError } = await sb.from("statuses").select("key, phase, requires_esign");
  if (catalogError) return unavailable;
  return <>{leads?.length === 2000 && <p role="status" className="muted">This report is limited to 2,000 cases. It may not include every case in your firm.</p>}<ReportsView leads={leads ?? []} claims={claims} scope="firm" catalog={catalog ?? []} /></>;
}
