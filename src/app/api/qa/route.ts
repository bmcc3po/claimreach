import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { setClaimStatusForLeads } from "@/lib/claim-status";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { resolveMatter, matterRowsFilter, rowBelongsToMatter } from "@/lib/matter";
import { packetShort } from "@/lib/mva-call/esign";
import { SIGNED_BUCKET } from "@/lib/signed-docs";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { signingReleaseGate } from "@/lib/mva-call/replacement";
import { missingRequiredMvaIntake } from "@/lib/mva-call/intake-readiness";

export const runtime = "edge";

// QA pipeline. Human QA submits a checklist + report card and routes the file.
// Routing maps to the Zip 2 status model:
//   approve -> approved | signed_approved (unlocks firm)
//   decline -> signed_dropped (signed but DQ; INNO MVA uses the dedicated signed-decline workflow)
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

// Who may attach legacy signing evidence to a matter. The role must also
// hold the QA capability, so an explicit intake.qa=false still wins.
const ASSOCIATE_ROLES = ["owner", "admin", "manager", "qa"];

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

  // Attach a signed agreement that has no matter recorded (legacy, from
  // before signings carried their claim) to ONE matter on the same file, so
  // QA can count it. Deliberate and recorded: nothing guesses a sibling.
  // { op: "associate_evidence", lead_id, claim_id, submission_id? | retainer_id? }
  // submission_id is the esign_submissions row id.
  if (b.op === "associate_evidence") {
    if (!ASSOCIATE_ROLES.includes(u.role) || !can(u.role, u.perm_overrides, "intake.qa")) {
      return NextResponse.json({ error: "Only QA, a manager, an admin or the owner can attach an agreement to a matter." }, { status: 403 });
    }
    const leadId = String(b.lead_id || "");
    const claimId = String(b.claim_id || "");
    const subId = b.submission_id ? String(b.submission_id) : "";
    const retId = b.retainer_id ? String(b.retainer_id) : "";
    if (!leadId || !claimId) return NextResponse.json({ error: "lead_id and claim_id required" }, { status: 400 });
    if (!!subId === !!retId) return NextResponse.json({ error: "Pick one agreement to attach." }, { status: 400 });
    const m = await resolveMatter(admin, leadId, { claimId });
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status });

    const table = subId ? "esign_submissions" : "retainers";
    const rowId = subId || retId;
    const { data: row, error: rErr } = await admin.from(table).select("id, lead_id, claim_id").eq("id", rowId).maybeSingle();
    if (rErr) return NextResponse.json({ error: `Could not read that agreement: ${rErr.message}` }, { status: 500 });
    if (!row) return NextResponse.json({ error: "That agreement no longer exists. Refresh the file." }, { status: 404 });
    if (row.lead_id !== leadId) return NextResponse.json({ error: "That agreement is not on this file. Nothing was attached." }, { status: 400 });
    if (row.claim_id === claimId) return NextResponse.json({ ok: true, already: true });
    if (row.claim_id) return NextResponse.json({ error: "That agreement already belongs to another matter on this file. Nothing was attached." }, { status: 409 });

    // Only a row that still has no matter changes, so two reviewers cannot
    // both attach it.
    const { data: hit, error: uErr } = await admin.from(table).update({ claim_id: claimId })
      .eq("id", rowId).eq("lead_id", leadId).is("claim_id", null).select("id");
    if (uErr) return NextResponse.json({ error: `The agreement was not attached: ${uErr.message}` }, { status: 500 });
    if (!hit?.length) return NextResponse.json({ error: "Someone attached that agreement a moment ago. Refresh the file and check which matter it is on." }, { status: 409 });

    await recordAudit({
      firm_id: m.claim.firm_id, lead_id: leadId, claim_id: claimId, actor: u.uid, actor_name: u.full_name ?? "QA",
      category: "retainer",
      description: `Attached ${subId ? "a signed e-sign agreement" : "a signed retainer"} to this matter for QA. It had no matter recorded.`,
      meta: { kind: subId ? "esign" : "retainer", row_id: rowId, claim_id: claimId },
    });
    return NextResponse.json({ ok: true });
  }

  // Submit a QA review + route the file.
  if (b.op === "submit") {
    const agentReady = b.agent_ready === true && u.role === "agent" && can(u.role, u.perm_overrides, "claims.status");
    // Routing a file takes the QA capability — the role defaults, honoring an
    // explicit per-user grant or denial (Astra round 5: an explicit
    // intake.qa=false was ignored by the hardcoded role list).
    if (u.role === "firm" || (!agentReady && !can(u.role, u.perm_overrides, "intake.qa"))) {
      return NextResponse.json({ error: "Only QA, a manager, an admin or the owner can route a file." }, { status: 403 });
    }
    const { lead_id, claim_id } = b;
    if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    // The review is about ONE matter. A named claim must belong to this lead;
    // unnamed defaults to the newest claim — and everything below (track,
    // evidence, the status change) is bound to that matter, never a sibling
    // (Astra rounds 4-5).
    const { data: allClaims } = await admin.from("claims")
      .select("id, status, claim_type, created_by, campaign_id, firm_id, created_at, answers")
      .eq("lead_id", lead_id).order("created_at", { ascending: false });
    const claim = claim_id
      ? (allClaims ?? []).find((c: any) => c.id === claim_id)
      : (allClaims ?? [])[0];
    if (claim_id && !claim) return NextResponse.json({ error: "That claim is not on this file. Refresh and pick the matter again." }, { status: 400 });
    if (!claim) return NextResponse.json({ error: "This file has no claim to review." }, { status: 400 });
    if (b.decision === "decline" && claim.claim_type === "mva") {
      const campaign = await admin.from("campaigns").select("name").eq("id", claim.campaign_id).eq("firm_id", claim.firm_id).maybeSingle();
      if (campaign.error) return NextResponse.json({ error: "Could not verify the campaign." }, { status: 503 });
      if (campaign.data?.name === "INNO MVA") return NextResponse.json({ error: "Use Decline signed file / request drop letter at the top of this file. It records the bad sign and emails the firm." }, { status: 409 });
    }
    if (agentReady) {
      if (claim.claim_type !== "mva" || b.decision !== "approve"
        || [b.g_qa_pass, b.g_esign, b.g_criteria].some((grade: unknown) => grade !== "green")
        || b.confirm_intake !== true || b.confirm_signed_packet !== true || b.confirm_criteria !== true) {
        return NextResponse.json({ error: "Confirm all three INNO MVA file checks before marking your own file ready." }, { status: 403 });
      }
      const { data: campaign } = await admin.from("campaigns").select("name, firm_id, firms(slug)").eq("id", claim.campaign_id).maybeSingle();
      const campaignFirm = Array.isArray(campaign?.firms) ? campaign.firms[0] : campaign?.firms;
      if (campaign?.name !== "INNO MVA" || campaign.firm_id !== claim.firm_id || campaignFirm?.slug !== "tmp") return NextResponse.json({ error: "This agent handoff is only available for INNO MVA." }, { status: 403 });
      const { data: ownCall, error: callErr } = await sb.from("intake_calls").select("id")
        .eq("lead_id", lead_id).eq("claim_id", claim.id).eq("agent_id", u.uid)
        .eq("disposition", "signed").not("ended_at", "is", null).limit(1).maybeSingle();
      if (callErr || !ownCall) return NextResponse.json({ error: "End and disposition your own signed call before reviewing this file for firm delivery." }, { status: 403 });
      const missing = missingRequiredMvaIntake(claim.answers?.mva_call);
      if (missing.length) return NextResponse.json({ error: `Complete the required intake answers before firm delivery: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? `, and ${missing.length - 5} more` : ""}.`, missing }, { status: 409 });
      const { data: reviewed, error: reviewErr } = await sb.from("esign_submissions")
        .select("id").eq("lead_id", lead_id).eq("claim_id", claim.id).eq("status", "completed")
        .not("agent_reviewed_at", "is", null).limit(1).maybeSingle();
      if (reviewErr || !reviewed) return NextResponse.json({ error: "Open and approve the client-signed packet, including HIPAA/HITECH, and complete the office signer step first." }, { status: 409 });
    }

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
    // the signed track, approving requires THIS matter's own complete,
    // durable agreement (Astra round 7b, #58): see matterEvidence below. A
    // sibling's signature never signs this one, and unattached legacy
    // evidence on a file with several matters is attached on purpose first.
    if (b.decision === "approve" && signed) {
      const ev = await matterEvidence(admin, lead_id, claim.id);
      if (!ev.ok) {
        return NextResponse.json({
          error: ev.error,
          ...(ev.needs_association ? { needs_association: true, candidates: ev.candidates ?? [], claim_id: claim.id } : {}),
        }, { status: ev.status });
      }
    }
    if (agentReady && ["signed_approved", "delivered", "retained"].includes(claim.status)) {
      const { data: latestReview, error: latestReviewErr } = await admin.from("qa_reviews")
        .select("reviewer, decision").eq("claim_id", claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latestReviewErr) return NextResponse.json({ error: "Could not confirm the latest file review. Nothing was sent." }, { status: 503 });
      if (latestReview?.reviewer === u.uid && latestReview?.decision === "approve") {
        return NextResponse.json({ ok: true, already: true, status: claim.status });
      }
    }

    // Record the QA review. The review of record MUST write before the file
    // moves: a routed file with no stored review is a false audit trail
    // (Astra round 5).
    const { error: revErr } = await admin.from("qa_reviews").insert({
      lead_id, claim_id: claim.id, firm_id: claim.firm_id, reviewer: u.uid, reviewer_name: u.full_name ?? "User",
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
    const res = agentReady && ["signed_approved", "delivered", "retained"].includes(claim.status)
      ? { ok: true as const }
      : await setClaimStatusForLeads({
      leadIds: [lead_id], claimIds: [claim.id], status: nextStatus, dqReasonKey: b.dq_reason_key ?? null,
      actorId: u.uid, actorName: u.full_name ?? "QA",
      suppressAutoDelivery: agentReady,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await recordAudit({
      firm_id: claim.firm_id, lead_id, claim_id: claim.id, actor: u.uid, actor_name: u.full_name ?? "QA",
      category: "status", description: agentReady ? "Agent confirmed their own signed INNO MVA file is ready for firm delivery." : `QA ${b.decision}${b.decision === "decline" ? " (drop letter)" : ""}.`,
      meta: { decision: b.decision, gates: { g_qa_pass: b.g_qa_pass, g_esign: b.g_esign, g_criteria: b.g_criteria } },
    });

    return NextResponse.json({ ok: true, status: agentReady && ["signed_approved", "delivered", "retained"].includes(claim.status) ? claim.status : nextStatus,
      ...("deliveryWarning" in res && res.deliveryWarning ? { delivery_warning: res.deliveryWarning } : {}) });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

// ---------------------------------------------------------------------------
// QA evidence for ONE matter (Astra round 7b, #58). Approving a signed-track
// claim needs, for THAT claim:
//   * a DocuSeal agreement of this matter (stamped with the claim, or a legacy
//     unstamped row only when this is the file's one matter on a compatible
//     campaign, per matterRowsFilter) that is COMPLETED (both signers, not
//     just the PNC), not voided, and whose stored packet is whole
//     (packetShort: every PDF and the certificate actually in storage); or
//   * an in-house or legacy retainer attached to this claim
//     (retainers.claim_id) that is signed with a signed PDF actually stored.
// Signed agreements with NO matter recorded that do not count here are
// offered back as candidates to attach on purpose (needs_association).
// A read failure is an error, never "no evidence" and never "evidence".
// ---------------------------------------------------------------------------
const SUB_COLS = "id, lead_id, claim_id, campaign_id, firm_id, provider, status, pax_index, submission_id, completed_pdf_path, cert_pdf_path, doc_count, voided_at, replacement_requested_at, replacement_of, agent_reviewed_at, template_key, signer_name, signed_at, completed_at, created_at";
const RET_COLS = "id, lead_id, claim_id, status, completed_pdf_url, signer_name, signed_at, created_at";

type EvidenceCandidate = { kind: "esign" | "retainer"; id: string; label: string; signed_at: string | null };
type Evidence =
  | { ok: true; kind: "esign" | "retainer"; id: string }
  | { ok: false; status: number; error: string; needs_association?: boolean; candidates?: EvidenceCandidate[] };

const isVoided = (s: any) => s.status === "voided" || !!s.voided_at;
const dayOf = (iso: any) => (iso ? String(iso).slice(0, 10) : "");

async function packetWhole(admin: any, row: any): Promise<boolean> {
  try { return !(await packetShort(admin, row)); } catch { return false; }
}

/** Is a signed PDF for this retainer really stored? The in-house signer
 *  keeps it in our bucket (checked as an object, not a pointer); a
 *  provider-completed retainer (SignWell) keeps it at the provider. */
async function retainerPdfStored(admin: any, r: any): Promise<{ stored: boolean } | { error: string }> {
  const { data: sd, error } = await admin.from("signable_documents").select("id, completed_pdf_path")
    .eq("retainer_id", r.id).eq("status", "signed").not("completed_pdf_path", "is", null);
  if (error) return { error: `Could not read the retainer's signed copy: ${error.message}` };
  for (const s of sd ?? []) {
    const p = String(s.completed_pdf_path);
    const cut = p.lastIndexOf("/");
    const folder = cut > 0 ? p.slice(0, cut) : "";
    const name = p.slice(cut + 1);
    try {
      const { data: list, error: lErr } = await admin.storage.from(SIGNED_BUCKET).list(folder, { limit: 100, search: name });
      if (lErr) return { error: `Could not check the retainer's stored PDF: ${lErr.message}` };
      if ((list ?? []).some((f: any) => f?.name === name)) return { stored: true };
    } catch (e: any) {
      return { error: `Could not check the retainer's stored PDF: ${String(e?.message || e)}` };
    }
  }
  return { stored: /^https?:\/\//i.test(String(r.completed_pdf_url || "")) };
}

async function matterEvidence(admin: any, leadId: string, claimId: string): Promise<Evidence> {
  const m = await resolveMatter(admin, leadId, { claimId });
  if (!m.ok) return { ok: false, status: m.status, error: m.error };

  // 1. This matter's DocuSeal agreements, newest first.
  const { data: subs, error: sErr } = await admin.from("esign_submissions").select(SUB_COLS)
    .eq("lead_id", leadId).eq("provider", "docuseal").or(matterRowsFilter(m))
    .order("created_at", { ascending: false });
  if (sErr) return { ok: false, status: 500, error: `Could not read this matter's agreements: ${sErr.message}` };
  const releaseProblem = signingReleaseGate(subs ?? []);
  if (releaseProblem) return { ok: false, status: 409, error: releaseProblem };
  const activeCurrent = (subs ?? []).find((s: any) => !isVoided(s));
  const correctedCurrent = activeCurrent?.replacement_of ? activeCurrent : null;
  let clientOnly = false, short = false, voided = false;
  for (const s of subs ?? []) {
    if (isVoided(s)) { voided = true; continue; }
    // A newer corrected packet supersedes any older completed packet. The
    // old signed evidence remains visible, but can never authorize QA.
    if (correctedCurrent && s.id !== correctedCurrent.id) continue;
    if (s.status === "signed") { clientOnly = true; continue; }
    if (s.status !== "completed") continue;
    if (!(await packetWhole(admin, s))) { short = true; continue; }
    return { ok: true, kind: "esign", id: s.id };
  }
  if (correctedCurrent) return { ok: false, status: 409,
    error: short
      ? "The corrected agreement's signed PDF or certificate is missing. Recover its complete packet before QA approval."
      : "The corrected agreement has not produced a complete signed packet. The original cannot authorize QA approval." };

  // 2. A retainer attached to this claim, signed, with its PDF stored.
  const { data: rets, error: rErr } = await admin.from("retainers").select(RET_COLS)
    .eq("lead_id", leadId).order("created_at", { ascending: false });
  if (rErr) return { ok: false, status: 500, error: `Could not read this file's retainers: ${rErr.message}` };
  let retainerNoPdf = false;
  for (const r of rets ?? []) {
    if (r.claim_id !== claimId || r.status !== "signed") continue;
    const pdf = await retainerPdfStored(admin, r);
    if ("error" in pdf) return { ok: false, status: 500, error: pdf.error };
    if (pdf.stored) return { ok: true, kind: "retainer", id: r.id };
    retainerNoPdf = true;
  }

  // 3. Complete signed agreements with no matter recorded that do not count
  // for this one: attach on purpose, never assumed.
  const candidates: EvidenceCandidate[] = [];
  const { data: loose, error: lErr } = await admin.from("esign_submissions").select(SUB_COLS)
    .eq("lead_id", leadId).eq("provider", "docuseal").is("claim_id", null).eq("status", "completed")
    .order("created_at", { ascending: false });
  if (lErr) return { ok: false, status: 500, error: `Could not read this file's agreements: ${lErr.message}` };
  for (const s of loose ?? []) {
    if (isVoided(s) || rowBelongsToMatter(s, m)) continue;
    if (!(await packetWhole(admin, s))) continue;
    const when = dayOf(s.completed_at || s.signed_at);
    candidates.push({
      kind: "esign", id: s.id, signed_at: s.completed_at || s.signed_at || null,
      label: `${agreementName(s.template_key) || "E-sign"} agreement signed by ${s.signer_name || "the PNC"}${when ? ` on ${when}` : ""}`,
    });
  }
  for (const r of rets ?? []) {
    if (r.claim_id || r.status !== "signed") continue;
    const pdf = await retainerPdfStored(admin, r);
    if ("error" in pdf) return { ok: false, status: 500, error: pdf.error };
    if (!pdf.stored) continue;
    const when = dayOf(r.signed_at);
    candidates.push({
      kind: "retainer", id: r.id, signed_at: r.signed_at || null,
      label: `Retainer signed by ${r.signer_name || "the PNC"}${when ? ` on ${when}` : ""}`,
    });
  }
  if (candidates.length) {
    return {
      ok: false, status: 409, needs_association: true, candidates,
      error: m.sole
        ? "Cannot approve yet: the signed agreement on this file is not attached to this matter. Check it is the right one, attach it, then approve again."
        : "Cannot approve yet: this file has more than one matter and its signed agreement is not attached to any of them. Attach the one that belongs to this matter, then approve again.",
    };
  }

  if (short) return { ok: false, status: 400, error: "Cannot approve: this matter's agreement is complete, but its stored copy is not whole (a signed PDF or the certificate is missing). Open the agreement on the file so the missing pieces are recovered, then approve again." };
  if (clientOnly) return { ok: false, status: 400, error: "Cannot approve: the PNC signed, but the agreement is not complete yet. The intake side (DOB and SSN) still has to be finished." };
  if (retainerNoPdf) return { ok: false, status: 400, error: "Cannot approve: the retainer for this matter is marked signed, but no signed PDF is stored for it." };
  if (voided) return { ok: false, status: 400, error: "Cannot approve: this matter's agreement was voided. A new agreement has to be signed first." };
  return { ok: false, status: 400, error: "Cannot approve: no completed signing is on file for this matter. The e-sign gate is checked against the records, not the checkbox." };
}
