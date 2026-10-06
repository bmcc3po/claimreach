import { workArea, scopeWorkArea } from '@/lib/work-area';
import { NETFLY_CAMPAIGN } from '@/lib/netfly-ontake';
export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import GrievousConsole from "@/components/GrievousConsole";

export default async function GrievousPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const area = workArea((await searchParams).area);
  const sb = await supabaseServer();
  const { data: claims } = await scopeWorkArea(sb.from("claims")
    .select("id, lead_id, claim_type, campaign, status, created_at, leads!inner(claimant_name, lead_no, archived_at)")
    .is("leads.archived_at", null), area, "claim_type").in("campaign", ["INNO MVA", NETFLY_CAMPAIGN]).order("created_at", { ascending: false }).limit(40);
  return <GrievousConsole claims={claims ?? []} />;
}
