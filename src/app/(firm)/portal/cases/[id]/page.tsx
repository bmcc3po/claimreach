export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import FirmCaseWorkbench from "@/components/FirmCaseWorkbench";
import { gateUser } from "@/lib/gate";
import { resolveMatter } from "@/lib/matter";
import { firmMatterReleased } from "@/lib/firm-release";

export default async function FirmCaseDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ claim?: string }>;
}) {
  const { id } = await params;
  const { claim: claimId } = await searchParams;
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user || user.role !== "firm" || !user.firmId || !user.can("firm.portal")) notFound();
  // Lead-wide answers, internal notes and vendor payloads never cross this
  // boundary. Each workbench receives exactly its own released claim.
  const { data: lead, error: leadError } = await sb.from("leads")
    .select("id, firm_id, lead_no, claimant_name, phone, case_type, firm_ref_no, stage")
    .eq("id", id).eq("firm_id", user.firmId).is("archived_at", null).maybeSingle();
  if (leadError) throw new Error("Could not load the file. Please try again.");
  if (!lead) notFound();
  const matter = await resolveMatter(sb, id, { claimId, authoritativeDb: supabaseAdmin() });
  if (!matter.ok) {
    if (!matter.ambiguous) notFound();
    const { data: choices, error } = await sb.from("claims").select("id, claim_type, created_at")
      .eq("lead_id", id).eq("firm_id", user.firmId).order("created_at");
    if (error) throw new Error("Could not load this file’s matters. Please try again.");
    return <div><h1>{lead.claimant_name || lead.lead_no}</h1><p>Choose the matter to review.</p><ul>
      {(choices ?? []).map(c => <li key={c.id}><a href={`/portal/cases/${id}?claim=${c.id}`}>{c.claim_type || "Matter"} · {c.created_at ? new Date(c.created_at).toLocaleDateString() : "Date unavailable"}</a></li>)}
    </ul></div>;
  }
  if (matter.claim.firm_id !== user.firmId) notFound();
  const unlocked = await firmMatterReleased(sb, matter.claim.status);
  if (!unlocked) {
    return <FirmCaseWorkbench lead={lead} claims={[]} activity={[]} callLogs={[]} locked stageLabel="Awaiting file review" />;
  }
  const [{ data: claim, error: claimError }, { data: activity, error: activityError }, { data: callLogs, error: callsError }] = await Promise.all([
    sb.from("claims").select("id, lead_id, firm_id, claim_type, status, answers, tier_letter, tier_number")
      .eq("id", matter.claim.id).eq("lead_id", id).eq("firm_id", user.firmId).maybeSingle(),
    sb.from("audit_log").select("created_at, actor_name, category, description")
      .eq("lead_id", id).eq("claim_id", matter.claim.id).eq("firm_id", user.firmId)
      .order("created_at", { ascending: false }).limit(100),
    sb.from("call_logs").select("*").eq("lead_id", id).eq("claim_id", matter.claim.id).eq("firm_id", user.firmId)
      .order("created_at", { ascending: false }).limit(100),
  ]);
  if (claimError || activityError || callsError) throw new Error("Could not load the complete file. Please try again.");
  if (!claim || claim.status !== matter.claim.status) notFound();
  return <FirmCaseWorkbench key={claim.id} lead={lead} claims={[claim]} activity={activity ?? []} callLogs={callLogs ?? []} />;
}
