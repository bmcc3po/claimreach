import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

// QA pipeline. Human QA submits a checklist + report card and routes the file.
// Routing maps to the Zip 2 status model:
//   approve -> approved | signed_approved (unlocks firm)
//   decline -> signed_dropped (signed but DQ, billable, drop letter)
//   wip     -> wip | signed_wip (back to agent, fix inbox)
//   flag    -> flag | signed_flag (escalate to BMC)
// Hard gate: any red on the 3 gates blocks approve.

async function me(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb.from("app_users").select("id, role, firm_id, full_name").eq("id", auth.user.id).maybeSingle();
  return data ? { ...data, uid: auth.user.id } : null;
}

function isSignedTrack(status?: string): boolean {
  return /^signed_/.test(status || "") || status === "esign_sent";
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u || u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const lead_id = url.searchParams.get("lead_id");
  if (lead_id) {
    const { data: reviews } = await sb.from("qa_reviews").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false });
    const { data: cards } = await sb.from("report_cards").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false });
    const { data: thread } = await sb.from("qa_thread").select("*").eq("lead_id", lead_id).order("created_at");
    return NextResponse.json({ reviews: reviews ?? [], cards: cards ?? [], thread: thread ?? [] });
  }
  // QA queue: files in a QA-phase status (source of truth, not the flag).
  const QA_STATUSES = ["grievous", "qa", "signed_grievous", "signed_qa"];
  const { data: claimRows } = await sb.from("claims")
    .select("lead_id, status, grievous_verdict, claim_type, updated_at, leads(id, lead_no, claimant_name, phone, case_type)")
    .in("status", QA_STATUSES).order("updated_at", { ascending: false }).limit(200);
  const queue = (claimRows ?? []).filter((c: any) => c.leads).map((c: any) => ({
    id: c.leads.id, lead_no: c.leads.lead_no, claimant_name: c.leads.claimant_name,
    phone: c.leads.phone, case_type: c.leads.case_type,
    claims: [{ status: c.status, grievous_verdict: c.grievous_verdict, claim_type: c.claim_type }],
  }));
  return NextResponse.json({ queue });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u || u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const admin = supabaseAdmin();

  // Post to the internal QA<->agent thread.
  if (b.op === "thread") {
    if (!b.lead_id || !b.body?.trim()) return NextResponse.json({ error: "lead_id and body required" }, { status: 400 });
    const { data: lead } = await sb.from("leads").select("firm_id").eq("id", b.lead_id).maybeSingle();
    await admin.from("qa_thread").insert({
      lead_id: b.lead_id, firm_id: lead?.firm_id, author: u.uid, author_name: u.full_name ?? "User",
      author_role: u.role, body: b.body.trim(),
    });
    return NextResponse.json({ ok: true });
  }

  // Submit a QA review + route the file.
  if (b.op === "submit") {
    const { lead_id, claim_id } = b;
    if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    const gates = [b.g_qa_pass, b.g_esign, b.g_criteria];
    const anyRed = gates.includes("red");
    if (b.decision === "approve" && anyRed) {
      return NextResponse.json({ error: "Cannot approve: a hard-gate check is red. Route to WIP or Flag instead." }, { status: 400 });
    }
    if (b.decision === "decline" && !b.dq_reason_key) {
      return NextResponse.json({ error: "A disqualification reason is required to decline." }, { status: 400 });
    }

    // Determine current status / track.
    const { data: claim } = await sb.from("claims").select("status, claim_type, created_by").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const signed = isSignedTrack(claim?.status);

    // Record the QA review.
    await admin.from("qa_reviews").insert({
      lead_id, claim_id: claim_id ?? null, firm_id: u.firm_id, reviewer: u.uid, reviewer_name: u.full_name ?? "User",
      g_qa_pass: b.g_qa_pass, g_esign: b.g_esign, g_criteria: b.g_criteria,
      c_leading: b.c_leading, c_complete: b.c_complete,
      qa_note: b.qa_note ?? null, agent_note: b.agent_note ?? null,
      decision: b.decision, dq_reason_key: b.dq_reason_key ?? null,
    });

    // Report card (human QA).
    const { data: agent } = claim?.created_by
      ? await sb.from("app_users").select("id, full_name").eq("id", claim.created_by).maybeSingle()
      : { data: null } as any;
    await admin.from("report_cards").insert({
      lead_id, claim_id: claim_id ?? null, agent_id: agent?.id ?? null, agent_name: agent?.full_name ?? null,
      grader: "qa", qa_pass: b.g_qa_pass, esign: b.g_esign, criteria: b.g_criteria, leading: b.c_leading, complete: b.c_complete,
    });

    // If there's an agent coaching note, drop it into the internal thread.
    if (b.agent_note?.trim()) {
      const { data: lead } = await sb.from("leads").select("firm_id").eq("id", lead_id).maybeSingle();
      await admin.from("qa_thread").insert({
        lead_id, firm_id: lead?.firm_id, author: u.uid, author_name: u.full_name ?? "QA",
        author_role: "qa", body: b.agent_note.trim(),
      });
    }

    // Map decision -> status key.
    let nextStatus = "";
    if (b.decision === "approve") nextStatus = signed ? "signed_approved" : "approved";
    else if (b.decision === "decline") nextStatus = "signed_dropped";
    else if (b.decision === "wip") nextStatus = signed ? "signed_wip" : "wip";
    else if (b.decision === "flag") nextStatus = signed ? "signed_flag" : "flag";
    else return NextResponse.json({ error: "unknown decision" }, { status: 400 });

    const res = await setClaimStatusForLeads({
      leadIds: [lead_id], status: nextStatus, dqReasonKey: b.dq_reason_key ?? null,
      actorId: u.uid, actorName: u.full_name ?? "QA",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    // Update queue flags: clear QA-pending; set wip-pending when routed back.
    await admin.from("leads").update({
      qa_pending: false,
      wip_pending: b.decision === "wip",
    }).eq("id", lead_id);

    await recordAudit({
      firm_id: u.firm_id, lead_id, actor: u.uid, actor_name: u.full_name ?? "QA",
      category: "status", description: `QA ${b.decision}${b.decision === "decline" ? " (drop letter)" : ""}.`,
      meta: { decision: b.decision, gates: { g_qa_pass: b.g_qa_pass, g_esign: b.g_esign, g_criteria: b.g_criteria } },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
