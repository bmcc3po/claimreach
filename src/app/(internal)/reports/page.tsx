import { workArea, scopeWorkArea, inWorkArea, areaHref } from '@/lib/work-area';
export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ReportsView from "@/components/ReportsView";
import { authUser } from "@/lib/auth-user";
export default async function StaffReports({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const area = workArea((await searchParams).area);
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const me = user ? await sb.from("app_users").select("role,active").eq("id", user.id).maybeSingle() : null;
  const { data: leads } = await scopeWorkArea(sb.from("leads").select("id, lead_no, claimant_name, stage, case_type, campaign, created_at, updated_at, first_opened_at, first_dialed_at").is("archived_at", null), area).limit(3000);
  const ids = (leads ?? []).map((l: any) => l.id);
  let claims: any[] = [];
  if (ids.length) { const { data } = await sb.from("claims").select("lead_id, status, claim_type, campaign, tier, created_at").in("lead_id", ids); claims = (data ?? []).filter(c => inWorkArea(c.claim_type, area)); }
  // The whole status table, retired rows too, so a retired custom signed
  // status still counts (one signed rule, isSignedKey). Labels and the status
  // picker still get only the live (active) set, exactly as before.
  const { data: catalog } = await sb.from("statuses").select("key, label, tone, lawruler_group, requires_esign, phase, active").order("sort");
  const statuses = (catalog ?? []).filter((s: any) => s.active === true);
  return <ReportsView leads={leads ?? []} claims={claims} scope="staff" statuses={statuses} catalog={catalog ?? []} area={area} invoiceReport={area === "mva" && me?.data?.role === "owner" && me?.data?.active === true} />;
}
