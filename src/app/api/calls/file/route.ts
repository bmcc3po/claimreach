import { NextRequest, NextResponse } from "next/server";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import { loadStatuses } from "@/lib/claim-status";
import { resolveStatus, SIGNED_QA_RETURN_STATUS } from "@/lib/statuses";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter } from "@/lib/matter";
import { loadLawRulerProvenance } from "@/lib/lawruler-recovery";
import { readPendingSendAttempt } from "@/lib/mva-call/send-attempt";

export const runtime = "edge";

// GET /api/calls/file?lead_id=
// The File tab on the desktop App: status, agreements, notes, documents and
// history for one file. Loaded when the tab opens, so the call screen itself
// stays fast.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leadId = new URL(req.url).searchParams.get("lead_id") || "";
  const context = await resolveSigningMatter(sb, leadId, { claimId: new URL(req.url).searchParams.get("claim_id"), allowArchived: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { matter } = context;
  const { data: lead } = await sb.from("leads")
    .select("id, firm_id, lead_no, claimant_name, first_name, last_name, campaign, created_at, marketing_source, lawruler_ref_no, lawruler_url, origin, phone, home_phone, work_phone, email, mail_addr1, mail_city, mail_state, mail_zip, firms(name)")
    .eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const [esignRes, notesRaw, auditRes, docsRes, staffRes, statuses] = await Promise.all([
    sb.from("esign_submissions").select("id, template_key, signer_name, injured_name, via, status, pax_index, doc_count, sent_at, opened_at, signed_at, completed_at, completed_pdf_path, cert_pdf_path, error, voided_at, void_reason, replacement_requested_at, replacement_requested_by, replacement_reason, replacement_of, agent_reviewed_at, agent_reviewed_by")
      .eq("lead_id", leadId).or(matterRowsFilter(matter)).order("created_at", { ascending: false }).limit(20),
    loadFileNotes(sb, leadId, lead.firm_id, matter.claim.id),
    sb.from("audit_log").select("id, claim_id, created_at, actor_name, category, description, meta").eq("lead_id", leadId)
      // The real column owns the association; older writers used metadata.
      // Only rows with neither association are shared across the file.
      .or(`claim_id.eq.${matter.claim.id},and(claim_id.is.null,or(meta->>claim_id.eq.${matter.claim.id},meta->>claim_id.is.null))`).order("created_at", { ascending: false }).limit(100),
    sb.from("case_documents").select("id, claim_id, file_name, doc_type, storage_path, created_at, uploaded_by_name").eq("lead_id", leadId)
      .or(`claim_id.eq.${matter.claim.id},claim_id.is.null`).order("created_at", { ascending: false }).limit(50),
    sb.from("app_users").select("id, full_name"),
    loadStatuses(),
  ]);
  const readError = [esignRes, auditRes, docsRes, staffRes].find((r: any) => r.error)?.error;
  if (readError) return NextResponse.json({ error: `The file could not load completely: ${readError.message}` }, { status: 500 });

  const nameOf = new Map((staffRes.data ?? []).map((u: any) => [u.id, u.full_name || ""]));
  const admin = supabaseAdmin();
  const pendingSend = await readPendingSendAttempt(admin, matter.claim.id);
  const docs = await Promise.all((docsRes.data ?? []).map(async (d: any) => {
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(d.storage_path, 600);
    return { id: d.id, name: d.file_name, type: d.doc_type, scope: d.claim_id ? "This matter" : "Shared file document", at: d.created_at, by: d.uploaded_by_name, url: signed?.signedUrl ?? null };
  }));
  const st = matter.claim.status;
  const qaReturn = [SIGNED_QA_RETURN_STATUS, "signed_qa"].includes(st || "") ? await sb.from("qa_reviews").select("id, decision, agent_note, created_at")
    .eq("lead_id", leadId).eq("claim_id", matter.claim.id).order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
  if (qaReturn?.error) return NextResponse.json({ error: "The QA feedback could not load. Refresh before resubmitting." }, { status: 503 });
  const qaRetry = st === "signed_qa" && qaReturn?.data?.decision === "wip" ? await sb.from("audit_log").select("id, meta")
    .eq("lead_id", leadId).eq("claim_id", matter.claim.id).eq("actor", me.id).eq("meta->>action", "qa_resubmit")
    .eq("meta->>qa_review_id", qaReturn.data.id).eq("meta->>completed", "false").order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
  if (qaRetry?.error) return NextResponse.json({ error: "The QA resubmission history could not load. Refresh before continuing." }, { status: 503 });
  const imported = await loadLawRulerProvenance(sb, leadId, matter.claim.id);

  return NextResponse.json({
    lead: {
      lead_no: lead.lead_no, name: lead.claimant_name, campaign: matter.claim.campaign || lead.campaign, opened: lead.created_at,
      archived: !!context.lead.archived_at,
      source: lead.marketing_source, attorney: (lead as any).firms?.name ?? null,
      lawruler: lead.lawruler_ref_no, lawruler_url: lead.lawruler_url, origin: lead.origin,
    },
    // The traditional contact card: what the record holds right now, editable
    // from the console so a callback or a report reads the real thing
    // (Brett, Sep 28).
    contact: {
      first_name: lead.first_name || "", last_name: lead.last_name || "", claimant_name: lead.claimant_name || "",
      phone: lead.phone || "", email: lead.email || "",
      home_phone: (lead as any).home_phone || "", work_phone: (lead as any).work_phone || "",
      mail_addr1: lead.mail_addr1 || "", mail_city: lead.mail_city || "",
      mail_state: lead.mail_state || "", mail_zip: lead.mail_zip || "",
    },
    status: st ? { key: st, label: resolveStatus(st, statuses).label, tone: resolveStatus(st, statuses).tone } : null,
    claim_id: matter.claim.id,
    qa_return: qaReturn?.data?.decision === "wip" ? { id: qaReturn.data.id, note: qaReturn.data.agent_note || "Review QA's requested corrections before resubmitting.", at: qaReturn.data.created_at } : null,
    qa_resubmit_retry: qaRetry?.data ? { request_id: qaRetry.data.id, qa_review_id: qaReturn!.data!.id } : null,
    send_attempt: pendingSend.ok ? pendingSend.attempt : null,
    send_check_error: pendingSend.ok ? null : pendingSend.error,
    imported,
    agreements: (esignRes.data ?? []).map((a: any) => ({
      id: a.id, name: agreementName(a.template_key), signer: a.signer_name, injured: a.injured_name, via: a.via, status: a.status, pax: a.pax_index, doc_count: a.doc_count,
      voided: a.voided_at, void_reason: a.void_reason,
      replacement_requested_at: a.replacement_requested_at, replacement_reason: a.replacement_reason,
      replacement_requested_by: a.replacement_requested_by ? nameOf.get(a.replacement_requested_by) || "Staff" : null,
      replacement_of: a.replacement_of,
      agent_reviewed_at: a.agent_reviewed_at,
      agent_reviewed_by: a.agent_reviewed_by ? nameOf.get(a.agent_reviewed_by) || "Staff" : null,
      can_void: ["owner", "admin"].includes(me.role) && a.status !== "voided" && ["sent", "opened", "failed", "declined", "expired", "signed", "completed"].includes(a.status),
      sent: a.sent_at, opened: a.opened_at, signed: a.signed_at || a.completed_at, error: a.error,
      signed_url: a.completed_pdf_path ? `/api/calls/esign/doc/${a.id}/signed` : null,
      client_signed_url: ["signed", "voided"].includes(a.status) && a.signed_at ? `/api/calls/esign/doc/${a.id}/client` : null,
      cert_url: a.cert_pdf_path ? `/api/calls/esign/doc/${a.id}/cert` : null,
    })),
    notes: mergeFileNotes(notesRaw.notes, notesRaw.deskNotes, nameOf).slice(0, 60),
    history: auditRes.data ?? [],
    docs,
    classic: true,
  });
}
