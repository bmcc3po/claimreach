import { workArea, scopeWorkArea, inWorkArea, areaHref } from '@/lib/work-area';
export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import GrievousConsole from "@/components/GrievousConsole";

export default async function GrievousPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const area = workArea((await searchParams).area);
  const sb = await supabaseServer();
  const { data: claims } = await scopeWorkArea(sb.from("claims")
    .select("id, lead_id, claim_type, campaign, status, answers, created_at, leads!inner(claimant_name, lead_no, archived_at)")
    .is("leads.archived_at", null), area, "claim_type").in("status", ["qualified", "in_progress"]).order("created_at", { ascending: false }).limit(40);
  return <GrievousConsole claims={claims ?? []} />;
}
