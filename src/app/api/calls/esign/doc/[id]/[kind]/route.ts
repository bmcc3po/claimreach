import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { SIGNED_BUCKET, SIGNED_URL_SECONDS } from "@/lib/signed-docs";

export const runtime = "edge";

// GET /api/calls/esign/doc/<esign submission id>/<signed|cert>
// The signed DocuSeal agreement (or its audit trail). Staff only; redirects to
// a storage link that expires in minutes. The bucket stays private.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (kind !== "signed" && kind !== "cert") return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "Please sign in to view this document." }, { status: 401, headers: noStore });
  // Read through RLS first so staff only open what they can already see.
  const { data: row } = await sb.from("esign_submissions").select("id, completed_pdf_path, cert_pdf_path").eq("id", id).maybeSingle();
  const path = row ? (kind === "cert" ? row.cert_pdf_path : row.completed_pdf_path) : null;
  if (!path) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });
  const { data: signed, error } = await supabaseAdmin().storage.from(SIGNED_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Document is unavailable right now." }, { status: 502, headers: noStore });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: noStore });
}
