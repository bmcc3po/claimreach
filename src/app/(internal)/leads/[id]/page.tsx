export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import LeadWorkspace from "@/components/LeadWorkspace";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();

  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  let { data: claims } = await sb.from("claims").select("*")
    .eq("lead_id", id).order("created_at");

  // Auto-create a default claim if this lead has none yet (legacy leads).
  if (!claims || claims.length === 0) {
    const { data: created } = await sb.from("claims").insert({
      firm_id: lead.firm_id, lead_id: lead.id,
      claim_type: lead.case_type ?? "motel_trafficking",
      is_this_file: true,
    }).select("*").single();
    claims = created ? [created] : [];
  }

  const { data: activity } = await sb.from("lead_activity")
    .select("kind, body, created_at").eq("lead_id", id)
    .order("created_at", { ascending: false });

  // Lightweight my-day stats placeholder (wired to real metrics later).
  const stats = { signed: 0, tierA: 0, weekPay: 0, wip: claims?.length ?? 0 };

  return (
    <LeadWorkspace
      lead={lead}
      claims={claims ?? []}
      activity={activity ?? []}
      stats={stats}
    />
  );
}
