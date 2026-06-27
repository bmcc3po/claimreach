import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "edge";

async function me(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users")
    .select("id, role, firm_id").eq("id", auth.user.id).maybeSingle();
  return data ? { ...data, uid: auth.user.id } : null;
}

// POST { op:'create', lead_id, firm_id, claim_type, campaign? }
// POST { op:'save', claim_id, patch:{...} }            -- update claim fields/answers
// POST { op:'status', claim_id, status, qualification?, dq_reason? }
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = await req.json();

  if (p.op === "create") {
    const { data, error } = await sb.from("claims").insert({
      firm_id: p.firm_id,
      lead_id: p.lead_id,
      claim_type: p.claim_type ?? "motel_trafficking",
      campaign: p.campaign ?? null,
      created_by: u.uid,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  if (p.op === "save") {
    const { error } = await sb.from("claims").update(p.patch).eq("id", p.claim_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (p.op === "status") {
    const patch: Record<string, any> = { status: p.status };
    if (p.qualification) patch.qualification = p.qualification;
    if (p.dq_reason !== undefined) patch.dq_reason = p.dq_reason;
    const { error } = await sb.from("claims").update(patch).eq("id", p.claim_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // On qualify/sign, enroll the lead into active drip rules.
    if (["qualified", "signed"].includes(p.status)) {
      const { data: cl } = await sb.from("claims").select("lead_id, firm_id").eq("id", p.claim_id).maybeSingle();
      if (cl?.lead_id) { try { await sb.rpc("enroll_drips_for_lead", { p_lead: cl.lead_id, p_firm: cl.firm_id }); } catch {} }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
