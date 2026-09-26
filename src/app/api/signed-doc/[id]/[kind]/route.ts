import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import {
  SIGNED_BUCKET, SIGNED_URL_SECONDS, isSignedKind, mayOpenSignedDoc,
} from "@/lib/signed-docs";
export const runtime = "edge";

// GET /api/signed-doc/<signable id>/<signed|cert>
// Checks who is asking, then redirects to a storage URL that expires in
// minutes. The bucket itself is private. See src/lib/signed-docs.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!isSignedKind(kind)) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });

  const admin = supabaseAdmin();
  const { data: doc, error } = await admin.from("signable_documents")
    .select("id, firm_id, signed_at, completed_pdf_path, cert_pdf_path")
    .eq("id", id).maybeSingle();
  if (error) {
    console.error(`signed-doc lookup failed for ${id}: ${error.message}`);
    return NextResponse.json({ error: "lookup failed" }, { status: 500, headers: noStore });
  }
  const path = doc ? (kind === "cert" ? doc.cert_pdf_path : doc.completed_pdf_path) : null;
  if (!doc || !path) return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore });

  const sb = await supabaseServer();
  const user = await gateUser(sb);
  const allowed = mayOpenSignedDoc({
    user: user ? { role: user.role, firmId: user.firmId } : null,
    internal: !!user && isInternalRole(user.role),
    docFirmId: doc.firm_id ?? null,
    signedAt: doc.signed_at ?? null,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: user ? "You do not have access to this document." : "Please sign in to view this document." },
      { status: user ? 403 : 401, headers: noStore },
    );
  }

  const { data: signed, error: sErr } = await admin.storage.from(SIGNED_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (sErr || !signed?.signedUrl) {
    console.error(`signed-doc url failed for ${path}: ${sErr?.message ?? "no url"}`);
    return NextResponse.json({ error: "Document is unavailable right now." }, { status: 502, headers: noStore });
  }
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: noStore });
}
