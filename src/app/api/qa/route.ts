import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";

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
  const { data } = await sb.from("app_users").select("id, role, firm_id, full_name, active, perm_overrides").eq("id", auth.user.id).maybeSingle();
  if (data?.active === false) return null; // deactivated reviews nothing
  return data ? { ...data, uid: auth.user.id } : null;
}

function isSignedTrack(status?: string): boolean {
  return /^signed_/.test(status || "") || status === "esign_sent";
}

// The campaign's esign_required flag is authoritative for which track a file
// uses. The caller passes the BOUND claim's campaign when it has one, so the
// track belongs to the matter under review, not an arbitrary claim row.
// Fall back to inferring from the current status only if the campaign is unknown.
async function resolveEsignTrack(admin: any, leadId: string, currentStatus?: string, campaignId?: string | null): Promise<boolean> {
  try {
    let camp = campaignId;
    if (!camp) {
      const { data: claim } = await admin.from("claims").select("campaign_id").eq("lead_id", leadId).limit(1).maybeSingle();
      camp = claim?.campaign_id ?? null;
    }
    if (camp) {
      const { data: campRow } = await admin.from("campaigns").select("esign_required").eq("id", camp).maybeSingle();
      if (campRow && typeof campRow.esign_required === "boolean") return campRow.esign_required;
    }
  } catch {}
  return isSignedTrack(currentStatus);
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u || u.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const lead_id = url.searchParams.get("lead_id");
  if (lead_id) {
    const { data: draftRow } = await sb.from("leads").select("qa_draft").eq("id", lead_id).maybeSingle();
    const { data: reviews } = await sb.from("qa_reviews").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false });
    const { data: cards } = await sb.from("report_cards").select("*").eq("lead_id", lead_id).order("created_at", { ascending: false });
    const { data: thread } = await sb.from("qa_thread").select("*").eq("lead_id", lead_id).order("created_at");
    const { data: dupClaims } = await sb.from("claims").select("claim_type, dup_override, dup_override_reason, dup_ack_at").eq("lead_id", lead_id).eq("dup_override", true);
    const dupOverride = (dupClaims ?? []).length ? { claims: dupClaims, acknowledged: (dupClaims ?? []).every((c: any) => c.dup_ack_at) } : null;
    return NextResponse.json({ draft: draftRow?.qa_draft ?? null, reviews: reviews ?? [], cards: cards ?? [], thread: thread ?? [], dupOverride });
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
  // Autosaved in-progress grades. A reviewer who clicks to the Calls tab and
  // back should not lose their work; only a real decision writes qa_reviews.
  if (b.op === "draft") {
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { error } = await admin.from("leads").update({ qa_draft: b.draft ?? null }).eq("id", b.lead_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

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
    // Routing a file takes the QA capability — the role defaults, honoring an
    // explicit per-user grant or denial (Astra round 5: an explicit
    // intake.qa=false was ignored by the hardcoded role list).
    if (u.role === "firm" || !can(u.role, u.perm_overrides, "intake.qa")) {
      return NextResponse.json({ error: "Only QA, a manager, an admin or the owner can route a file." }, { status: 403 });
    }
    const { lead_id, claim_id } = b;
    if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    // The review is about ONE matter. A named claim must belong to this lead;
    // unnamed defaults to the newest claim — and everything below (track,
    // evidence, the status change) is bound to that matter, never a sibling
    // (Astra rounds 4-5).
    const { data: allClaims } = await admin.from("claims")
      .select("id, status, claim_type, created_by, campaign_id, created_at")
      .eq("lead_id", lead_id).order("created_at", { ascending: false });
    const claim = claim_id
      ? (allClaims ?? []).find((c: any) => c.id === claim_id)
      : (allClaims ?? [])[0];
    if (claim_id && !claim) return NextResponse.json({ error: "That claim is not on this file. Refresh and pick the matter again." }, { status: 400 });
    if (!claim) return NextResponse.json({ error: "This file has no claim to review." }, { status: 400 });

    // The three hard gates must actually be graded. A missing value is not a
    // pass (Astra round 5); yellow remains allowed by policy.
    const GATE_VALS = ["green", "yellow", "red"];
    const gates = [b.g_qa_pass, b.g_esign, b.g_criteria];
    for (const g of gates) {
      if (g != null && g !== "" && !GATE_VALS.includes(g)) {
        return NextResponse.json({ error: "Gate grades must be green, yellow or red." }, { status: 400 });
      }
    }
    if (b.decision === "approve" && gates.some((g) => g == null || g === "")) {
      return NextResponse.json({ error: "Cannot approve: grade all three hard gates first." }, { status: 400 });
    }
    const anyRed = gates.includes("red");
    if (b.decision === "approve" && anyRed) {
      return NextResponse.json({ error: "Cannot approve: a hard-gate check is red. Route to WIP or Flag instead." }, { status: 400 });
    }
    if (b.decision === "decline" && !["owner", "admin"].includes(u.role)) {
      return NextResponse.json({ error: "Only BMC can disqualify a file. QA can approve, send to WIP, or flag BMC." }, { status: 403 });
    }
    if (b.decision === "decline" && !b.dq_reason_key) {
      return NextResponse.json({ error: "A disqualification reason is required to decline." }, { status: 400 });
    }

    // Dedup-override alarm: if any claim on this file was an agent override of the
    // same-case-type rule, QA must acknowledge it before approving.
    if (b.decision === "approve") {
      const { data: overrides } = await admin.from("claims").select("id, dup_ack_at").eq("lead_id", lead_id).eq("dup_override", true);
      const unacked = (overrides ?? []).some((c: any) => !c.dup_ack_at);
      if (unacked && !b.dup_ack) {
        return NextResponse.json({ error: "This file has a same-case-type override that must be acknowledged before approving.", needs_dup_ack: true }, { status: 200 });
      }
      if (unacked && b.dup_ack) {
        await admin.from("claims").update({ dup_ack_by: u.id, dup_ack_at: new Date().toISOString() }).eq("lead_id", lead_id).eq("dup_override", true);
      }
    }

    // Determine current status / track for the BOUND claim. Campaign's
    // esign_required is authoritative.
    const signed = await resolveEsignTrack(admin, lead_id, claim.status, claim.campaign_id);

    // The e-sign gate is verified against the RECORDS, not the reviewer's
    // checkbox (Astra round 4: approval trusted caller-supplied labels). On
    // the signed track, approving requires a real completed signing that
    // belongs to THIS matter's campaign — a sibling matter's signature does
    // not sign this one (Astra round 5). Legacy retainers predate campaigns
    // and stay lead-level.
    if (b.decision === "approve" && signed) {
      const [{ data: ds }, { data: legacy }] = await Promise.all([
        admin.from("esign_submissions").select("id, campaign_id").eq("lead_id", lead_id).in("status", ["signed", "completed"]),
        admin.from("retainers").select("id").eq("lead_id", lead_id).eq("status", "signed").limit(1),
      ]);
      const hit = (ds ?? []).filter((s: any) => !s.campaign_id || !claim.campaign_id || s.campaign_id === claim.campaign_id);
      if (!hit.length && !(legacy ?? []).length) {
        return NextResponse.json({ error: "Cannot approve: no completed signing is on file for this matter. The e-sign gate is checked against the records, not the checkbox." }, { status: 400 });
      }
    }

    // Record the QA review. The review of record MUST write before the file
    // moves: a routed file with no stored review is a false audit trail
    // (Astra round 5).
    const { error: revErr } = await admin.from("qa_reviews").insert({
      lead_id, claim_id: claim.id, firm_id: u.firm_id, reviewer: u.uid, reviewer_name: u.full_name ?? "User",
      g_qa_pass: b.g_qa_pass, g_esign: b.g_esign, g_criteria: b.g_criteria,
      c_leading: b.c_leading, c_complete: b.c_complete,
      qa_note: b.qa_note ?? null, agent_note: b.agent_note ?? null,
      decision: b.decision, dq_reason_key: b.dq_reason_key ?? null,
    });
    if (revErr) {
      return NextResponse.json({ error: `The review did not save, so the file was not moved: ${revErr.message}` }, { status: 500 });
    }

    // Report card (human QA).
    const { data: agent } = claim?.created_by
      ? await sb.from("app_users").select("id, full_name").eq("id", claim.created_by).maybeSingle()
      : { data: null } as any;
    await admin.from("report_cards").insert({
      lead_id, claim_id: claim.id, agent_id: agent?.id ?? null, agent_name: agent?.full_name ?? null,
      grader: "qa", qa_pass: b.g_qa_pass, esign: b.g_esign, criteria: b.g_criteria, leading_flag: b.c_leading, complete: b.c_complete,
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

    // The decision moves THE REVIEWED MATTER. The setter verifies the claim
    // belongs to the lead, requires a real row change, and keeps the person's
    // QA/WIP flags as lead-level aggregates (a sibling still in QA keeps them).
    const res = await setClaimStatusForLeads({
      leadIds: [lead_id], claimIds: [claim.id], status: nextStatus, dqReasonKey: b.dq_reason_key ?? null,
      actorId: u.uid, actorName: u.full_name ?? "QA",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await recordAudit({
      firm_id: u.firm_id, lead_id, actor: u.uid, actor_name: u.full_name ?? "QA",
      category: "status", description: `QA ${b.decision}${b.decision === "decline" ? " (drop letter)" : ""}.`,
      meta: { decision: b.decision, gates: { g_qa_pass: b.g_qa_pass, g_esign: b.g_esign, g_criteria: b.g_criteria } },
    });

    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
