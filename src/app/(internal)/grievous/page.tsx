export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import GrievousConsole from "@/components/GrievousConsole";

export default async function GrievousPage() {
  const sb = await supabaseServer();
  const { data: claims } = await sb.from("claims")
    .select("id, lead_id, claim_type, campaign, status, answers, created_at, leads!inner(claimant_name, lead_no, archived_at)")
    .is("leads.archived_at", null).in("status", ["qualified", "in_progress"]).order("created_at", { ascending: false }).limit(40);
  return <GrievousConsole claims={claims ?? []} />;
}
