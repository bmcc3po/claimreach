import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { getMatterAgreement, resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { readPendingSendAttempt } from "@/lib/mva-call/send-attempt";
import { queueFlagsFor, setClaimStatusForLeads } from "@/lib/claim-status";
import { SIGNED_QA_RETURN_STATUS } from "@/lib/statuses";

export const runtime = "edge";
const fail = (error: string, status = 409) => NextResponse.json({ error }, { status });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A returned signed matter can re-enter QA, never approve or deliver itself.
 * The request's audit row is durable BEFORE the status write; retries reconcile
 * that same row/queue without re-running signing or status-change side effects. */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return fail("unauthorized", 401);
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || ""), claimId = String(b?.claim_id || "");
  const requestId = String(b?.request_id || ""), reviewId = String(b?.qa_review_id || "");
  if (![leadId, claimId, requestId, reviewId].every(id => uuid.test(id))) return fail("Name the exact file, matter and QA return before resubmitting.", 400);
  const context = await resolveSigningMatter(sb, leadId, { claimId });
  if (!context.ok) return fail(context.error, context.status);
  const { lead, matter } = context;
  const [campaigns, firm, current, review, catalog] = await Promise.all([
    sb.from("campaigns").select("id").eq("firm_id", lead.firm_id).eq("name", "INNO MVA").eq("case_type", "mva").eq("active", true),
    sb.from("firms").select("slug").eq("id", lead.firm_id).maybeSingle(),
    sb.from("claims").select("status, updated_at").eq("id", claimId).eq("lead_id", leadId).maybeSingle(),
    sb.from("qa_reviews").select("id, decision").eq("lead_id", leadId).eq("claim_id", claimId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("statuses").select("*"),
  ]);
  if ([campaigns, firm, current, review, catalog].some(r => r.error)) return fail("Could not verify the current QA return. Nothing was moved.", 503);
  const pilot = campaigns.data?.length === 1 ? campaigns.data[0] : null;
  if (!pilot || firm.data?.slug !== "tmp" || lead.case_type !== "mva" || matter.claim.claim_type !== "mva"
    || lead.campaign_id !== pilot.id || matter.claim.campaign_id !== pilot.id || matter.claim.firm_id !== lead.firm_id) return fail("This action is available only for active INNO MVA matters.", 403);
  if (review.data?.id !== reviewId || review.data?.decision !== "wip") return fail("QA's latest decision changed. Refresh and review its feedback before resubmitting.");
  const next = catalog.data?.find((s: any) => s.key === "signed_qa" && s.active !== false && s.phase === "in_qa" && !s.unlocks_firm);
  if (!next) return fail("The signed QA queue is unavailable. Nothing was moved.", 503);
  const admin = supabaseAdmin();
  const previous = await admin.from("audit_log").select("id, lead_id, claim_id, actor, meta").eq("id", requestId).maybeSingle();
  if (previous.error) return fail("Could not verify the resubmission history. Nothing was moved.", 503);
  const prior = previous.data;
  let agreementId = prior?.meta?.agreement_id || null;
  if (prior && (prior.lead_id !== leadId || prior.claim_id !== claimId || prior.actor !== me.id || prior.meta?.action !== "qa_resubmit" || prior.meta?.qa_review_id !== reviewId)) return fail("This resubmission request belongs to a different action.");
  const finishAudit = async (reconciled = false) => {
    const result = await admin.from("audit_log").update({ description: reconciled ? "Confirmed corrected signed matter is back in the QA queue." : "Resubmitted corrected signed matter to QA.",
      meta: { action: "qa_resubmit", qa_review_id: reviewId, agreement_id: agreementId, claim_id: claimId, status: "signed_qa", completed: true, reconciled } })
      .eq("id", requestId).eq("actor", me.id).select("id").maybeSingle();
    return !result.error && !!result.data;
  };
  if (current.data?.status === "signed_qa" && prior) {
    // A status write may have committed before a queue/audit error or a lost
    // response. Repair only its derived flags, never replay the transition.
    const siblings = await admin.from("claims").select("status").eq("lead_id", leadId);
    if (siblings.error) return fail("The matter is in QA, but its queue could not be refreshed. Retry this action.", 503);
    const repaired = await sb.from("leads").update({ ...queueFlagsFor((siblings.data || []).map((c: any) => c.status), catalog.data || []), qa_entered_at: current.data.updated_at, stage: "intake_complete" }).eq("id", leadId).select("id").maybeSingle();
    if (repaired.error || !repaired.data || (!prior.meta?.completed && !(await finishAudit(true)))) return fail("The matter is in QA, but its queue/history needs another retry.", 503);
    return NextResponse.json({ ok: true, already: true, status: "signed_qa" });
  }
  if (current.data?.status !== SIGNED_QA_RETURN_STATUS || !current.data.updated_at || prior?.meta?.completed) return fail("Only the current signed file returned by QA can be resubmitted. Refresh this file.");
  const pending = await readPendingSendAttempt(admin, claimId);
  if (!pending.ok) return fail(pending.error, pending.status);
  if (pending.attempt) return fail("An agreement send is still being verified. Resolve that send before resubmitting.");
  const selected = await getMatterAgreement(sb, lead, matter);
  if (!selected.ok) return fail(selected.error, selected.status);
  const agreement = selected.row;
  agreementId = agreement?.id || null;
  if (!agreement || !["signed", "completed"].includes(agreement.status) || !agreement.signed_at || agreement.voided_at || agreement.replacement_requested_at) return fail("The current agreement must be signed. A voided, replaced or unsigned agreement cannot return to QA; imported files need their signed agreement verified first.");
  if (!agreement.agent_reviewed_at) return fail("Review the current signed agreement in File before resubmitting to QA.");
  if (!prior) {
    const saved = await admin.from("audit_log").insert({ id: requestId, firm_id: lead.firm_id, lead_id: leadId, claim_id: claimId, actor: me.id, actor_name: me.name || "Agent", category: "qa",
      description: "Requested resubmission of corrected signed matter to QA.", meta: { action: "qa_resubmit", qa_review_id: reviewId, agreement_id: agreement.id, claim_id: claimId, completed: false } });
    if (saved.error) return fail("The resubmission request did not save. Retry; nothing was moved.", 503);
  }
  const result = await setClaimStatusForLeads({ leadIds: [leadId], claimIds: [claimId], status: "signed_qa", expectedStatus: SIGNED_QA_RETURN_STATUS,
    expectedUpdatedAt: current.data.updated_at, actorId: me.id, actorName: me.name || "Agent", statuses: catalog.data || [] },
    { db: sb, queueReadDb: admin, audit: async () => { /* durable request above; completed only after queue success */ } });
  if (!result.ok) return fail(result.error || "The matter was not resubmitted. Refresh before retrying.", result.claimIds?.length ? 503 : 409);
  if (!(await finishAudit())) return fail("The matter is in QA, but its history did not finish saving. Retry this action.", 503);
  return NextResponse.json({ ok: true, status: "signed_qa" });
}
