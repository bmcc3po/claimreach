import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { loadM6Lead, requireM6Session } from "@/lib/m6-scope";
import { m6CaseAccess, SECONDARY_INTERVIEW_DOC_TYPE } from "@/lib/m6";
export const runtime = "edge";

// Signed URL for the Secondary interview PDF (SSN/DOB). Same private
// case-docs bucket as every other file. Auth is the m6 session fence —
// not GET /api/documents, which signs every doc on a lead for any
// authenticated user who can SELECT the row.
//
// Failures return a generic JSON error. Never the PDF, never storage_path.

const DENY = { error: "That file is not available to you." };

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const q = new URL(req.url).searchParams;
  const leadId = q.get("lead_id") || "";
  const docId = q.get("id") || "";
  if (!leadId || !docId) {
    return NextResponse.json(DENY, { status: 404 });
  }

  const session = await requireM6Session(sb);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const lead = await loadM6Lead(
    sb, leadId, session.tmpFirmId,
    "id, firm_id, campaign, case_type, archived_at",
  );
  if (m6CaseAccess(session.actor, lead, session.tmpFirmId) !== "ok") {
    return NextResponse.json(DENY, { status: 404 });
  }

  const { data: doc } = await sb.from("case_documents")
    .select("id, storage_path, doc_type")
    .eq("id", docId)
    .eq("lead_id", leadId)
    .eq("firm_id", session.tmpFirmId)
    .eq("doc_type", SECONDARY_INTERVIEW_DOC_TYPE)
    .maybeSingle();
  if (!doc?.storage_path) {
    return NextResponse.json(DENY, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin()
    .storage.from("case-docs")
    .createSignedUrl(doc.storage_path, 120);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not open the interview." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
