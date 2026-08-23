export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import CaseList from "@/components/m6/CaseList";
import { filterM6StatusRows, type Health } from "@/lib/m6";
import { applyM6LeadFilters, getTmpFirmId, M6_STATUS_COLUMNS } from "@/lib/m6-scope";

export default async function CasesPage() {
  const sb = await supabaseServer();
  const tmpFirmId = await getTmpFirmId(sb);
  if (!tmpFirmId) {
    return (
      <div className="m6-page">
        <div className="m6-head">
          <h1>Cases</h1>
          <p className="m6-sub">This app is not available.</p>
        </div>
      </div>
    );
  }

  const { data: status } = await applyM6LeadFilters(
    sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
    tmpFirmId,
  ).order("days_overdue", { ascending: false }).limit(1000);

  const scoped = filterM6StatusRows((status ?? []) as any[], tmpFirmId);
  const ids = scoped.map((s: any) => s.lead_id);
  const { data: leads } = ids.length
    ? await sb.from("leads").select("id, phone, first_name, last_name, full_name").eq("firm_id", tmpFirmId).in("id", ids)
    : { data: [] as any[] };

  const { data: users } = await sb.from("app_users").select("id, full_name");

  const byLead = new Map((leads ?? []).map((l: any) => [l.id, l]));
  const byUser = new Map((users ?? []).map((u: any) => [u.id, u.full_name]));

  const rows = scoped.map((s: any) => {
    const l = byLead.get(s.lead_id) ?? {};
    return {
      id: s.lead_id,
      lead_no: s.lead_no,
      name: s.claimant_name || l.full_name ||
        [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed file",
      phone: l.phone ?? null,
      health: s.health as Health,
      days_overdue: s.days_overdue ?? 0,
      last_two_way_at: s.last_two_way_at,
      next_touch_due: s.next_touch_due,
      ladder_step: s.ladder_step,
      owner: s.retention_owner ? (byUser.get(s.retention_owner) ?? "Assigned") : null,
      points: s.live_contact_points ?? 0,
    };
  });

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Cases</h1>
        <p className="m6-sub">Every file, and the last time someone actually reached them.</p>
      </div>
      <CaseList rows={rows} />
    </div>
  );
}
