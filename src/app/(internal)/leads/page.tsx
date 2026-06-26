export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import LeadsTable from "@/components/LeadsTable";

export default async function LeadsPage() {
  const sb = await supabaseServer();
  const { data: leads } = await sb
    .from("leads")
    .select("id, lead_no, firm_ref_no, claimant_name, phone, email, address, stage, supervisor_flag, created_at, updated_at, case_type, source, claims(id, campaign, claim_type, status, case_summary, stage)")
    .order("updated_at", { ascending: false })
    .limit(300);

  return <LeadsTable leads={leads ?? []} />;
}
