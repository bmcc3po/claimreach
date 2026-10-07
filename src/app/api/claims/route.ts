import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { manualIntakeStatusAllowed } from "@/lib/statuses";
import { preserveDeclineEvidence } from "@/lib/signed-decline";

export const runtime = "edge";

async function me(sb: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users")
    .select("id, role, firm_id, full_name, active").eq("id", auth.user.id).maybeSingle();
  return data && data.active !== false ? { ...data, uid: auth.user.id } : null;
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
    // A generic claim save carries FORM CONTENT, never workflow state: status,
    // qualification, approvals and delivery all have their own commands with
    // their own gates and audit (Astra round 5: a raw patch was an alternate
    // write path around every one of them).
    const ALLOWED = new Set(["answers", "summary", "claim_type", "tier", "notes"]);
    const patch: Record<string, any> = {};
    const rejected: string[] = [];
    for (const k of Object.keys(p.patch ?? {})) {
      if (ALLOWED.has(k)) patch[k] = p.patch[k]; else rejected.push(k);
    }
    if (rejected.length) {
      return NextResponse.json({ error: `These fields do not save through a form: ${rejected.join(", ")}. Use their own commands (status, campaign, QA).` }, { status: 400 });
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    const current = await sb.from("claims").select("id,answers,updated_at").eq("id", p.claim_id).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ error: "Could not verify the file before saving." }, { status: 409 });
    if ('answers' in patch) patch.answers = preserveDeclineEvidence(patch.answers, current.data.answers);
    let write = sb.from("claims").update(patch).eq("id", p.claim_id);
    write = current.data.updated_at == null ? write.is("updated_at", null) : write.eq("updated_at", current.data.updated_at);
    const { data: saved, error } = await write.select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!saved) return NextResponse.json({ error: "The file changed. Reload before saving again." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (p.op === "status") {
    const catalog = await sb.from("statuses").select("*");
    if (catalog.error || !Array.isArray(catalog.data)) return NextResponse.json({ error: "Could not verify the available statuses. Refresh and try again." }, { status: 503 });
    const nextStatus = catalog.data.find((item: any) => item.key === p.status);
    if (!nextStatus || nextStatus.active === false) return NextResponse.json({ error: "Pick an active status from the list." }, { status: 400 });
    if (!manualIntakeStatusAllowed(nextStatus)) return NextResponse.json({ error: "This status is set by agreement review, QA, or firm delivery. Use that workflow so its evidence stays accurate." }, { status: 409 });
    const { data: cl } = await sb.from("claims").select("lead_id, firm_id").eq("id", p.claim_id).maybeSingle();
    if (!cl?.lead_id) return NextResponse.json({ error: "claim has no lead" }, { status: 400 });
    // Route through the central setter: enforces the DQ-reason gate, keeps the
    // QA-queue flags in sync, writes the Activity Log, and fires the automation
    // + firm-delivery triggers (so "submit to firm" actually hands off).
    const { setClaimStatusForLeads } = await import("@/lib/claim-status");
    const res = await setClaimStatusForLeads({
      leadIds: [cl.lead_id],
      claimIds: [p.claim_id],
      status: p.status,
      dqReasonKey: p.dq_reason_key ?? null,
      dqNote: p.dq_reason ?? null,
      actorId: u.id,
      actorName: u.full_name ?? "User",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    // On a qualifying/approved/signed status, enroll the lead into drip rules.
    const { resolveStatus } = await import("@/lib/statuses");
    const { loadStatuses } = await import("@/lib/claim-status");
    const def = resolveStatus(p.status, await loadStatuses());
    if (def.qualify === "qualify" || def.track === "esign") {
      try { const { supabaseAdmin: adminFor } = await import("@/lib/supabase-server"); await adminFor().rpc("enroll_drips_for_lead", { p_lead: cl.lead_id, p_firm: cl.firm_id }); } catch {}
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
