import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { FIRM_WRITABLE_STAGES } from "@/lib/questionnaire";

export const runtime = "edge";

async function me(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users")
    .select("id, role, firm_id").eq("id", auth.user.id).maybeSingle();
  return data ? { ...data, uid: auth.user.id } : null;
}

// POST { op: 'create', firm_id, firm_ref_no?, lawruler_ref_no? }
// POST { op: 'save', lead_id, lead: {...fields}, properties: [{...}] }
// POST { op: 'stage', lead_id, stage }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await req.json();
  const op = payload.op;

  if (op === "create") {
    if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const firm_id = payload.firm_id;
    const { data: leadNo, error: mintErr } = await sb.rpc("mint_lead_no", { p_firm: firm_id });
    if (mintErr) return NextResponse.json({ error: mintErr.message }, { status: 500 });

    const { data, error } = await sb.from("leads").insert({
      firm_id,
      lead_no: leadNo,
      firm_ref_no: payload.firm_ref_no ?? null,
      lawruler_ref_no: payload.lawruler_ref_no ?? null,
      case_type: payload.case_type ?? "motel_trafficking",
      claimant_name: payload.claimant_name ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      stage: payload.stage ?? "referral_received",
      created_by: u.uid,
      assigned_agent: u.uid,
    }).select("id, lead_no").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lead: data });
  }

  if (op === "save") {
    if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { lead_id, lead, properties } = payload;
    if (lead && "full_name" in lead) delete lead.full_name;

    const { error: leadErr } = await sb.from("leads").update(lead).eq("id", lead_id);
    if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });

    // Fire outbound webhook on a status change so firms stay in sync.
    if (lead && lead.status) {
      try {
        const { fireEvent } = await import("@/lib/webhook-deliver");
        const { data: row } = await sb.from("leads").select("firm_id, lead_no, external_id, status, first_name, last_name, phone, email, case_type").eq("id", lead_id).maybeSingle();
        if (row?.firm_id) {
          const evt = lead.status === "signed" ? "lead.signed" : lead.status === "dq" ? "lead.dq" : lead.status === "qualified" ? "lead.qualified" : "lead.updated";
          await fireEvent(row.firm_id, evt, { lead_id, ...row });
        }
      } catch {}
    }

    if (Array.isArray(properties)) {
      // Replace property rows for this lead (simple, idempotent save).
      await sb.from("lead_properties").delete().eq("lead_id", lead_id);
      if (properties.length) {
        const rows = properties.map((p: any, i: number) => ({
          ...p, lead_id, firm_id: lead.firm_id, sequence_order: i + 1,
        }));
        const { error: pErr } = await sb.from("lead_properties").insert(rows);
        if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (op === "stage") {
    const { lead_id, stage } = payload;
    if (u.role === "firm" && !FIRM_WRITABLE_STAGES.includes(stage)) {
      return NextResponse.json({ error: "firm may not set that stage" }, { status: 403 });
    }
    const { error } = await sb.from("leads").update({ stage }).eq("id", lead_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("lead_activity").insert({
      firm_id: u.firm_id, lead_id, kind: "stage_change",
      actor: u.uid, body: stage, meta: { stage },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
