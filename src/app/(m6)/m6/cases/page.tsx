export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import CaseList from "@/components/m6/CaseList";
import type { Health } from "@/lib/m6";

export default async function CasesPage() {
  const sb = await supabaseServer();

  const { data: status } = await sb
    .from("lead_contact_status")
    .select("lead_id, lead_no, claimant_name, health, days_overdue, last_two_way_at, next_touch_due, ladder_step, retention_owner, live_contact_points")
    .order("days_overdue", { ascending: false })
    .limit(1000);

  const ids = (status ?? []).map((s: any) => s.lead_id);
  const { data: leads } = ids.length
    ? await sb.from("leads").select("id, phone, first_name, last_name, full_name").in("id", ids)
    : { data: [] as any[] };

  const { data: users } = await sb.from("app_users").select("id, full_name");

  const byLead = new Map((leads ?? []).map((l: any) => [l.id, l]));
  const byUser = new Map((users ?? []).map((u: any) => [u.id, u.full_name]));

  const rows = (status ?? []).map((s: any) => {
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
        <p className="m6-sub">Every Motel 6 file and how reachable it is right now.</p>
      </div>
      <CaseList rows={rows} />
    </div>
  );
}
