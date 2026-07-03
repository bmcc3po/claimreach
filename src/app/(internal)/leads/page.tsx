export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import LeadsView from "@/components/LeadsView";

export default async function LeadsPage() {
  const sb = await supabaseServer();
  const { data: leads } = await sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, phone, email, address, stage, supervisor_flag, created_at, updated_at, case_type, status, signed_at, firm_sent_at, esign_sent_at")
    .order("updated_at", { ascending: false })
    .limit(300);

  // Fetch claims separately so a join issue can't zero out the whole list.
  const ids = (leads ?? []).map((l) => l.id);
  const claimsByLead: Record<string, any[]> = {};
  if (ids.length) {
    const { data: claims } = await sb.from("claims")
      .select("id, lead_id, campaign, claim_type, status, case_summary, stage").in("lead_id", ids);
    for (const c of claims ?? []) (claimsByLead[c.lead_id] ||= []).push(c);
  }
  const withClaims = (leads ?? []).map((l) => ({ ...l, claims: claimsByLead[l.id] ?? [] }));

  // Who am I + the option lists for bulk actions.
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role, perm_overrides").eq("id", user!.id).maybeSingle();
  const canBulk = !!me && ["owner", "admin", "agent", "qa"].includes(me.role);
  const { data: agents } = await sb.from("app_users").select("id, full_name").in("role", ["agent", "admin", "owner"]).order("full_name");
  const { data: firms } = await sb.from("firms").select("id, name").order("name");

  // Live, owner-editable status set drives badges, filters, and bulk actions.
  const { data: statuses } = await sb.from("statuses").select("*").eq("active", true).order("sort");
  const { data: dqReasons } = await sb.from("dq_reasons").select("*").eq("active", true).order("sort");

  return <LeadsView leads={withClaims} basePath="/leads" addPath="/intake" agents={agents ?? []} firms={firms ?? []} canBulk={canBulk} statuses={statuses ?? []} dqReasons={dqReasons ?? []} />;
}
