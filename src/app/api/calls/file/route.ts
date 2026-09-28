import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { loadFileNotes, mergeFileNotes } from "@/lib/file-notes";
import { loadStatuses } from "@/lib/claim-status";
import { resolveStatus } from "@/lib/statuses";

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
  const { data: lead } = await sb.from("leads")
    .select("id, firm_id, lead_no, claimant_name, campaign, created_at, marketing_source, lawruler_ref_no, lawruler_url, origin, phone, email, mail_addr1, mail_city, mail_state, mail_zip, firms(name)")
    .eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const [claimRes, esignRes, notesRaw, auditRes, docsRes, staffRes, statuses] = await Promise.all([
    sb.from("claims").select("id, status, dq_reason_key, created_at").eq("lead_id", leadId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    sb.from("esign_submissions").select("id, signer_name, injured_name, via, status, pax_index, sent_at, opened_at, signed_at, completed_at, completed_pdf_path, cert_pdf_path, error")
      .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20),
    loadFileNotes(sb, leadId, lead.firm_id),
    sb.from("audit_log").select("id, created_at, actor_name, category, description").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
    sb.from("case_documents").select("id, file_name, doc_type, storage_path, created_at, uploaded_by_name").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
    sb.from("app_users").select("id, full_name"),
    loadStatuses(),
  ]);

  const nameOf = new Map((staffRes.data ?? []).map((u: any) => [u.id, u.full_name || ""]));
  const admin = supabaseAdmin();
  const docs = await Promise.all((docsRes.data ?? []).map(async (d: any) => {
    const { data: signed } = await admin.storage.from("case-docs").createSignedUrl(d.storage_path, 600);
    return { id: d.id, name: d.file_name, type: d.doc_type, at: d.created_at, by: d.uploaded_by_name, url: signed?.signedUrl ?? null };
  }));
  const st = claimRes.data?.status ?? null;

  return NextResponse.json({
    lead: {
      lead_no: lead.lead_no, name: lead.claimant_name, campaign: lead.campaign, opened: lead.created_at,
      source: lead.marketing_source, attorney: (lead as any).firms?.name ?? null,
      lawruler: lead.lawruler_ref_no, lawruler_url: lead.lawruler_url, origin: lead.origin,
    },
    // The traditional contact card: what the record holds right now, editable
    // from the console so a callback or a report reads the real thing
    // (Brett, Sep 28).
    contact: {
      phone: lead.phone || "", email: lead.email || "",
      mail_addr1: lead.mail_addr1 || "", mail_city: lead.mail_city || "",
      mail_state: lead.mail_state || "", mail_zip: lead.mail_zip || "",
    },
    status: st ? { key: st, label: resolveStatus(st, statuses).label, tone: resolveStatus(st, statuses).tone } : null,
    claim_id: claimRes.data?.id ?? null,
    agreements: (esignRes.data ?? []).map((a: any) => ({
      id: a.id, signer: a.signer_name, injured: a.injured_name, via: a.via, status: a.status, pax: a.pax_index,
      sent: a.sent_at, opened: a.opened_at, signed: a.signed_at || a.completed_at, error: a.error,
      signed_url: a.completed_pdf_path ? `/api/calls/esign/doc/${a.id}/signed` : null,
      cert_url: a.cert_pdf_path ? `/api/calls/esign/doc/${a.id}/cert` : null,
    })),
    notes: mergeFileNotes(notesRaw.notes, notesRaw.deskNotes, nameOf).slice(0, 60),
    history: auditRes.data ?? [],
    docs,
    classic: ["owner", "admin", "manager"].includes(me.role),
  });
}
