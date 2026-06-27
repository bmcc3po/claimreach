export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import LeadsView from "@/components/LeadsView";

export default async function LeadsPage() {
  const sb = await supabaseServer();
  const { data: leads } = await sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, phone, email, address, stage, supervisor_flag, created_at, updated_at, case_type")
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

  return <LeadsView leads={withClaims} basePath="/leads" addPath="/intake" />;
}
