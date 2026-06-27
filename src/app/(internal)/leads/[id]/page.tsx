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

  // Properties for each claim, grouped by claim_id.
  const claimIds = (claims ?? []).map((c) => c.id);
  const claimProperties: Record<string, any[]> = {};
  if (claimIds.length) {
    const { data: cp } = await sb.from("claim_properties")
      .select("*").in("claim_id", claimIds).order("sequence_order");
    for (const row of cp ?? []) {
      (claimProperties[row.claim_id] ||= []).push(row);
    }
  }

  // Audit trail for this file (Activity Log).
  const { data: audit } = await sb.from("audit_log")
    .select("id, created_at, actor_name, category, description")
    .eq("lead_id", id).order("created_at", { ascending: false }).limit(200);

  // Notes for this file.
  const { data: notes } = await sb.from("notes")
    .select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);

  // Call logs for this file.
  const { data: callLogs } = await sb.from("call_logs")
    .select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);

  // Lightweight my-day stats placeholder (wired to real metrics later).
  const stats = { signed: 0, tierA: 0, weekPay: 0, wip: claims?.length ?? 0 };

  return (
    <LeadWorkspace
      lead={lead}
      claims={claims ?? []}
      activity={activity ?? []}
      stats={stats}
      claimProperties={claimProperties}
      audit={audit ?? []}
      notes={notes ?? []}
      callLogs={callLogs ?? []}
    />
  );
}
