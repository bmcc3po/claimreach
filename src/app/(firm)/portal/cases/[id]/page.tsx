export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import FirmCaseWorkbench from "@/components/FirmCaseWorkbench";

export default async function FirmCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const { data: claims } = await sb.from("claims").select("*").eq("lead_id", id).order("created_at");
  const { data: activity } = await sb.from("audit_log")
    .select("created_at, actor_name, category, description").eq("lead_id", id)
    .order("created_at", { ascending: false }).limit(100);
  const { data: callLogs } = await sb.from("call_logs").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100);
  return <FirmCaseWorkbench lead={lead} claims={claims ?? []} activity={activity ?? []} callLogs={callLogs ?? []} />;
}
