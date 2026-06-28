import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { setClaimStatusForLeads } from "@/lib/claim-status";
export const runtime = "edge";

// Bulk operations on selected leads. Body: { op, ids:[], ...args }
// ops: set_status, set_stage, assign, move_firm, delete
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, perm_overrides").eq("id", auth.user.id).maybeSingle();
  const isStaff = me && ["owner", "admin", "agent", "qa"].includes(me.role);
  if (!isStaff) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const canDelete = me && (["owner", "admin"].includes(me.role) || me.perm_overrides?.["leads.delete"]);

  const b = await req.json();
  const ids: string[] = Array.isArray(b.ids) ? b.ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: "no leads selected" }, { status: 400 });

  try {
    if (b.op === "set_stage") {
      const { error } = await sb.from("leads").update({ stage: b.stage }).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "assign") {
      const { error } = await sb.from("leads").update({ assigned_agent: b.agentId || null }).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "move_firm") {
      const { error } = await sb.from("leads").update({ firm_id: b.firmId }).in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "set_status") {
      // status lives on the claim; the helper enforces the DQ-reason gate and audits.
      const { data: meName } = await sb.from("app_users").select("full_name").eq("id", auth.user.id).maybeSingle();
      const res = await setClaimStatusForLeads({
        leadIds: ids,
        status: b.status,
        dqReasonKey: b.dq_reason_key ?? null,
        dqNote: b.dq_note ?? null,
        actorId: auth.user.id,
        actorName: meName?.full_name ?? "User",
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, count: ids.length });
    }
    if (b.op === "delete") {
      if (!canDelete) return NextResponse.json({ error: "no delete permission" }, { status: 403 });
      const { error } = await sb.from("leads").delete().in("id", ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: ids.length });
    }
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bulk failed" }, { status: 500 });
  }
}
