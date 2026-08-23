export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { applyM6LeadFilters, getTmpFirmId, M6_STATUS_COLUMNS, requireM6Session } from "@/lib/m6-scope";
import { filterM6StatusRows } from "@/lib/m6";
import { todayBuckets } from "@/lib/m6-cadence";

// One tap from the car: open the next file that needs a voice, else Today.
export default async function CallPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) redirect("/firm-login");
  const tmpFirmId = session.tmpFirmId || await getTmpFirmId(sb);
  if (!tmpFirmId) redirect("/m6");

  const { data } = await applyM6LeadFilters(
    sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
    tmpFirmId,
  ).order("days_overdue", { ascending: false }).limit(200);

  const rows = filterM6StatusRows((data ?? []) as any[], tmpFirmId);
  const buckets = todayBuckets(rows);
  const next = buckets.repliesWaiting[0]
    || buckets.heartbeatOverdue[0]
    || buckets.neverReached[0]
    || buckets.failedQuiet[0];
  redirect(next ? `/m6/cases/${next.lead_id}` : "/m6");
}
