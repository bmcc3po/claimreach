export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import StatusManager from "@/components/StatusManager";
import DqReasonManager from "@/components/DqReasonManager";

export default async function StatusesSettingsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) redirect("/settings");

  const { data: statuses } = await sb.from("statuses").select("*").order("sort");
  const { data: reasons } = await sb.from("dq_reasons").select("*").order("sort");

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Statuses & DQ reasons</h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>Define the status set that moves files through intake, QA, and the firm handoff, and the disqualification reasons agents pick from. Changes take effect everywhere immediately.</p>
      <StatusManager initial={statuses ?? []} />
      <div style={{ height: 18 }} />
      <DqReasonManager initial={reasons ?? []} />
    </div>
  );
}
