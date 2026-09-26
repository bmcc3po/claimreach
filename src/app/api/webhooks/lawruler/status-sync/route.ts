import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { mapLawRulerStatus, shouldApplyLr } from "@/lib/lawruler-status";
import { setClaimStatusForLeads, loadStatuses } from "@/lib/claim-status";
export const runtime = "edge";

// GET /api/webhooks/lawruler/status-sync   (Operator or admin, signed in)
//
// One pass over the Motel 6 files: takes the last status LawRuler sent for
// each one (already in the file's history) and sets the ClaimReach status to
// match, using the same table as the live hook. Safe to run again; a file
// already at the right status is left alone.
export async function GET() {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "Operator and admins only." }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: leads, error } = await admin.from("leads")
    .select("id, lead_no, claimant_name, claims(status, created_at)")
    .or("campaign.eq.motel6,case_type.eq.motel_trafficking").is("archived_at", null).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (leads ?? []).map((l: any) => l.id);
  const latest: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data: acts } = await admin.from("lead_activity").select("lead_id, meta, created_at")
      .in("lead_id", ids.slice(i, i + 100)).eq("meta->>source", "lawruler").order("created_at", { ascending: false });
    for (const a of acts ?? []) {
      const st = (a as any).meta?.status;
      if (st && !latest[a.lead_id]) latest[a.lead_id] = String(st);
    }
  }

  const statuses = await loadStatuses();
  const out: any[] = [];
  for (const l of leads ?? []) {
    const lr = latest[(l as any).id];
    const mapped = mapLawRulerStatus(lr);
    if (!mapped) continue;
    const cur = [...((l as any).claims ?? [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))[0]?.status;
    if (!shouldApplyLr(cur, mapped)) { out.push({ lead_no: (l as any).lead_no, lawruler: lr, was: cur, now: cur, changed: false }); continue; }
    const r = await setClaimStatusForLeads({ leadIds: [(l as any).id], status: mapped.status, dqReasonKey: mapped.dqReasonKey ?? null, dqNote: mapped.dqNote ?? null, actorId: me.id, actorName: "LawRuler sync", statuses });
    out.push({ lead_no: (l as any).lead_no, name: (l as any).claimant_name, lawruler: lr, was: cur, now: r.ok ? mapped.status : cur, changed: r.ok, error: r.ok ? undefined : r.error });
  }
  return NextResponse.json({
    motel6_files: (leads ?? []).length,
    with_a_lawruler_status: Object.keys(latest).length,
    changed: out.filter((x) => x.changed).length,
    results: out,
  });
}
