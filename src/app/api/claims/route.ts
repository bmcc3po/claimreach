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
    // Resolve the campaign (authoritative for case_type, intake, retainer, track).
    let campaignId: string | null = p.campaign_id ?? null;
    let caseType: string | null = p.claim_type ?? null;
    let campaignName: string | null = p.campaign ?? null;
    if (campaignId) {
      const { data: camp } = await sb.from("campaigns").select("id, name, case_type").eq("id", campaignId).maybeSingle();
      if (camp) { caseType = camp.case_type ?? caseType; campaignName = camp.name ?? campaignName; }
    }
    // Never silently default to motel. If we cannot determine a case type, refuse.
    if (!caseType) {
      return NextResponse.json({ error: "No case type could be determined for this claim. Pick a campaign/type." }, { status: 400 });
    }

    // DEDUP: warn (do not hard-block) if this lead already has a claim of the SAME
    // case type. The agent must justify the override; QA gets a persistent alarm.
    const { data: existing } = await sb.from("claims").select("id, claim_type").eq("lead_id", p.lead_id);
    const sameType = (existing ?? []).find((c: any) => (c.claim_type || "").toLowerCase() === caseType!.toLowerCase());
    if (sameType && !p.dup_override_reason) {
      return NextResponse.json({
        needs_override: true,
        case_type: caseType,
        message: `This person already has a ${caseType} claim. Adding another of the same case type is rare. To proceed, explain what is unique about this claim.`,
      }, { status: 200 });
    }

    const insert: Record<string, any> = {
      firm_id: p.firm_id, lead_id: p.lead_id, campaign_id: campaignId,
      claim_type: caseType, campaign: campaignName, created_by: u.uid,
    };
    if (sameType && p.dup_override_reason) {
      insert.dup_override = true;
      insert.dup_override_reason = String(p.dup_override_reason).slice(0, 1000);
      insert.dup_override_by = u.uid;
      insert.dup_override_at = new Date().toISOString();
    }
    const { data, error } = await sb.from("claims").insert(insert).select("id").single();
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
