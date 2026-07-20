export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import FirmCaseWorkbench from "@/components/FirmCaseWorkbench";
import { unlocksFirm, type StatusDef } from "@/lib/statuses";

export default async function FirmCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const { data: claims } = await sb.from("claims").select("*").eq("lead_id", id).order("created_at");

  // Firm visibility wall: until the file reaches a status that unlocks the firm
  // (QA approved / delivered / retained), the firm sees only name + phone +
  // case type + a stage label. No intake answers, retainer, or notes.
  const { data: statuses } = await sb.from("statuses").select("*").eq("active", true);
  const latest = (claims ?? [])[claims!.length - 1];
  const unlocked = unlocksFirm(latest?.status, (statuses ?? []) as StatusDef[]);

  if (!unlocked) {
    const stageWord = (latest?.status || "new").startsWith("signed") || ["qa", "grievous", "signed_qa", "signed_grievous"].includes(latest?.status)
      ? "Awaiting QA review"
      : ["approved", "signed_approved", "delivered", "retained"].includes(latest?.status)
        ? "Ready for firm review"
        : "Attempting contact";
    const strippedLead = {
      id: lead.id, lead_no: lead.lead_no, claimant_name: lead.claimant_name,
      phone: lead.phone, case_type: lead.case_type, firm_id: lead.firm_id,
      firm_locked: true, firm_stage_label: stageWord,
    };
    return <FirmCaseWorkbench lead={strippedLead} claims={[]} activity={[]} callLogs={[]} locked stageLabel={stageWord} />;
  }

  const { data: activity } = await sb.from("audit_log")
    .select("created_at, actor_name, category, description").eq("lead_id", id)
    .order("created_at", { ascending: false }).limit(100);
  const { data: callLogs } = await sb.from("call_logs").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);
  return <FirmCaseWorkbench lead={lead} claims={claims ?? []} activity={activity ?? []} callLogs={callLogs ?? []} />;
}
