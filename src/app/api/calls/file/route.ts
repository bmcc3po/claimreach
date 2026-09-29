import { NextRequest, NextResponse } from "next/server";
import { agreementName } from "@/lib/mva-call/agreement-names";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import { loadStatuses } from "@/lib/claim-status";
import { resolveStatus } from "@/lib/statuses";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter } from "@/lib/matter";
import { loadLawRulerProvenance } from "@/lib/lawruler-recovery";

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
    sb.from("esign_submissions").select("id, template_key, signer_name, injured_name, via, status, pax_index, sent_at, opened_at, signed_at, completed_at, completed_pdf_path, cert_pdf_path, error, voided_at, void_reason")
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
  const docs = await Promise.all((docsRes.data ?? []).map(async (d: any) => {
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(d.storage_path, 600);
    return { id: d.id, name: d.file_name, type: d.doc_type, scope: d.claim_id ? "This matter" : "Shared file document", at: d.created_at, by: d.uploaded_by_name, url: signed?.signedUrl ?? null };
  }));
  const st = matter.claim.status;
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
    imported,
    agreements: (esignRes.data ?? []).map((a: any) => ({
      id: a.id, name: agreementName(a.template_key), signer: a.signer_name, injured: a.injured_name, via: a.via, status: a.status, pax: a.pax_index,
      voided: a.voided_at, void_reason: a.void_reason,
      // Void: anyone for an unsigned one; owner/admin for a signed one.
      can_void: a.status !== "voided" && (["signed", "completed"].includes(a.status) ? ["owner", "admin"].includes(me.role) : ["sent", "opened", "failed", "declined", "expired"].includes(a.status)),
      sent: a.sent_at, opened: a.opened_at, signed: a.signed_at || a.completed_at, error: a.error,
      signed_url: a.completed_pdf_path ? `/api/calls/esign/doc/${a.id}/signed` : null,
      cert_url: a.cert_pdf_path ? `/api/calls/esign/doc/${a.id}/cert` : null,
    })),
    notes: mergeFileNotes(notesRaw.notes, notesRaw.deskNotes, nameOf).slice(0, 60),
    history: auditRes.data ?? [],
    docs,
    classic: true,
  });
}
